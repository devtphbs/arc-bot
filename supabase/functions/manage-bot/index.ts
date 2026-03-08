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

    const { bot_id, action, name, avatar, status_text, activity_type, presence_status } = await req.json();

    if (!bot_id || !action) {
      return new Response(JSON.stringify({ error: "bot_id and action required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    switch (action) {
      case "update_name": {
        if (!name || typeof name !== "string") {
          return new Response(JSON.stringify({ error: "Name is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const res = await fetch("https://discord.com/api/v10/users/@me", {
          method: "PATCH",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ username: name }),
        });
        if (!res.ok) {
          const err = await res.json();
          return json({ error: err.message || "Discord rejected the name change" });
        }
        const updated = await res.json();
        await adminClient.from("bots").update({ bot_name: updated.username }).eq("id", bot_id);
        return json({ success: true, username: updated.username });
      }

      case "update_avatar": {
        if (!avatar) {
          return json({ error: "Avatar data URI is required" }, 400);
        }
        const res = await fetch("https://discord.com/api/v10/users/@me", {
          method: "PATCH",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ avatar }),
        });
        if (!res.ok) {
          const err = await res.json();
          return json({ error: err.message || "Discord rejected the avatar change" });
        }
        const updated = await res.json();
        const avatarUrl = updated.avatar ? `https://cdn.discordapp.com/avatars/${updated.id}/${updated.avatar}.png` : null;
        await adminClient.from("bots").update({ bot_avatar: avatarUrl }).eq("id", bot_id);
        return json({ success: true, avatar_url: avatarUrl });
      }

      case "start":
      case "restart": {
        // 1. Build all slash commands: custom + module commands
        const allSlashCommands = await buildAllSlashCommands(adminClient, bot_id, bot);

        // 2. Get application ID (bot_id field or from Discord)
        let appId = bot.bot_id;
        if (!appId) {
          const meRes = await fetch("https://discord.com/api/v10/users/@me", {
            headers: { Authorization: `Bot ${token}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            appId = me.id;
            await adminClient.from("bots").update({ bot_id: me.id, bot_name: me.username }).eq("id", bot_id);
          }
        }

        // 3. Register all slash commands with Discord
        if (appId && allSlashCommands.length > 0) {
          const regRes = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
            method: "PUT",
            headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(allSlashCommands),
          });
          if (!regRes.ok) {
            const err = await regRes.json();
            console.error("Command registration error:", err);
          }
        }

        // 4. Set interactions endpoint URL
        if (appId) {
          const interactionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/discord-interactions`;
          await fetch(`https://discord.com/api/v10/applications/@me`, {
            method: "PATCH",
            headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ interactions_endpoint_url: interactionsUrl }),
          });
        }

        // 5. Connect to Gateway for presence/status
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const gatewayRes = await fetch(`${supabaseUrl}/functions/v1/discord-gateway`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader!,
          },
          body: JSON.stringify({ bot_id }),
        });

        const gatewayResult = await gatewayRes.json().catch(() => ({}));

        if (!gatewayRes.ok || !gatewayResult?.success) {
          await adminClient.from("bots").update({ status: "offline" }).eq("id", bot_id);
          return json({
            error: gatewayResult?.error || "Failed to connect to Discord Gateway",
          });
        }

        await adminClient.from("bot_logs").insert({
          bot_id,
          user_id: user.id,
          level: "info",
          source: "system",
          message: `Bot started. Registered ${allSlashCommands.length} slash commands. Interactions endpoint configured.`,
        });

        return json({ success: true, status: "online", gateway: gatewayResult, commands_registered: allSlashCommands.length });
      }

      case "stop": {
        await adminClient.from("bots").update({ status: "offline" }).eq("id", bot_id);
        await adminClient.from("bot_logs").insert({
          bot_id,
          user_id: user.id,
          level: "info",
          source: "dashboard",
          message: "Bot stopped by user. Keepalive will not reconnect this bot.",
        });
        return json({ success: true, status: "offline" });
      }

      case "update_status": {
        await adminClient.from("bot_modules").upsert({
          bot_id,
          user_id: user.id,
          module_name: "custom_status",
          enabled: true,
          config: { status_text, activity_type: activity_type || 0, presence_status: presence_status || "online" },
        }, { onConflict: "bot_id,module_name" });
        return json({ success: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Build All Slash Commands ─────────────────────────────────────
async function buildAllSlashCommands(adminClient: any, botDbId: string, bot: any) {
  const commands: any[] = [];

  // 1. Custom user commands
  const { data: customCmds } = await adminClient
    .from("commands")
    .select("*")
    .eq("bot_id", botDbId)
    .eq("enabled", true);

  if (customCmds) {
    for (const c of customCmds) {
      const name = c.name.replace(/^\//, "").toLowerCase();
      const cmd: any = {
        name,
        description: c.description || "Custom command",
        type: 1,
      };
      // Add role permissions: if permissions array has role IDs, use default_member_permissions
      // Discord doesn't support role-specific permissions in registration, we check at runtime
      commands.push(cmd);
    }
  }

  // 2. Load enabled modules
  const { data: modules } = await adminClient
    .from("bot_modules")
    .select("*")
    .eq("bot_id", botDbId)
    .eq("enabled", true);

  const enabledModules = new Set<string>();
  modules?.forEach((m: any) => enabledModules.add(m.module_name));

  // 3. Giveaway commands
  if (enabledModules.has("giveaways")) {
    commands.push({
      name: "giveaway",
      description: "Manage giveaways",
      type: 1,
      options: [
        {
          name: "start",
          description: "Start a new giveaway",
          type: 1, // SUB_COMMAND
          options: [
            { name: "prize", description: "What to give away", type: 3, required: true },
            { name: "duration", description: "Duration in seconds", type: 4, required: false },
            { name: "winners", description: "Number of winners", type: 4, required: false },
          ],
        },
        { name: "end", description: "End a giveaway early", type: 1 },
        { name: "reroll", description: "Reroll the winner", type: 1 },
        { name: "list", description: "List giveaway templates", type: 1 },
      ],
    });
  }

  // 4. Poll command
  if (enabledModules.has("polls")) {
    commands.push({
      name: "poll",
      description: "Create a poll",
      type: 1,
      options: [
        { name: "question", description: "The poll question", type: 3, required: true },
        { name: "options", description: "Comma-separated options (leave empty for Yes/No)", type: 3, required: false },
      ],
    });
  }

  // 5. Leveling commands (always available if leveling is configured)
  const { data: levelConfig } = await adminClient
    .from("leveling_config")
    .select("enabled")
    .eq("bot_id", botDbId)
    .maybeSingle();

  if (levelConfig?.enabled) {
    commands.push({
      name: "rank",
      description: "Check your or someone's level and XP",
      type: 1,
      options: [
        { name: "user", description: "User to check (optional)", type: 6, required: false },
      ],
    });
    commands.push({
      name: "leaderboard",
      description: "View the server XP leaderboard",
      type: 1,
    });
  }

  // 6. Music commands
  if (enabledModules.has("music")) {
    const musicCmds = [
      { name: "play", description: "Play a song", options: [{ name: "query", description: "Song name or URL", type: 3, required: true }] },
      { name: "skip", description: "Skip the current song" },
      { name: "pause", description: "Pause playback" },
      { name: "resume", description: "Resume playback" },
      { name: "stop", description: "Stop playback and clear queue" },
      { name: "queue", description: "View the current queue" },
      { name: "nowplaying", description: "Show currently playing song" },
      { name: "volume", description: "Set volume", options: [{ name: "level", description: "Volume 1-100", type: 4, required: true }] },
      { name: "shuffle", description: "Shuffle the queue" },
      { name: "loop", description: "Toggle loop mode" },
    ];
    musicCmds.forEach((c) => commands.push({ ...c, type: 1 }));
  }

  // 7. Help command (always)
  commands.push({
    name: "help",
    description: "Show all available commands",
    type: 1,
  });

  return commands;
}
