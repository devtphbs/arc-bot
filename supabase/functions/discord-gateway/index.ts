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
          // Track message event
          void adminClient.from("server_events").insert({ bot_id, guild_id: payload.guild_id || "dm", event_type: "message", event_data: { channel_id: payload.channel_id, user_id: payload.author?.id } });

          // Auto-moderation
          if (modules.automod || modules.wordfilter || modules.antispam) {
            void handleAutoMod(payload, token, adminClient, bot_id, modules);
          }

          if (levelingConfig?.enabled) {
            void handleLeveling(payload, adminClient, bot_id, user.id, token, levelingConfig);
          }
          if (modules.auto_responder) {
            void handleAutoResponder(payload, token, modules.auto_responder);
          }
        }

        if (eventType === "GUILD_MEMBER_ADD") {
          void adminClient.from("server_events").insert({ bot_id, guild_id: payload.guild_id || "", event_type: "member_join", event_data: { user_id: payload.user?.id } });
          if (modules.welcome) void handleWelcome(payload, token, modules.welcome, true);
        }

        if (eventType === "GUILD_MEMBER_REMOVE") {
          void adminClient.from("server_events").insert({ bot_id, guild_id: payload.guild_id || "", event_type: "member_leave", event_data: { user_id: payload.user?.id } });
          if (modules.leave) void handleWelcome(payload, token, modules.leave, false);
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

interface GatewayConnectOptions {
  gatewayUrl: string;
  token: string;
  presenceStatus: string;
  activityType: number;
  statusText: string;
  onDispatch: (eventType: string, payload: any) => void;
}

interface GatewayConnectResult {
  success: boolean;
  error?: string;
  close_code?: number;
  session_id?: string;
  guild_count?: number;
  user?: any;
  intents?: number;
}

const INTENT_CANDIDATES = [33281, 513, 1];

async function connectGatewayWithFallback(options: GatewayConnectOptions): Promise<GatewayConnectResult> {
  let lastError: GatewayConnectResult = { success: false, error: "Gateway connection failed" };

  for (const intents of INTENT_CANDIDATES) {
    const attempt = await connectGatewaySession(options, intents);
    if (attempt.success) return attempt;

    lastError = attempt;
    if (attempt.close_code === 4014) continue;
    break;
  }

  return lastError;
}

function connectGatewaySession(options: GatewayConnectOptions, intents: number): Promise<GatewayConnectResult> {
  return new Promise((resolve) => {
    const ws = new WebSocket(options.gatewayUrl);
    let settled = false;
    let sequence: number | null = null;
    let heartbeatInterval: number | null = null;
    let activeWindowTimer: number | null = null;
    let readyPayload: any = null;

    const timeout = setTimeout(() => {
      settle({ success: false, error: "Gateway connection timed out" });
    }, 22000) as unknown as number;

    const settle = (result: GatewayConnectResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (activeWindowTimer) clearTimeout(activeWindowTimer);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      try { ws.close(); } catch (_) {}
      resolve({ ...result, intents });
    };

    ws.onmessage = (event) => {
      let packet: any;
      try {
        packet = JSON.parse(event.data);
      } catch {
        return;
      }

      const { op, d, s, t } = packet;
      if (typeof s === "number") sequence = s;

      if (op === 10) {
        heartbeatInterval = setInterval(() => {
          try {
            ws.send(JSON.stringify({ op: 1, d: sequence }));
          } catch (_) {}
        }, d.heartbeat_interval) as unknown as number;

        const activities = options.statusText ? [{ name: options.statusText, type: options.activityType }] : [];
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token: options.token,
            intents,
            properties: { os: "linux", browser: "ArcBot", device: "ArcBot" },
            presence: { activities, status: options.presenceStatus, since: null, afk: false },
          },
        }));
        return;
      }

      if (op === 0 && t === "READY") {
        readyPayload = d;
        activeWindowTimer = setTimeout(() => {
          settle({
            success: true,
            session_id: d.session_id,
            guild_count: d.guilds?.length || 0,
            user: d.user,
          });
        }, 10000) as unknown as number;
        return;
      }

      if (op === 0 && t) {
        options.onDispatch(t, d);
        return;
      }

      if (op === 9) {
        settle({ success: false, error: "Invalid session", close_code: 4006 });
      }
    };

    ws.onerror = () => {
      settle({ success: false, error: "WebSocket error" });
    };

    ws.onclose = (event: CloseEvent) => {
      if (settled) return;

      if (event.code === 4014) {
        settle({ success: false, error: "Disallowed intents", close_code: event.code });
        return;
      }

      if (readyPayload) {
        settle({
          success: true,
          session_id: readyPayload.session_id,
          guild_count: readyPayload.guilds?.length || 0,
          user: readyPayload.user,
        });
        return;
      }

      settle({
        success: false,
        error: `Gateway closed (code ${event.code})${event.reason ? `: ${event.reason}` : ""}`,
        close_code: event.code,
      });
    };
  });
}

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

    // Increment usage
    adminClient.from("commands").update({ uses: (cmd.uses || 0) + 1 }).eq("id", cmd.id);
    adminClient.from("bot_logs").insert({ bot_id: botDbId, user_id: userId, level: "info", source: "command", message: `/${commandName} used by ${interaction.member?.user?.username || "unknown"}` });

    const responses = cmd.responses as any;

    // Detect blocks_v1 format from command builder
    if (responses && typeof responses === "object" && !Array.isArray(responses) && responses.mode === "blocks_v1" && Array.isArray(responses.blocks)) {
      const result = await executeCommandBlocksGateway(responses.blocks, responses.variables || [], interaction, token);
      const responseData: any = { type: 4, data: { content: result.content || "✅ Command executed." } };
      if (result.embeds && result.embeds.length > 0) responseData.data.embeds = result.embeds;
      if (cmd.ephemeral) responseData.data.flags = 64;
      await respond(interactionId, interactionToken, responseData);
      return;
    }

    // Legacy array format
    const respArray = Array.isArray(responses) ? responses : [];
    const content = respArray.length > 0 ? (respArray[0]?.content || "Command executed!") : "Command executed!";
    const responseData: any = { type: 4, data: { content } };
    if (cmd.embed) responseData.data.embeds = [cmd.embed];
    if (cmd.ephemeral) responseData.data.flags = 64;

    await respond(interactionId, interactionToken, responseData);
  }
}


// ─── Execute Command Builder Blocks (Gateway version) ────────────
async function executeCommandBlocksGateway(blocks: any[], variables: any[], interaction: any, token: string) {
  const userId = interaction.member?.user?.id || "";
  const userName = interaction.member?.user?.username || "unknown";
  const guildId = interaction.guild_id || "";
  const channelId = interaction.channel_id || "";

  const ctx: Record<string, string> = {
    user: `<@${userId}>`, "user.id": userId, "user.name": userName,
    channel: `<#${channelId}>`, "channel.id": channelId,
    server: guildId, mention: `<@${userId}>`,
  };
  for (const v of variables) { if (v.key && !ctx[v.key]) ctx[v.key] = v.fallback || ""; }
  const options = interaction.data?.options || [];
  for (const opt of options) { if (opt.type !== 1) ctx[`options.${opt.name}`] = String(opt.value ?? ""); }

  function resolve(text: string): string {
    return text.replace(/\{([\w.]+)\}/g, (match: string, key: string) => ctx[key] ?? match);
  }

  let replyContent = "";
  const embeds: any[] = [];

  for (const block of blocks) {
    try {
      switch (block.type) {
        case "reply": {
          const text = resolve(block.value || "");
          replyContent += (replyContent ? "\n" : "") + text;
          break;
        }
        case "embed": {
          try {
            const parsed = JSON.parse(resolve(block.value || "{}"));
            const embed: any = {};
            if (parsed.title) embed.title = parsed.title;
            if (parsed.description) embed.description = parsed.description;
            if (parsed.color) embed.color = typeof parsed.color === "string" ? parseInt(parsed.color.replace("#", ""), 16) : parsed.color;
            if (parsed.footer) embed.footer = { text: parsed.footer };
            if (parsed.image) embed.image = { url: parsed.image };
            if (parsed.thumbnail) embed.thumbnail = { url: parsed.thumbnail };
            if (parsed.fields) embed.fields = parsed.fields;
            embeds.push(embed);
          } catch { replyContent += (replyContent ? "\n" : "") + resolve(block.value || ""); }
          break;
        }
        case "dm_user": {
          try {
            const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
              method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ recipient_id: userId }),
            });
            if (dmRes.ok) {
              const dmCh = await dmRes.json();
              await fetch(`https://discord.com/api/v10/channels/${dmCh.id}/messages`, {
                method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ content: resolve(block.value || "") }),
              });
            }
          } catch { /* dm failed */ }
          break;
        }
        case "send_to_channel": {
          const parts = (block.value || "").split("|").map((s: string) => s.trim());
          const targetCh = resolve(parts[0] || channelId);
          const msg = resolve(parts[1] || parts[0] || "");
          try {
            await fetch(`https://discord.com/api/v10/channels/${targetCh}/messages`, {
              method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ content: msg }),
            });
          } catch { /* failed */ }
          break;
        }
        case "add_role": case "remove_role": case "toggle_role": {
          const roleId = resolve(block.value || "").trim();
          if (roleId && guildId) {
            await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
              method: block.type === "remove_role" ? "DELETE" : "PUT",
              headers: { Authorization: `Bot ${token}` },
            });
          }
          break;
        }
        case "wait": {
          const ms = Math.min(parseInt(block.value || "1") * 1000, 5000);
          await new Promise(r => setTimeout(r, ms));
          break;
        }
        case "member_count": {
          try {
            const gRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, { headers: { Authorization: `Bot ${token}` } });
            if (gRes.ok) { const g = await gRes.json(); if (block.variableKey) ctx[block.variableKey] = String(g.approximate_member_count || g.member_count || 0); }
          } catch { /* failed */ }
          break;
        }
        case "channel_count": {
          try {
            const chRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${token}` } });
            if (chRes.ok) { const chs = await chRes.json(); if (block.variableKey) ctx[block.variableKey] = String(Array.isArray(chs) ? chs.length : 0); }
          } catch { /* failed */ }
          break;
        }
        default: break;
      }
      if (block.variableKey && block.type === "reply") ctx[block.variableKey] = resolve(block.value || "");
    } catch (err: any) { console.error(`Block ${block.type} error:`, err.message); }
  }

  replyContent = replyContent.replace(/\{([\w.]+)\}/g, (match: string, key: string) => ctx[key] ?? match);
  return { content: replyContent || null, embeds };
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

  // Check ignored channels
  const ignoredChannels = (config.ignored_channels as string[]) || [];
  if (ignoredChannels.includes(message.channel_id)) return;

  // Check ignored roles
  const ignoredRoles = (config.ignored_roles as string[]) || [];
  const memberRoles: string[] = message.member?.roles || [];
  if (ignoredRoles.some((r: string) => memberRoles.includes(r))) return;

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

    // Use level_up_channel if configured, otherwise post in same channel
    const targetChannel = config.level_up_channel || message.channel_id;

    await fetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg }),
    });

    // Award role rewards for all levels up to and including the new level
    const roleRewards = (config.role_rewards as any[]) || [];
    for (const reward of roleRewards) {
      if (reward.level <= newLevel && reward.role_id && guildId) {
        await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${reward.role_id}`, {
          method: "PUT",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        });
      }
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
  const channelId = config.channelId || config.channel;
  const messageText = (config.message || (isJoin ? "Welcome {user}!" : "Goodbye {user}!"))
    .replace(/\{user\}/g, `<@${data.user?.id}>`)
    .replace(/\{mention\}/g, `<@${data.user?.id}>`)
    .replace(/\{server\}/g, data.guild_id || "")
    .replace(/\{memberCount\}/g, "");

  let targetChannelId = channelId;

  // If no channel ID configured, try to find a text channel
  if (!targetChannelId && data.guild_id) {
    const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${data.guild_id}/channels`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (channelsRes.ok) {
      const channels = await channelsRes.json();
      const fallback = channels.find((c: any) => c.type === 0);
      if (fallback) targetChannelId = fallback.id;
    }
  }

  if (targetChannelId) {
    const body: any = { content: messageText };
    if (config.embedEnabled && isJoin) {
      body.embeds = [{
        title: config.embedTitle || undefined,
        description: (config.embedDescription || "").replace(/\{user\}/g, `<@${data.user?.id}>`).replace(/\{server\}/g, data.guild_id),
        color: parseInt((config.embedColor || "#FFD700").replace("#", ""), 16),
      }];
    }
    await fetch(`https://discord.com/api/v10/channels/${targetChannelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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

// ─── Auto-Moderation Handler ────────────────────────────────────
async function handleAutoMod(message: any, token: string, adminClient: any, botDbId: string, modules: Record<string, any>) {
  const content = message.content || "";
  const channelId = message.channel_id;
  const messageId = message.id;
  const guildId = message.guild_id;
  const userId = message.author?.id;
  if (!guildId || !userId) return;

  const deleteMsg = async () => {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: "DELETE", headers: { Authorization: `Bot ${token}` },
    });
  };

  const sendWarning = async (reason: string, logChannelId?: string) => {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: `⚠️ <@${userId}>, ${reason}` }),
    });
    if (logChannelId) {
      await fetch(`https://discord.com/api/v10/channels/${logChannelId}/messages`, {
        method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: `🛡️ AutoMod: ${reason} | User: <@${userId}> | Channel: <#${channelId}>` }),
      });
    }
  };

  // Word Filter
  if (modules.wordfilter) {
    const cfg = modules.wordfilter;
    const blockedRaw = (cfg.blocked_words || "").split("\n").map((w: string) => w.trim()).filter(Boolean);
    const exemptRoles = (cfg.exempt_roles || "").split(",").map((r: string) => r.trim()).filter(Boolean);
    const memberRoles: string[] = message.member?.roles || [];
    if (!exemptRoles.some((r: string) => memberRoles.includes(r)) && blockedRaw.length > 0) {
      const lowerContent = content.toLowerCase();
      let blocked = false;
      for (const word of blockedRaw) {
        if (cfg.use_regex) {
          try { if (new RegExp(word, "i").test(content)) { blocked = true; break; } } catch {}
        } else if (cfg.wildcard_match) {
          if (lowerContent.includes(word.toLowerCase())) { blocked = true; break; }
        } else {
          if (lowerContent === word.toLowerCase()) { blocked = true; break; }
        }
      }
      if (blocked) {
        await deleteMsg();
        await sendWarning("your message was removed for containing a blocked word.");
        return;
      }
    }
  }

  // Auto-Mod (links, invites, caps, mentions)
  if (modules.automod) {
    const cfg = modules.automod;
    const logChannel = cfg.log_channel || "";

    if (cfg.block_links && /https?:\/\/\S+/.test(content)) {
      await deleteMsg();
      await sendWarning("links are not allowed in this server.", logChannel);
      return;
    }

    if (cfg.block_invites && /discord\.(gg|com\/invite)\/\S+/i.test(content)) {
      await deleteMsg();
      await sendWarning("Discord invite links are not allowed.", logChannel);
      return;
    }

    if (cfg.block_caps) {
      const threshold = cfg.caps_threshold || 70;
      const letters = content.replace(/[^a-zA-Z]/g, "");
      if (letters.length > 5) {
        const capsRatio = (letters.replace(/[^A-Z]/g, "").length / letters.length) * 100;
        if (capsRatio > threshold) {
          await deleteMsg();
          await sendWarning("excessive caps are not allowed.", logChannel);
          return;
        }
      }
    }

    const maxMentions = cfg.max_mentions || 5;
    const mentionCount = (content.match(/<@!?\d+>/g) || []).length;
    if (mentionCount > maxMentions) {
      await deleteMsg();
      await sendWarning(`too many mentions (max ${maxMentions}).`, logChannel);
      return;
    }
  }
}
