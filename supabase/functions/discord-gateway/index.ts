import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Load all modules for this bot
    const { data: allModules } = await adminClient.from("bot_modules").select("*").eq("bot_id", bot_id).eq("enabled", true);
    const modules: Record<string, any> = {};
    allModules?.forEach((m: any) => { modules[m.module_name] = m.config; });

    const statusConfig = modules.custom_status || {};
    const presenceStatus = statusConfig.presence_status || "online";
    const activityType = statusConfig.activity_type || 0;
    const statusText = statusConfig.status_text || "";

    // Load leveling config
    const { data: levelingConfig } = await adminClient.from("leveling_config").select("*").eq("bot_id", bot_id).maybeSingle();

    // Load commands
    const { data: commands } = await adminClient.from("commands").select("*").eq("bot_id", bot_id).eq("enabled", true);

    // Get Discord Gateway URL
    const gatewayRes = await fetch("https://discord.com/api/v10/gateway/bot", {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!gatewayRes.ok) {
      const err = await gatewayRes.json();
      return new Response(JSON.stringify({ error: `Discord Gateway error: ${err.message || "Invalid token"}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const gatewayData = await gatewayRes.json();
    const gatewayUrl = `${gatewayData.url}/?v=10&encoding=json`;

    const result = await connectGatewayWithFallback({
      gatewayUrl,
      token,
      presenceStatus,
      activityType,
      statusText,
      onDispatch: (eventType, payload) => {
        if (eventType === "INTERACTION_CREATE") {
          void handleInteraction(payload, token, adminClient, bot_id, user.id, commands || []);
        }

        if (eventType === "MESSAGE_CREATE" && !payload.author?.bot) {
          if (levelingConfig?.enabled) {
            void handleLeveling(payload, adminClient, bot_id, user.id, token, levelingConfig);
          }
          if (modules.auto_responder) {
            void handleAutoResponder(payload, token, modules.auto_responder);
          }
        }

        if (eventType === "GUILD_MEMBER_ADD" && modules.welcome) {
          void handleWelcome(payload, token, modules.welcome, true);
        }

        if (eventType === "GUILD_MEMBER_REMOVE" && modules.leave) {
          void handleWelcome(payload, token, modules.leave, false);
        }

        if (eventType === "MESSAGE_REACTION_ADD" && modules.reaction_roles) {
          void handleReactionRole(payload, token, modules.reaction_roles, "add");
        }

        if (eventType === "MESSAGE_REACTION_REMOVE" && modules.reaction_roles) {
          void handleReactionRole(payload, token, modules.reaction_roles, "remove");
        }
      },
    });

    if (result.success) {
      const guildCount = result.guild_count || 0;
      await adminClient.from("bots").update({
        status: "online",
        guild_count: guildCount,
        bot_id: result.user?.id || bot.bot_id,
        bot_name: result.user?.username || bot.bot_name,
        bot_avatar: result.user?.avatar
          ? `https://cdn.discordapp.com/avatars/${result.user.id}/${result.user.avatar}.png`
          : bot.bot_avatar,
      }).eq("id", bot_id);

      await adminClient.from("bot_logs").insert({
        bot_id,
        user_id: user.id,
        level: "info",
        source: "gateway",
        message: `Bot connected. Session: ${result.session_id}, Guilds: ${guildCount}, Intents: ${result.intents}`,
      });
    } else {
      await adminClient.from("bots").update({ status: "offline" }).eq("id", bot_id);
      await adminClient.from("bot_logs").insert({
        bot_id,
        user_id: user.id,
        level: "warn",
        source: "gateway",
        message: `Gateway connect failed: ${result.error || "Unknown error"}`,
      });
    }

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ─── Interaction Handler ────────────────────────────────────────
async function handleInteraction(interaction: any, token: string, adminClient: any, botDbId: string, userId: string, commands: any[]) {
  const { type, data: interData, id: interactionId, token: interactionToken } = interaction;

  if (type === 2 && interData) {
    const commandName = interData.name;
    const cmd = commands.find((c: any) => c.name === commandName || c.name === `/${commandName}`);

    if (!cmd) {
      await respond(interactionId, interactionToken, { type: 4, data: { content: "❌ Command not found.", flags: 64 } });
      return;
    }

    const responses = (cmd.responses as any[]) || [];
    const content = responses.length > 0 ? (responses[0]?.content || "Command executed!") : "Command executed!";

    // Increment usage
    adminClient.from("commands").update({ uses: (cmd.uses || 0) + 1 }).eq("id", cmd.id);
    adminClient.from("bot_logs").insert({ bot_id: botDbId, user_id: userId, level: "info", source: "command", message: `/${commandName} used by ${interaction.member?.user?.username || "unknown"}` });

    const responseData: any = { type: 4, data: { content } };
    if (cmd.embed) responseData.data.embeds = [cmd.embed];
    if (cmd.ephemeral) responseData.data.flags = 64;

    await respond(interactionId, interactionToken, responseData);
  }
}

async function respond(id: string, token: string, body: any) {
  await fetch(`https://discord.com/api/v10/interactions/${id}/${token}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Leveling Handler ───────────────────────────────────────────
async function handleLeveling(message: any, adminClient: any, botDbId: string, userId: string, token: string, config: any) {
  const discordUserId = message.author.id;
  const guildId = message.guild_id;
  if (!guildId) return;

  const xpPerMessage = config.xp_per_message || 15;
  const cooldown = config.xp_cooldown || 60;

  const { data: existing } = await adminClient.from("user_levels").select("*").eq("bot_id", botDbId).eq("user_id", discordUserId).eq("guild_id", guildId).maybeSingle();

  const now = Date.now();
  if (existing?.last_xp_at) {
    if (now - new Date(existing.last_xp_at).getTime() < cooldown * 1000) return;
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

  if (existing) {
    await adminClient.from("user_levels").update({ xp: currentXp, level: newLevel, last_xp_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await adminClient.from("user_levels").insert({ bot_id: botDbId, user_id: discordUserId, guild_id: guildId, xp: currentXp, level: newLevel, last_xp_at: new Date().toISOString() });
  }

  if (newLevel > currentLevel) {
    const msg = (config.level_up_message || "Congratulations {user}, you reached level {level}!")
      .replace("{user}", `<@${discordUserId}>`).replace("{level}", newLevel.toString()).replace("{xp}", currentXp.toString());

    await fetch(`https://discord.com/api/v10/channels/${message.channel_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg }),
    });

    const roleRewards = (config.role_rewards as any[]) || [];
    const reward = roleRewards.find((r: any) => r.level === newLevel);
    if (reward?.role_id && guildId) {
      await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${reward.role_id}`, {
        method: "PUT",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      });
    }
  }
}

// ─── Auto Responder Handler ─────────────────────────────────────
async function handleAutoResponder(message: any, token: string, config: any) {
  const responses = (config.responses as any[]) || [];
  const content = message.content || "";

  for (const r of responses) {
    if (!r.trigger || !r.response) continue;
    let matched = false;
    const msgText = r.ignoreCase ? content.toLowerCase() : content;
    const trigger = r.ignoreCase ? r.trigger.toLowerCase() : r.trigger;

    switch (r.matchType) {
      case "exact": matched = msgText === trigger; break;
      case "startsWith": matched = msgText.startsWith(trigger); break;
      case "regex": try { matched = new RegExp(r.trigger, r.ignoreCase ? "i" : "").test(content); } catch (_) {} break;
      default: matched = msgText.includes(trigger);
    }

    if (matched) {
      const reply = r.response
        .replace(/\{user\}/g, `<@${message.author.id}>`)
        .replace(/\{server\}/g, message.guild_id || "DM")
        .replace(/\{channel\}/g, `<#${message.channel_id}>`);

      await fetch(`https://discord.com/api/v10/channels/${message.channel_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply }),
      });

      if (r.deleteOriginal) {
        await fetch(`https://discord.com/api/v10/channels/${message.channel_id}/messages/${message.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bot ${token}` },
        });
      }
      break;
    }
  }
}

// ─── Welcome / Leave Handler ────────────────────────────────────
async function handleWelcome(data: any, token: string, config: any, isJoin: boolean) {
  const channelName = config.channel || "general";
  const messageText = (config.message || (isJoin ? "Welcome {user}!" : "Goodbye {user}!"))
    .replace(/\{user\}/g, `<@${data.user?.id}>`)
    .replace(/\{mention\}/g, `<@${data.user?.id}>`)
    .replace(/\{server\}/g, data.guild_id || "")
    .replace(/\{memberCount\}/g, "");

  // We'd need the channel ID; for now use system channel if available
  // The config stores channel names, but Discord API needs IDs
  // This is a best-effort implementation
  if (data.guild_id) {
    const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${data.guild_id}/channels`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (channelsRes.ok) {
      const channels = await channelsRes.json();
      const target = channels.find((c: any) => c.name === channelName && c.type === 0) || channels.find((c: any) => c.type === 0);
      if (target) {
        const body: any = { content: messageText };
        if (config.embedEnabled && isJoin) {
          body.embeds = [{
            title: config.embedTitle || undefined,
            description: (config.embedDescription || "").replace(/\{user\}/g, `<@${data.user?.id}>`).replace(/\{server\}/g, data.guild_id),
            color: parseInt((config.embedColor || "#FFD700").replace("#", ""), 16),
          }];
        }
        await fetch(`https://discord.com/api/v10/channels/${target.id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    }
  }
}

// ─── Reaction Role Handler ──────────────────────────────────────
async function handleReactionRole(data: any, token: string, config: any, action: "add" | "remove") {
  const groups = (config.groups as any[]) || [];
  const emoji = data.emoji?.name;
  if (!emoji || !data.guild_id || !data.user_id) return;

  for (const group of groups) {
    const role = (group.roles as any[])?.find((r: any) => r.emoji === emoji);
    if (role?.roleId) {
      const url = `https://discord.com/api/v10/guilds/${data.guild_id}/members/${data.user_id}/roles/${role.roleId}`;
      await fetch(url, {
        method: action === "add" ? "PUT" : "DELETE",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      });
      break;
    }
  }
}
