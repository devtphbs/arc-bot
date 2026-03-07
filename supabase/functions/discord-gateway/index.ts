import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Discord Gateway bot runner — connects to the Discord Gateway WebSocket,
// identifies with the bot token, sets presence, and listens for interactions.
// Edge Functions have a max execution time, so this establishes a connection
// and handles the HELLO + IDENTIFY + READY sequence, then responds to
// interactions via the REST API for the session duration.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { bot_id } = await req.json();
    if (!bot_id) {
      return new Response(JSON.stringify({ error: "bot_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: bot } = await adminClient.from("bots").select("*").eq("id", bot_id).eq("user_id", user.id).single();
    if (!bot) {
      return new Response(JSON.stringify({ error: "Bot not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = atob(bot.token_encrypted);

    // Load status config
    const { data: statusModule } = await adminClient.from("bot_modules").select("config").eq("bot_id", bot_id).eq("module_name", "custom_status").maybeSingle();
    const statusConfig = statusModule?.config as any || {};
    const presenceStatus = statusConfig.presence_status || "online";
    const activityType = statusConfig.activity_type || 0;
    const statusText = statusConfig.status_text || "";

    // Get Discord Gateway URL
    const gatewayRes = await fetch("https://discord.com/api/v10/gateway/bot", {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!gatewayRes.ok) {
      const err = await gatewayRes.json();
      return new Response(JSON.stringify({ error: `Discord Gateway error: ${err.message || "Invalid token or no gateway access"}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const gatewayData = await gatewayRes.json();
    const gatewayUrl = `${gatewayData.url}/?v=10&encoding=json`;

    // Connect to Discord Gateway via WebSocket
    const ws = new WebSocket(gatewayUrl);
    let heartbeatInterval: number | null = null;
    let sequence: number | null = null;
    let sessionId: string | null = null;
    let identified = false;

    const result = await new Promise<{ success: boolean; session_id?: string; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ success: false, error: "Gateway connection timed out" });
      }, 25000); // 25s timeout for edge function

      ws.onopen = () => {
        console.log("WebSocket connected to Discord Gateway");
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const { op, d, s, t } = data;

        if (s) sequence = s;

        switch (op) {
          case 10: {
            // HELLO — start heartbeating and identify
            const interval = d.heartbeat_interval;
            heartbeatInterval = setInterval(() => {
              ws.send(JSON.stringify({ op: 1, d: sequence }));
            }, interval) as unknown as number;

            // Send IDENTIFY
            const activities = statusText
              ? [{ name: statusText, type: activityType }]
              : [];

            ws.send(JSON.stringify({
              op: 2,
              d: {
                token,
                intents: 33281, // GUILDS | GUILD_MESSAGES | GUILD_MEMBERS | MESSAGE_CONTENT
                properties: {
                  os: "linux",
                  browser: "ArcBot",
                  device: "ArcBot",
                },
                presence: {
                  activities,
                  status: presenceStatus,
                  since: null,
                  afk: false,
                },
              },
            }));
            identified = true;
            break;
          }

          case 0: {
            // Dispatch event
            if (t === "READY") {
              sessionId = d.session_id;
              const guildCount = d.guilds?.length || 0;

              // Update bot info in database
              adminClient.from("bots").update({
                status: "online",
                guild_count: guildCount,
                bot_id: d.user?.id || bot.bot_id,
                bot_name: d.user?.username || bot.bot_name,
                bot_avatar: d.user?.avatar
                  ? `https://cdn.discordapp.com/avatars/${d.user.id}/${d.user.avatar}.png`
                  : bot.bot_avatar,
              }).eq("id", bot_id).then(() => {
                console.log("Bot status updated to online, guilds:", guildCount);
              });

              // Log it
              adminClient.from("bot_logs").insert({
                bot_id, user_id: user.id, level: "info", source: "gateway",
                message: `Bot connected to Discord Gateway. Session: ${sessionId}, Guilds: ${guildCount}`,
              });

              // Keep alive for a bit then resolve success
              // Edge functions have limited runtime, so we'll stay connected briefly
              // then cleanly close. The bot will appear online during this window.
              setTimeout(() => {
                clearTimeout(timeout);
                resolve({ success: true, session_id: sessionId || undefined });
              }, 3000);
            }

            if (t === "INTERACTION_CREATE") {
              // Handle slash command interactions
              handleInteraction(d, token, adminClient, bot_id, user.id);
            }

            if (t === "MESSAGE_CREATE") {
              // Handle leveling XP
              handleMessageForLeveling(d, adminClient, bot_id, user.id, token);
            }
            break;
          }

          case 11: {
            // Heartbeat ACK — all good
            break;
          }

          case 9: {
            // Invalid session
            clearTimeout(timeout);
            resolve({ success: false, error: "Invalid session — token may be invalid" });
            break;
          }
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: "WebSocket connection error" });
      };

      ws.onclose = (event) => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        console.log("Gateway closed:", event.code, event.reason);
      };
    });

    // Clean up
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    try { ws.close(); } catch (_) {}

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function handleInteraction(interaction: any, token: string, adminClient: any, botDbId: string, userId: string) {
  const { type, data: interData, id: interactionId, token: interactionToken } = interaction;

  // Type 2 = APPLICATION_COMMAND (slash commands)
  if (type === 2 && interData) {
    const commandName = interData.name;

    // Look up command in database
    const { data: command } = await adminClient
      .from("commands")
      .select("*")
      .eq("bot_id", botDbId)
      .eq("name", commandName)
      .maybeSingle();

    if (!command) {
      const { data: prefixCmd } = await adminClient
        .from("commands")
        .select("*")
        .eq("bot_id", botDbId)
        .eq("name", `/${commandName}`)
        .maybeSingle();

      if (!prefixCmd) {
        // Respond with unknown command
        await respondToInteraction(interactionId, interactionToken, {
          type: 4,
          data: { content: "❌ Command not found.", flags: 64 },
        });
        return;
      }
    }

    const cmd = command || null;
    if (cmd) {
      // Build response from command config
      const responses = (cmd.responses as any[]) || [];
      const embed = cmd.embed as any;
      let content = responses.length > 0 ? responses[0]?.content || "Command executed!" : "Command executed!";

      // Increment usage
      adminClient.from("commands").update({ uses: (cmd.uses || 0) + 1 }).eq("id", cmd.id);

      // Log
      adminClient.from("bot_logs").insert({
        bot_id: botDbId, user_id: userId, level: "info", source: "command",
        message: `/${commandName} used by ${interaction.member?.user?.username || "unknown"}`,
      });

      const responseData: any = { type: 4, data: { content } };

      if (embed) {
        responseData.data.embeds = [embed];
      }

      if (cmd.ephemeral) {
        responseData.data.flags = 64;
      }

      await respondToInteraction(interactionId, interactionToken, responseData);
    }
  }
}

async function respondToInteraction(interactionId: string, interactionToken: string, body: any) {
  await fetch(`https://discord.com/api/v10/interactions/${interactionId}/${interactionToken}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function handleMessageForLeveling(message: any, adminClient: any, botDbId: string, userId: string, token: string) {
  if (message.author?.bot) return;

  const { data: levelingConfig } = await adminClient
    .from("leveling_config")
    .select("*")
    .eq("bot_id", botDbId)
    .maybeSingle();

  if (!levelingConfig || !levelingConfig.enabled) return;

  const discordUserId = message.author.id;
  const guildId = message.guild_id;
  const xpPerMessage = levelingConfig.xp_per_message || 15;
  const cooldown = levelingConfig.xp_cooldown || 60;

  // Check cooldown
  const { data: existing } = await adminClient
    .from("user_levels")
    .select("*")
    .eq("bot_id", botDbId)
    .eq("user_id", discordUserId)
    .eq("guild_id", guildId)
    .maybeSingle();

  const now = Date.now();
  if (existing && existing.last_xp_at) {
    const lastXp = new Date(existing.last_xp_at).getTime();
    if (now - lastXp < cooldown * 1000) return;
  }

  const currentXp = (existing?.xp || 0) + xpPerMessage;
  const currentLevel = existing?.level || 1;

  const xpForLevel = (lvl: number) => 5 * lvl * lvl + 50 * lvl + 100;
  let newLevel = currentLevel;
  let remainingXp = currentXp;

  while (remainingXp >= xpForLevel(newLevel)) {
    remainingXp -= xpForLevel(newLevel);
    newLevel++;
  }

  const leveledUp = newLevel > currentLevel;

  if (existing) {
    await adminClient.from("user_levels").update({
      xp: currentXp,
      level: newLevel,
      last_xp_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await adminClient.from("user_levels").insert({
      bot_id: botDbId,
      user_id: discordUserId,
      guild_id: guildId,
      xp: currentXp,
      level: newLevel,
      last_xp_at: new Date().toISOString(),
    });
  }

  if (leveledUp) {
    const levelUpMessage = (levelingConfig.level_up_message || "Congratulations {user}, you reached level {level}!")
      .replace("{user}", `<@${discordUserId}>`)
      .replace("{level}", newLevel.toString())
      .replace("{xp}", currentXp.toString());

    await fetch(`https://discord.com/api/v10/channels/${message.channel_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: levelUpMessage }),
    });

    // Check for role rewards
    const roleRewards = (levelingConfig.role_rewards as any[]) || [];
    const reward = roleRewards.find((r: any) => r.level === newLevel);
    if (reward && reward.role_id && guildId) {
      await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${reward.role_id}`, {
        method: "PUT",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      });
    }
  }
}
