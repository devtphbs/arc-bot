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
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { bot_id, action, name, avatar, status_text, activity_type, presence_status } = await req.json();
    if (!bot_id || !action) return json({ error: "bot_id and action required" }, 400);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: bot } = await adminClient.from("bots").select("*").eq("id", bot_id).eq("user_id", user.id).single();
    if (!bot) return json({ error: "Bot not found" }, 404);

    const token = atob(bot.token_encrypted);

    switch (action) {
      case "update_name": {
        if (!name) return json({ error: "Name is required" }, 400);
        const res = await fetch("https://discord.com/api/v10/users/@me", {
          method: "PATCH", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ username: name }),
        });
        if (!res.ok) { const err = await res.json(); return json({ error: err.message || "Discord rejected the name change" }); }
        const updated = await res.json();
        await adminClient.from("bots").update({ bot_name: updated.username }).eq("id", bot_id);
        return json({ success: true, username: updated.username });
      }

      case "update_avatar": {
        if (!avatar) return json({ error: "Avatar data URI is required" }, 400);
        const res = await fetch("https://discord.com/api/v10/users/@me", {
          method: "PATCH", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ avatar }),
        });
        if (!res.ok) { const err = await res.json(); return json({ error: err.message || "Discord rejected the avatar change" }); }
        const updated = await res.json();
        const avatarUrl = updated.avatar ? `https://cdn.discordapp.com/avatars/${updated.id}/${updated.avatar}.png` : null;
        await adminClient.from("bots").update({ bot_avatar: avatarUrl }).eq("id", bot_id);
        return json({ success: true, avatar_url: avatarUrl });
      }

      case "start":
      case "restart": {
        const allSlashCommands = await buildAllSlashCommands(adminClient, bot_id, bot);

        let appId = bot.bot_id;
        if (!appId) {
          const meRes = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${token}` } });
          if (meRes.ok) {
            const me = await meRes.json();
            appId = me.id;
            await adminClient.from("bots").update({ bot_id: me.id, bot_name: me.username }).eq("id", bot_id);
          }
        }

        if (appId && allSlashCommands.length > 0) {
          const regRes = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
            method: "PUT", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(allSlashCommands),
          });
          if (!regRes.ok) { const err = await regRes.json(); console.error("Command registration error:", err); }
        }

        if (appId) {
          const interactionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/discord-interactions`;
          await fetch("https://discord.com/api/v10/applications/@me", {
            method: "PATCH", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ interactions_endpoint_url: interactionsUrl }),
          });
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const gatewayRes = await fetch(`${supabaseUrl}/functions/v1/discord-gateway`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: authHeader! },
          body: JSON.stringify({ bot_id }),
        });
        const gatewayResult = await gatewayRes.json().catch(() => ({}));

        if (!gatewayRes.ok || !gatewayResult?.success) {
          await adminClient.from("bots").update({ status: "offline" }).eq("id", bot_id);
          return json({ error: gatewayResult?.error || "Failed to connect to Discord Gateway" });
        }

        await adminClient.from("bot_logs").insert({
          bot_id, user_id: user.id, level: "info", source: "system",
          message: `Bot started. Registered ${allSlashCommands.length} slash commands. Interactions endpoint configured.`,
        });

        return json({ success: true, status: "online", gateway: gatewayResult, commands_registered: allSlashCommands.length });
      }

      case "stop": {
        await adminClient.from("bots").update({ status: "offline" }).eq("id", bot_id);
        await adminClient.from("bot_logs").insert({ bot_id, user_id: user.id, level: "info", source: "dashboard", message: "Bot stopped by user." });
        return json({ success: true, status: "offline" });
      }

      case "update_status": {
        await adminClient.from("bot_modules").upsert({
          bot_id, user_id: user.id, module_name: "custom_status", enabled: true,
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
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function buildAllSlashCommands(adminClient: any, botDbId: string, bot: any) {
  const commands: any[] = [];

  // Custom commands
  const { data: customCmds } = await adminClient.from("commands").select("*").eq("bot_id", botDbId).eq("enabled", true);
  if (customCmds) {
    for (const c of customCmds) {
      commands.push({ name: c.name.replace(/^\//, "").toLowerCase(), description: c.description || "Custom command", type: 1 });
    }
  }

  // Custom scripts (with optional options)
  const { data: customScripts } = await adminClient.from("custom_scripts").select("*").eq("bot_id", botDbId).eq("enabled", true);
  if (customScripts) {
    const optionTypeMap: Record<string, number> = { string: 3, integer: 4, boolean: 5, user: 6, channel: 7, role: 8 };
    for (const s of customScripts) {
      if (!s.trigger_command) continue;
      const cmdName = s.trigger_command.replace(/^\//, "").toLowerCase();
      // Skip if already registered from commands table
      if (commands.some((c: any) => c.name === cmdName)) continue;
      const cmd: any = { name: cmdName, description: s.description || "Custom script", type: 1 };
      // Parse options from script code
      const optMatch = s.script_code?.match(/^\/\/ @options (.+)$/m);
      if (optMatch) {
        try {
          const opts = JSON.parse(optMatch[1]);
          if (Array.isArray(opts) && opts.length > 0) {
            cmd.options = opts.map((o: any) => ({
              name: o.name,
              description: o.description || o.name,
              type: optionTypeMap[o.type] || 3,
              required: false,
            }));
          }
        } catch {}
      }
      commands.push(cmd);
    }
  }

  // Modules
  const { data: modules } = await adminClient.from("bot_modules").select("*").eq("bot_id", botDbId).eq("enabled", true);
  const enabledModules = new Set<string>();
  modules?.forEach((m: any) => enabledModules.add(m.module_name));

  // Giveaway
  if (enabledModules.has("giveaways")) {
    commands.push({
      name: "giveaway", description: "Manage giveaways", type: 1,
      options: [
        { name: "start", description: "Start a new giveaway", type: 1, options: [
          { name: "prize", description: "What to give away", type: 3, required: false },
          { name: "duration", description: "Duration (e.g. 1d, 30m, 1mo)", type: 3, required: false },
          { name: "winners", description: "Number of winners", type: 4, required: false },
          { name: "color", description: "Embed color hex (e.g. #FFD700)", type: 3, required: false },
          { name: "channel", description: "Channel to post in", type: 7, required: false },
          { name: "host", description: "User hosting the giveaway", type: 6, required: false },
          { name: "winner-dm", description: "DM message sent to winners", type: 3, required: false },
          { name: "required-messages", description: "Min messages to enter", type: 4, required: false },
          { name: "bypass-role", description: "Role that bypasses requirements", type: 8, required: false },
        ]},
        { name: "end", description: "End a giveaway early", type: 1 },
        { name: "reroll", description: "Reroll the winner", type: 1 },
        { name: "list", description: "List giveaway templates", type: 1 },
      ],
    });
  }

  // Poll
  if (enabledModules.has("polls")) {
    commands.push({
      name: "poll", description: "Create a poll", type: 1,
      options: [
        { name: "question", description: "The poll question", type: 3, required: true },
        { name: "options", description: "Comma-separated options", type: 3, required: false },
      ],
    });
  }

  // Leveling
  const { data: levelConfig } = await adminClient.from("leveling_config").select("enabled").eq("bot_id", botDbId).maybeSingle();
  if (levelConfig?.enabled) {
    commands.push({ name: "rank", description: "Check your or someone's level", type: 1, options: [{ name: "user", description: "User to check", type: 6, required: false }] });
    commands.push({ name: "leaderboard", description: "View the server XP leaderboard", type: 1 });
  }

  // Tickets
  const { data: ticketConfig } = await adminClient.from("ticket_config").select("enabled").eq("bot_id", botDbId).maybeSingle();
  if (ticketConfig?.enabled) {
    commands.push({
      name: "ticket", description: "Manage support tickets", type: 1,
      options: [
        { name: "open", description: "Open a new ticket", type: 1, options: [
          { name: "category", description: "Ticket category", type: 3, required: false },
        ]},
        { name: "close", description: "Close the current ticket", type: 1 },
      ],
    });
  }

  // Music
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

  // Help
  commands.push({ name: "help", description: "Show all available commands", type: 1 });

  return commands;
}
