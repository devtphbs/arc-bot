import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp",
};

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function parseDuration(input: string): number {
  const match = String(input).trim().match(/^(\d+)\s*(mo|months?|d|days?|h|hours?|m|mins?|minutes?|s|secs?|seconds?)$/i);
  if (!match) {
    const num = parseInt(input);
    return isNaN(num) ? 86400 : num;
  }
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("mo")) return val * 30 * 86400;
  if (unit.startsWith("d")) return val * 86400;
  if (unit.startsWith("h")) return val * 3600;
  if (unit.startsWith("m")) return val * 60;
  if (unit.startsWith("s")) return val;
  return 86400;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.text();
    let interaction: any;
    try {
      interaction = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    // Internal action calls (from dashboard, not Discord)
    if (interaction.action === "deploy_ticket_panel") {
      return await deployTicketPanel(adminClient, interaction);
    }
    if (interaction.action === "deploy_reaction_role_panel") {
      return await deployReactionRolePanel(adminClient, interaction);
    }
    if (interaction.action === "end_giveaways") {
      return await autoEndGiveaways(adminClient);
    }
    if (interaction.action === "end_polls") {
      return await autoEndPolls(adminClient);
    }

    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");

    if (!signature || !timestamp) {
      return new Response("Missing signature", { status: 401, headers: corsHeaders });
    }

    // PING
    if (interaction.type === 1) {
      const { data: bot } = await adminClient.from("bots").select("*").eq("bot_id", interaction.application_id).maybeSingle();
      if (bot) {
        const token = atob(bot.token_encrypted);
        const appRes = await fetch("https://discord.com/api/v10/applications/@me", { headers: { Authorization: `Bot ${token}` } });
        if (appRes.ok) {
          const appData = await appRes.json();
          const isValid = nacl.sign.detached.verify(
            new TextEncoder().encode(timestamp + body),
            hexToUint8Array(signature),
            hexToUint8Array(appData.verify_key)
          );
          if (!isValid) return new Response("Invalid signature", { status: 401, headers: corsHeaders });
        }
      }
      return respond({ type: 1 });
    }

    const appId = interaction.application_id;
    const { data: bot } = await adminClient.from("bots").select("*").eq("bot_id", appId).maybeSingle();
    if (!bot) return respond({ type: 4, data: { content: "❌ Bot not configured.", flags: 64 } });

    const token = atob(bot.token_encrypted);

    // Verify signature
    const appRes = await fetch("https://discord.com/api/v10/applications/@me", { headers: { Authorization: `Bot ${token}` } });
    if (appRes.ok) {
      const appData = await appRes.json();
      const isValid = nacl.sign.detached.verify(
        new TextEncoder().encode(timestamp + body),
        hexToUint8Array(signature),
        hexToUint8Array(appData.verify_key)
      );
      if (!isValid) return new Response("Invalid signature", { status: 401, headers: corsHeaders });
    }

    // Slash commands (type 2)
    if (interaction.type === 2) {
      const commandName = interaction.data?.name;
      const subCommand = interaction.data?.options?.find((o: any) => o.type === 1)?.name;
      const memberRoles: string[] = interaction.member?.roles || [];

      const { data: commands } = await adminClient.from("commands").select("*").eq("bot_id", bot.id).eq("enabled", true);
      const { data: allModules } = await adminClient.from("bot_modules").select("*").eq("bot_id", bot.id).eq("enabled", true);
      const modules: Record<string, any> = {};
      allModules?.forEach((m: any) => { modules[m.module_name] = m.config; });

      // Custom commands
      const cmd = commands?.find((c: any) => c.name === commandName || c.name === `/${commandName}`);
      if (cmd) {
        const requiredRoles = (cmd.permissions as string[]) || [];
        if (requiredRoles.length > 0 && !requiredRoles.some((r) => memberRoles.includes(r))) {
          return respond({ type: 4, data: { content: "❌ You don't have the required role to use this command.", flags: 64 } });
        }
        adminClient.from("commands").update({ uses: (cmd.uses || 0) + 1 }).eq("id", cmd.id);
        adminClient.from("bot_logs").insert({ bot_id: bot.id, user_id: bot.user_id, level: "info", source: "command", message: `/${commandName} used by ${interaction.member?.user?.username || "unknown"}` });

        const responses = cmd.responses as any;

        // Detect blocks_v1 format from command builder
        if (responses && typeof responses === "object" && !Array.isArray(responses) && responses.mode === "blocks_v1" && Array.isArray(responses.blocks)) {
          const result = await executeCommandBlocks(responses.blocks, responses.variables || [], interaction, token, bot, adminClient);
          const responseData: any = { type: 4, data: { content: result.content || "✅ Command executed." } };
          if (result.embeds && result.embeds.length > 0) responseData.data.embeds = result.embeds;
          if (cmd.ephemeral) responseData.data.flags = 64;
          return respond(responseData);
        }

        // Legacy array format
        const respArray = Array.isArray(responses) ? responses : [];
        const content = respArray.length > 0 ? (respArray[0]?.content || "Command executed!") : "Command executed!";
        const responseData: any = { type: 4, data: { content } };
        if (cmd.embed) responseData.data.embeds = [cmd.embed];
        if (cmd.ephemeral) responseData.data.flags = 64;
        return respond(responseData);
      }

      // Custom scripts
      const { data: customScripts } = await adminClient.from("custom_scripts").select("*").eq("bot_id", bot.id).eq("enabled", true);
      const script = customScripts?.find((s: any) => s.trigger_command === commandName);
      if (script) {
        // Build options map from interaction data
        const optionsMap: Record<string, any> = {};
        (interaction.data?.options || []).forEach((o: any) => { optionsMap[o.name] = o.value; });

        // Simple variable resolution for scripts
        let content = script.script_code || "";
        // Remove metadata comments
        content = content.replace(/^\/\/.*/gm, "").trim();

        // ─── Scraping engine ───
        // Cache fetched HTML pages to avoid re-fetching the same URL
        const htmlCache: Record<string, string> = {};
        async function fetchPage(url: string): Promise<string> {
          if (htmlCache[url]) return htmlCache[url];
          const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; ArcBot/1.0)" },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();
          htmlCache[url] = html;
          return html;
        }

        const scrapeResults: string[] = [];
        const scrapeImageResults: string[] = [];
        const scrapeAllResults: string[][] = [];
        const scrapeAttrResults: string[] = [];

        // scrape("url", "selector") — get first text match
        const scrapeRegex = /scrape\(\s*["'`](.+?)["'`]\s*,\s*["'`](.+?)["'`]\s*\)/g;
        let scrapeMatch;
        while ((scrapeMatch = scrapeRegex.exec(content)) !== null) {
          const [, scrapeUrl, selector] = scrapeMatch;
          try {
            const html = await fetchPage(scrapeUrl);
            const extracted = extractBySelector(html, selector);
            scrapeResults.push(extracted || "(no content found)");
          } catch (e: any) {
            scrapeResults.push(`(scrape error: ${e.message})`);
          }
        }

        // scrapeAll("url", "selector") — get ALL matching texts as array
        const scrapeAllRegex = /scrapeAll\(\s*["'`](.+?)["'`]\s*,\s*["'`](.+?)["'`]\s*\)/g;
        let scrapeAllMatch;
        while ((scrapeAllMatch = scrapeAllRegex.exec(content)) !== null) {
          const [, scrapeUrl, selector] = scrapeAllMatch;
          try {
            const html = await fetchPage(scrapeUrl);
            const items = extractAllBySelector(html, selector);
            scrapeAllResults.push(items.length > 0 ? items : ["(no content found)"]);
          } catch (e: any) {
            scrapeAllResults.push([`(scrape error: ${e.message})`]);
          }
        }

        // scrapeImage("url", "selector") — get the src attribute of an <img> inside the selector
        const scrapeImgRegex = /scrapeImage\(\s*["'`](.+?)["'`]\s*,\s*["'`](.+?)["'`]\s*\)/g;
        let scrapeImgMatch;
        while ((scrapeImgMatch = scrapeImgRegex.exec(content)) !== null) {
          const [, scrapeUrl, selector] = scrapeImgMatch;
          try {
            const html = await fetchPage(scrapeUrl);
            const imgSrc = extractImageBySelector(html, selector);
            scrapeImageResults.push(imgSrc || "(no image found)");
          } catch (e: any) {
            scrapeImageResults.push(`(scrape error: ${e.message})`);
          }
        }

        // scrapeAttr("url", "selector", "attribute") — get any attribute value
        const scrapeAttrRegex = /scrapeAttr\(\s*["'`](.+?)["'`]\s*,\s*["'`](.+?)["'`]\s*,\s*["'`](.+?)["'`]\s*\)/g;
        let scrapeAttrMatch;
        while ((scrapeAttrMatch = scrapeAttrRegex.exec(content)) !== null) {
          const [, scrapeUrl, selector, attr] = scrapeAttrMatch;
          try {
            const html = await fetchPage(scrapeUrl);
            const val = extractAttrBySelector(html, selector, attr);
            scrapeAttrResults.push(val || "(no attribute found)");
          } catch (e: any) {
            scrapeAttrResults.push(`(scrape error: ${e.message})`);
          }
        }

        // ─── String Utilities engine ───
        const stringVars: Record<string, string> = {};
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!/^(cutAfter|cutBefore|replace|upper|lower|trim|length)\(/.test(trimmedLine)) continue;
          
          const storageMatch = trimmedLine.match(/=>\s*(\w+)\s*$/);
          const varName = storageMatch?.[1];
          let result = "";

          // Helper to resolve vars in a string
          const rv = (t: string) => {
            t = t.replace(/\{user\}/g, `<@${interaction.member?.user?.id}>`);
            t = t.replace(/\{user\.id\}/g, interaction.member?.user?.id || "");
            t = t.replace(/\{user\.name\}/g, interaction.member?.user?.username || "");
            t = t.replace(/\{channel\}/g, `<#${interaction.channel_id}>`);
            t = t.replace(/\{channel\.id\}/g, interaction.channel_id || "");
            t = t.replace(/\{server\.name\}/g, interaction.guild_id || "");
            t = t.replace(/\{options\.(\w+)\}/g, (_: string, n: string) => optionsMap[n] !== undefined ? String(optionsMap[n]) : "");
            t = t.replace(/\{scrape\.(\d+)\}/g, (_: string, i: string) => scrapeResults[parseInt(i)] ?? "");
            t = t.replace(/\{scrapeImage\.(\d+)\}/g, (_: string, i: string) => scrapeImageResults[parseInt(i)] ?? "");
            t = t.replace(/\{scrapeAttr\.(\d+)\}/g, (_: string, i: string) => scrapeAttrResults[parseInt(i)] ?? "");
            // Resolve previously stored string vars
            Object.entries(stringVars).forEach(([k, v]) => { t = t.replaceAll(`{${k}}`, v); });
            return t;
          };

          const cutAfterM = trimmedLine.match(/cutAfter\(["'`](.*?)["'`]\s*,\s*["'`](.*?)["'`]\)/);
          const cutBeforeM = trimmedLine.match(/cutBefore\(["'`](.*?)["'`]\s*,\s*["'`](.*?)["'`]\)/);
          const replaceM = trimmedLine.match(/replace\(["'`](.*?)["'`]\s*,\s*["'`](.*?)["'`]\s*,\s*["'`](.*?)["'`]\)/);
          const upperM = trimmedLine.match(/upper\(["'`](.*?)["'`]\)/);
          const lowerM = trimmedLine.match(/lower\(["'`](.*?)["'`]\)/);
          const trimM2 = trimmedLine.match(/trim\(["'`](.*?)["'`]\)/);
          const lengthM = trimmedLine.match(/length\(["'`](.*?)["'`]\)/);

          if (cutAfterM) { const t = rv(cutAfterM[1]); const i = t.indexOf(cutAfterM[2]); result = i >= 0 ? t.substring(0, i) : t; }
          else if (cutBeforeM) { const t = rv(cutBeforeM[1]); const i = t.indexOf(cutBeforeM[2]); result = i >= 0 ? t.substring(i + cutBeforeM[2].length) : t; }
          else if (replaceM) { result = rv(replaceM[1]).replaceAll(replaceM[2], replaceM[3]); }
          else if (upperM) { result = rv(upperM[1]).toUpperCase(); }
          else if (lowerM) { result = rv(lowerM[1]).toLowerCase(); }
          else if (trimM2) { result = rv(trimM2[1]).trim(); }
          else if (lengthM) { result = String(rv(lengthM[1]).length); }

          if (varName) stringVars[varName] = result;
        }

        // Extract reply() calls
        const replyMatch = content.match(/reply\(["'`](.+?)["'`]\)/s);
        let replyText = replyMatch ? replyMatch[1] : "Script executed!";

        // Replace scrape results
        replyText = replyText.replace(/\{scrape\.(\d+)\}/g, (_: string, idx: string) => {
          return scrapeResults[parseInt(idx)] ?? "(no scrape result)";
        });
        replyText = replyText.replace(/\{scrapeImage\.(\d+)\}/g, (_: string, idx: string) => {
          return scrapeImageResults[parseInt(idx)] ?? "(no image result)";
        });
        replyText = replyText.replace(/\{scrapeAll\.(\d+)\.(\d+)\}/g, (_: string, arrIdx: string, itemIdx: string) => {
          return scrapeAllResults[parseInt(arrIdx)]?.[parseInt(itemIdx)] ?? "(no result)";
        });
        replyText = replyText.replace(/\{scrapeAll\.(\d+)\.join\(["'`](.+?)["'`]\)\}/g, (_: string, arrIdx: string, sep: string) => {
          return scrapeAllResults[parseInt(arrIdx)]?.join(sep) ?? "(no results)";
        });
        replyText = replyText.replace(/\{scrapeAttr\.(\d+)\}/g, (_: string, idx: string) => {
          return scrapeAttrResults[parseInt(idx)] ?? "(no attr result)";
        });

        // Replace variables
        replyText = replyText
          .replace(/\{user\}/g, `<@${interaction.member?.user?.id}>`)
          .replace(/\{user\.id\}/g, interaction.member?.user?.id || "")
          .replace(/\{user\.name\}/g, interaction.member?.user?.username || "")
          .replace(/\{channel\}/g, `<#${interaction.channel_id}>`)
          .replace(/\{channel\.id\}/g, interaction.channel_id || "")
          .replace(/\{server\.name\}/g, interaction.guild_id || "");

        // Replace {options.name} with actual option values
        replyText = replyText.replace(/\{options\.(\w+)\}/g, (_: string, name: string) => {
          return optionsMap[name] !== undefined ? String(optionsMap[name]) : "";
        });

        // Replace string utility variables
        Object.entries(stringVars).forEach(([k, v]) => { replyText = replyText.replaceAll(`{${k}}`, v); });

        // Truncate to Discord's 2000 char limit
        if (replyText.length > 2000) replyText = replyText.substring(0, 1997) + "...";

        adminClient.from("bot_logs").insert({ bot_id: bot.id, user_id: bot.user_id, level: "info", source: "script", message: `Script /${commandName} used by ${interaction.member?.user?.username || "unknown"}` });
        return respond({ type: 4, data: { content: replyText } });
      }

      // Module commands
      const result = await handleModuleCommand(commandName, subCommand, interaction, modules, token, adminClient, bot, memberRoles);
      if (result) return respond(result);

      return respond({ type: 4, data: { content: "❌ Unknown command.", flags: 64 } });
    }

    // Button interactions (type 3 = MESSAGE_COMPONENT)
    if (interaction.type === 3) {
      const customId = interaction.data?.custom_id || "";

      // Giveaway entry button
      if (customId.startsWith("giveaway_enter_")) {
        return await handleGiveawayEntry(interaction, bot, token, adminClient);
      }

      // Poll vote button
      if (customId.startsWith("poll_vote_")) {
        return await handlePollVote(interaction, bot, token, adminClient);
      }

      // IMPORTANT: Check ticket_close_ and ticket_claim_ BEFORE ticket_ to avoid creating a new ticket
      if (customId.startsWith("ticket_close_")) {
        return await handleTicketClose(interaction, bot, token, adminClient);
      }
      if (customId.startsWith("ticket_claim_")) {
        return await handleTicketClaim(interaction, bot, token, adminClient);
      }

      // Reaction role button (toggle role)
      if (customId.startsWith("rr_")) {
        return await handleReactionRoleButton(interaction, bot, token);
      }

      // Ticket category button (opens new ticket)
      if (customId.startsWith("ticket_")) {
        return await handleTicketButton(interaction, bot, token, adminClient);
      }
    }

    return respond({ type: 4, data: { content: "Interaction received.", flags: 64 } });
  } catch (err: any) {
    console.error("Interaction error:", err);
    return new Response(
      JSON.stringify({ type: 4, data: { content: "❌ Internal error.", flags: 64 } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function respond(data: any) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── Execute Command Builder Blocks ───────────────────────────────
async function executeCommandBlocks(blocks: any[], variables: any[], interaction: any, token: string, bot: any, adminClient: any) {
  const userId = interaction.member?.user?.id || "";
  const userName = interaction.member?.user?.username || "unknown";
  const guildId = interaction.guild_id || "";
  const channelId = interaction.channel_id || "";

  // Build variable context
  const ctx: Record<string, string> = {
    user: `<@${userId}>`,
    "user.id": userId,
    "user.name": userName,
    channel: `<#${channelId}>`,
    "channel.id": channelId,
    server: guildId,
    mention: `<@${userId}>`,
  };

  // Add custom variable defaults
  for (const v of variables) {
    if (v.key && !ctx[v.key]) ctx[v.key] = v.fallback || "";
  }

  // Add command options to context
  const options = interaction.data?.options || [];
  for (const opt of options) {
    if (opt.type !== 1) { // not a subcommand
      ctx[`options.${opt.name}`] = String(opt.value ?? "");
    }
  }

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
          } catch {
            replyContent += (replyContent ? "\n" : "") + resolve(block.value || "");
          }
          break;
        }
        case "dm_user": {
          try {
            const dmChannelRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
              method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ recipient_id: userId }),
            });
            if (dmChannelRes.ok) {
              const dmChannel = await dmChannelRes.json();
              await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
                method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ content: resolve(block.value || "") }),
              });
            }
          } catch { /* DM failed silently */ }
          break;
        }
        case "send_to_channel": {
          const parts = (block.value || "").split("|").map((s: string) => s.trim());
          const targetChannel = resolve(parts[0] || "");
          const msg = resolve(parts.slice(1).join("|") || parts[0] || "");
          if (targetChannel) {
            await fetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
              method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ content: msg }),
            }).catch(() => {});
          }
          break;
        }
        case "add_role": {
          const roleId = resolve(block.value || "").trim();
          if (roleId && guildId) {
            await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
              method: "PUT", headers: { Authorization: `Bot ${token}` },
            }).catch(() => {});
          }
          break;
        }
        case "remove_role": {
          const roleId = resolve(block.value || "").trim();
          if (roleId && guildId) {
            await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
              method: "DELETE", headers: { Authorization: `Bot ${token}` },
            }).catch(() => {});
          }
          break;
        }
        case "toggle_role": {
          const roleId = resolve(block.value || "").trim();
          if (roleId && guildId) {
            const hasRole = (interaction.member?.roles || []).includes(roleId);
            await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
              method: hasRole ? "DELETE" : "PUT", headers: { Authorization: `Bot ${token}` },
            }).catch(() => {});
          }
          break;
        }
        case "kick_user": {
          const targetId = resolve(block.value || userId).trim();
          if (guildId) {
            await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${targetId}`, {
              method: "DELETE", headers: { Authorization: `Bot ${token}` },
            }).catch(() => {});
          }
          break;
        }
        case "ban_user": {
          const targetId = resolve(block.value || userId).trim();
          if (guildId) {
            await fetch(`https://discord.com/api/v10/guilds/${guildId}/bans/${targetId}`, {
              method: "PUT", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ delete_message_seconds: 0 }),
            }).catch(() => {});
          }
          break;
        }
        case "set_nickname": {
          const nick = resolve(block.value || "").trim();
          if (guildId) {
            await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
              method: "PATCH", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ nick }),
            }).catch(() => {});
          }
          break;
        }
        case "purge_messages": {
          const count = Math.min(parseInt(resolve(block.value || "10")) || 10, 100);
          try {
            const msgsRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=${count}`, {
              headers: { Authorization: `Bot ${token}` },
            });
            if (msgsRes.ok) {
              const msgs = await msgsRes.json();
              const ids = msgs.map((m: any) => m.id);
              if (ids.length > 1) {
                await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/bulk-delete`, {
                  method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ messages: ids }),
                });
              }
            }
          } catch { /* purge failed */ }
          break;
        }
        case "member_count": {
          try {
            const guildRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
              headers: { Authorization: `Bot ${token}` },
            });
            if (guildRes.ok) {
              const guild = await guildRes.json();
              const count = String(guild.approximate_member_count || guild.member_count || "unknown");
              if (block.variableKey) ctx[block.variableKey] = count;
              else replyContent += (replyContent ? "\n" : "") + count;
            }
          } catch { if (block.variableKey) ctx[block.variableKey] = "error"; }
          break;
        }
        case "channel_count": {
          try {
            const chRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
              headers: { Authorization: `Bot ${token}` },
            });
            if (chRes.ok) {
              const channels = await chRes.json();
              const count = String(channels.length);
              if (block.variableKey) ctx[block.variableKey] = count;
              else replyContent += (replyContent ? "\n" : "") + count;
            }
          } catch { if (block.variableKey) ctx[block.variableKey] = "error"; }
          break;
        }
        case "server_info": {
          try {
            const guildRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
              headers: { Authorization: `Bot ${token}` },
            });
            if (guildRes.ok) {
              const guild = await guildRes.json();
              const info = `**${guild.name}** | Members: ${guild.approximate_member_count || "?"} | Created: <t:${Math.floor(Number(BigInt(guild.id) >> 22n) / 1000 + 1420070400)}:R>`;
              if (block.variableKey) ctx[block.variableKey] = info;
              else replyContent += (replyContent ? "\n" : "") + info;
            }
          } catch { if (block.variableKey) ctx[block.variableKey] = "error"; }
          break;
        }
        case "user_info": {
          try {
            const memberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
              headers: { Authorization: `Bot ${token}` },
            });
            if (memberRes.ok) {
              const member = await memberRes.json();
              const joinedAt = member.joined_at ? `<t:${Math.floor(new Date(member.joined_at).getTime() / 1000)}:R>` : "?";
              const roleCount = (member.roles || []).length;
              const info = `**${member.user?.username || userName}** | Joined: ${joinedAt} | Roles: ${roleCount}`;
              if (block.variableKey) ctx[block.variableKey] = info;
              else replyContent += (replyContent ? "\n" : "") + info;
            }
          } catch { if (block.variableKey) ctx[block.variableKey] = "error"; }
          break;
        }
        case "math": {
          try {
            const expr = resolve(block.value || "0");
            // Safe math eval: only allow numbers, operators, parentheses
            const sanitized = expr.replace(/[^0-9+\-*/().% ]/g, "");
            const result = String(Function(`"use strict"; return (${sanitized})`)());
            if (block.variableKey) ctx[block.variableKey] = result;
            else replyContent += (replyContent ? "\n" : "") + result;
          } catch { if (block.variableKey) ctx[block.variableKey] = "NaN"; }
          break;
        }
        case "random_choice": {
          const choices = (block.value || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
          const pick = choices[Math.floor(Math.random() * choices.length)] || "";
          if (block.variableKey) ctx[block.variableKey] = resolve(pick);
          else replyContent += (replyContent ? "\n" : "") + resolve(pick);
          break;
        }
        case "wait": {
          const secs = Math.min(parseInt(block.value || "1") || 1, 5);
          await new Promise((r) => setTimeout(r, secs * 1000));
          break;
        }
        case "condition":
        case "check_role":
        case "check_permission":
        case "check_channel":
        case "cooldown_check": {
          // Conditions: skip rest if failed (simplified)
          const val = resolve(block.value || "");
          if (block.type === "check_role") {
            const hasRole = (interaction.member?.roles || []).includes(val);
            if (!hasRole) return { content: `❌ You need the <@&${val}> role.`, embeds: [] };
          }
          if (block.type === "check_channel") {
            if (channelId !== val) return { content: `❌ This command can only be used in <#${val}>.`, embeds: [] };
          }
          break;
        }
        case "create_thread": {
          const parts = (block.value || "").split("|").map((s: string) => s.trim());
          const threadName = resolve(parts[0] || "Thread");
          const initialMsg = resolve(parts[1] || "");
          try {
            const threadRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/threads`, {
              method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ name: threadName, type: 11 }),
            });
            if (threadRes.ok && initialMsg) {
              const thread = await threadRes.json();
              await fetch(`https://discord.com/api/v10/channels/${thread.id}/messages`, {
                method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ content: initialMsg }),
              });
            }
          } catch { /* thread creation failed */ }
          break;
        }
        case "log_error":
        case "run_event":
        default:
          break;
      }

      // Store variable output
      if (block.variableKey && block.type === "reply") {
        ctx[block.variableKey] = resolve(block.value || "");
      }
    } catch (err: any) {
      console.error(`Block ${block.type} error:`, err.message);
    }
  }

  // Final resolve on reply content (in case variables were set by later blocks)
  replyContent = replyContent.replace(/\{([\w.]+)\}/g, (match: string, key: string) => ctx[key] ?? match);

  return { content: replyContent || null, embeds };
}

// ─── Deploy Ticket Panel ──────────────────────────────────────────
async function deployTicketPanel(adminClient: any, payload: any) {
  const { bot_id, channel_id, categories } = payload;
  const { data: bot } = await adminClient.from("bots").select("*").eq("id", bot_id).maybeSingle();
  if (!bot) return respond({ error: "Bot not found" });

  const token = atob(bot.token_encrypted);
  const components: any[] = [];
  const row: any = { type: 1, components: [] };

  (categories || []).forEach((cat: any, i: number) => {
    if (row.components.length >= 5) {
      components.push({ ...row });
      row.components = [];
    }
    row.components.push({
      type: 2,
      style: 1,
      label: `${cat.emoji} ${cat.name}`,
      custom_id: `ticket_cat_${i}_${cat.name.replace(/\s/g, "_").toLowerCase()}`,
    });
  });
  if (row.components.length > 0) components.push(row);

  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: "🎫 Create a Support Ticket",
        description: "Select a category below to open a new ticket.\nA private channel will be created for you.",
        color: 0x5865f2,
      }],
      components,
    }),
  });

  if (!msgRes.ok) {
    const err = await msgRes.json();
    console.error("Panel deploy error:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to send panel" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Giveaway Entry Handler ────────────────────────────────────────
async function handleGiveawayEntry(interaction: any, bot: any, token: string, adminClient: any) {
  const userId = interaction.member?.user?.id;
  const memberRoles: string[] = interaction.member?.roles || [];
  const customId = interaction.data?.custom_id || "";
  const messageId = interaction.message?.id;

  if (!messageId) {
    return respond({ type: 4, data: { content: "❌ Could not identify giveaway.", flags: 64 } });
  }

  // Find active giveaway by message_id
  const { data: giveaway } = await adminClient.from("active_giveaways").select("*").eq("message_id", messageId).eq("ended", false).maybeSingle();
  if (!giveaway) {
    return respond({ type: 4, data: { content: "❌ This giveaway has already ended.", flags: 64 } });
  }

  // Check role/bypass requirements from giveaway config
  const { data: mod } = await adminClient.from("bot_modules").select("config").eq("bot_id", bot.id).eq("module_name", "giveaways").maybeSingle();
  const giveaways = (mod?.config as any)?.giveaways || [];
  const template = giveaways.find((g: any) => g.prize === giveaway.prize) || giveaways[0];

  if (template) {
    const hasBypass = template.bypassRole && memberRoles.includes(template.bypassRole);
    if (!hasBypass && template.roleRequirement && !memberRoles.includes(template.roleRequirement)) {
      return respond({ type: 4, data: { content: `❌ You need the <@&${template.roleRequirement}> role to enter.`, flags: 64 } });
    }
  }

  // Insert entry (unique constraint handles duplicates)
  const { error } = await adminClient.from("giveaway_entries").insert({ giveaway_id: giveaway.id, user_id: userId });
  if (error && error.code === "23505") {
    return respond({ type: 4, data: { content: "⚠️ You already entered this giveaway!", flags: 64 } });
  }

  // Count entries
  const { count } = await adminClient.from("giveaway_entries").select("*", { count: "exact", head: true }).eq("giveaway_id", giveaway.id);

  return respond({ type: 4, data: { content: `🎉 You have entered the giveaway! (${count || 1} total entries) Good luck!`, flags: 64 } });
}

// ─── Ticket Close Handler ─────────────────────────────────────────
async function handleTicketClose(interaction: any, bot: any, token: string, adminClient: any) {
  const channelId = interaction.channel_id;

  // Log ticket close
  adminClient.from("bot_logs").insert({
    bot_id: bot.id, user_id: bot.user_id, level: "info", source: "tickets",
    message: `Ticket closed by ${interaction.member?.user?.username || "unknown"} in channel ${channelId}`,
  });

  // Send closing message first
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "🔒 This ticket is being closed..." }),
  });

  // Delete the channel
  const delRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${token}` },
  });

  if (!delRes.ok) {
    return respond({ type: 4, data: { content: "❌ Failed to close ticket. Bot needs Manage Channels permission.", flags: 64 } });
  }

  return respond({ type: 4, data: { content: "🔒 Ticket closed.", flags: 64 } });
}

// ─── Ticket Claim Handler ─────────────────────────────────────────
async function handleTicketClaim(interaction: any, bot: any, token: string, adminClient: any) {
  const channelId = interaction.channel_id;
  const userId = interaction.member?.user?.id;
  const username = interaction.member?.user?.username || "Staff";

  // Load ticket config to check if user has support role
  const { data: config } = await adminClient.from("ticket_config").select("*").eq("bot_id", bot.id).maybeSingle();
  const supportRoleIds: string[] = (config?.support_role_ids as string[]) || [];
  // Also check legacy single role
  if (config?.support_role_id && !supportRoleIds.includes(config.support_role_id)) {
    supportRoleIds.push(config.support_role_id);
  }
  const memberRoles: string[] = interaction.member?.roles || [];
  const hasSupport = supportRoleIds.length === 0 || supportRoleIds.some(r => memberRoles.includes(r));

  if (!hasSupport) {
    return respond({ type: 4, data: { content: "❌ Only support staff can claim tickets.", flags: 64 } });
  }

  // Update the channel topic to show who claimed it
  await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ topic: `Claimed by ${username}` }),
  });

  // Send claim message
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        description: `✅ This ticket has been claimed by <@${userId}>`,
        color: 0x57f287,
      }],
    }),
  });

  // Update the original message to disable claim button
  if (interaction.message?.id) {
    const originalComponents = interaction.message.components || [];
    const updatedComponents = originalComponents.map((row: any) => ({
      ...row,
      components: row.components?.map((btn: any) => {
        if (btn.custom_id?.startsWith("ticket_claim_")) {
          return { ...btn, disabled: true, label: `✅ Claimed by ${username}` };
        }
        return btn;
      }),
    }));

    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${interaction.message.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ components: updatedComponents }),
    });
  }

  return respond({ type: 4, data: { content: `✅ You claimed this ticket.`, flags: 64 } });
}

// ─── Ticket Button Handler (create new ticket) ────────────────────
async function handleTicketButton(interaction: any, bot: any, token: string, adminClient: any) {
  const userId = interaction.member?.user?.id;
  const guildId = interaction.guild_id;
  const customId = interaction.data?.custom_id || "";
  // custom_id format: ticket_cat_{index}_{category_name}
  const parts = customId.replace("ticket_cat_", "").split("_");
  const categoryName = parts.slice(1).join("_").replace(/_/g, " ");

  // Load ticket config
  const { data: config } = await adminClient.from("ticket_config").select("*").eq("bot_id", bot.id).maybeSingle();
  if (!config?.enabled) {
    return respond({ type: 4, data: { content: "❌ Ticket system is not enabled.", flags: 64 } });
  }

  const categoryId = config.category_id;
  const welcomeMessage = config.welcome_message || "Thank you for creating a ticket!";

  // Get all support role IDs
  const supportRoleIds: string[] = (config.support_role_ids as string[]) || [];
  if (config.support_role_id && !supportRoleIds.includes(config.support_role_id)) {
    supportRoleIds.push(config.support_role_id);
  }

  const ticketNumber = String(Date.now()).slice(-4).padStart(4, "0");
  const channelName = `ticket-${ticketNumber}`;

  // Permission overwrites
  const permissionOverwrites: any[] = [
    { id: guildId, type: 0, deny: "1024" },
    { id: userId, type: 1, allow: "3072" },
  ];
  for (const roleId of supportRoleIds) {
    if (roleId) permissionOverwrites.push({ id: roleId, type: 0, allow: "3072" });
  }

  const channelPayload: any = {
    name: channelName,
    type: 0,
    permission_overwrites: permissionOverwrites,
  };
  if (categoryId) channelPayload.parent_id = categoryId;

  const chRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(channelPayload),
  });

  if (!chRes.ok) {
    const err = await chRes.json();
    console.error("Ticket channel error:", err);
    return respond({ type: 4, data: { content: "❌ Failed to create ticket channel. Make sure the bot has Manage Channels permission.", flags: 64 } });
  }

  const newChannel = await chRes.json();

  // Build support role pings
  const rolePings = supportRoleIds.filter(Boolean).map(r => `<@&${r}>`).join(" ");

  const msg = welcomeMessage
    .replace("{user}", `<@${userId}>`)
    .replace("{ticket_id}", channelName)
    .replace("{category}", categoryName);

  // Send welcome message with close + claim buttons, ping support roles
  await fetch(`https://discord.com/api/v10/channels/${newChannel.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content: rolePings ? `${rolePings} — New ticket from <@${userId}>` : undefined,
      embeds: [{
        title: `🎫 ${categoryName || "Support Ticket"}`,
        description: msg,
        color: 0x5865f2,
        footer: { text: `Ticket ${channelName}` },
      }],
      components: [{
        type: 1,
        components: [
          {
            type: 2,
            style: 3, // Success green
            label: "🙋 Claim Ticket",
            custom_id: `ticket_claim_${newChannel.id}`,
          },
          {
            type: 2,
            style: 4, // Danger red
            label: "🔒 Close Ticket",
            custom_id: `ticket_close_${newChannel.id}`,
          },
        ],
      }],
    }),
  });

  // Log
  adminClient.from("bot_logs").insert({
    bot_id: bot.id, user_id: bot.user_id, level: "info", source: "tickets",
    message: `Ticket ${channelName} created by ${interaction.member?.user?.username || userId} (${categoryName})`,
  });

  return respond({
    type: 4,
    data: { content: `✅ Your ticket has been created: <#${newChannel.id}>`, flags: 64 },
  });
}

// ─── Auto-End Giveaways ────────────────────────────────────────────
async function autoEndGiveaways(adminClient: any) {
  const now = new Date().toISOString();
  const { data: expiredGiveaways } = await adminClient
    .from("active_giveaways")
    .select("*")
    .eq("ended", false)
    .lte("ends_at", now);

  if (!expiredGiveaways?.length) {
    return new Response(JSON.stringify({ ended: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let endedCount = 0;
  for (const giveaway of expiredGiveaways) {
    try {
      const { data: bot } = await adminClient.from("bots").select("*").eq("id", giveaway.bot_id).maybeSingle();
      if (!bot) continue;
      const token = atob(bot.token_encrypted);

      // Get all entries
      const { data: entries } = await adminClient.from("giveaway_entries").select("user_id").eq("giveaway_id", giveaway.id);
      const entryList = entries || [];

      // Pick random winners
      const winnersCount = Math.min(giveaway.winners_count, entryList.length);
      const shuffled = entryList.sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, winnersCount);
      const winnerMentions = winners.map((w: any) => `<@${w.user_id}>`);

      const endColor = giveaway.end_color ? parseInt(String(giveaway.end_color).replace("#", ""), 16) : 0xff4444;

      const winnerText = winnerMentions.length > 0
        ? `🏆 **Winner${winnerMentions.length > 1 ? "s" : ""}:** ${winnerMentions.join(", ")}`
        : "No valid entries — no winners.";

      // Edit the original giveaway message
      await fetch(`https://discord.com/api/v10/channels/${giveaway.channel_id}/messages/${giveaway.message_id}`, {
        method: "PATCH",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "🎉 GIVEAWAY ENDED 🎉",
            description: `**${giveaway.prize}**\n\n${winnerText}\n\n📊 **Total Entries:** ${entryList.length}`,
            color: endColor,
            footer: { text: "Giveaway ended" },
            timestamp: new Date().toISOString(),
          }],
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 2, // Grey
              label: "🎉 Giveaway Ended",
              custom_id: `giveaway_ended_${giveaway.message_id}`,
              disabled: true,
            }],
          }],
        }),
      });

      // Send winner announcement
      if (winnerMentions.length > 0) {
        await fetch(`https://discord.com/api/v10/channels/${giveaway.channel_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `🎉 Congratulations ${winnerMentions.join(", ")}! You won **${giveaway.prize}**!`,
          }),
        });
      }

      // Mark as ended
      await adminClient.from("active_giveaways").update({ ended: true }).eq("id", giveaway.id);
      endedCount++;
    } catch (err) {
      console.error("Error ending giveaway:", err);
    }
  }

  return new Response(JSON.stringify({ ended: endedCount }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Module Command Handler ─────────────────────────────────────
async function handleModuleCommand(
  commandName: string, subCommand: string | undefined, interaction: any,
  modules: Record<string, any>, token: string, adminClient: any, bot: any, memberRoles: string[]
): Promise<any | null> {
  const userId = interaction.member?.user?.id;
  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;

  // ── Giveaway Commands ──
  if (commandName === "giveaway" && modules.giveaways) {
    const config = modules.giveaways;
    const giveaways = (config.giveaways as any[]) || [];

    // Check allowed roles for giveaway commands
    const giveawayAllowedRoles = (config.allowedRoles as string[]) || [];
    if (giveawayAllowedRoles.length > 0 && !giveawayAllowedRoles.some((r: string) => memberRoles.includes(r))) {
      return { type: 4, data: { content: "❌ You don't have permission to use giveaway commands.", flags: 64 } };
    }
    if (subCommand === "start") {
      const getOpt = (name: string) => interaction.data?.options?.[0]?.options?.find((o: any) => o.name === name)?.value;
      const prize = getOpt("prize") || "Amazing Prize";
      const durationStr = getOpt("duration") || "1d";
      const winners = getOpt("winners") || 1;
      const colorOpt = getOpt("color");
      const channelOpt = getOpt("channel");
      const hostOpt = getOpt("host");
      const winnerDm = getOpt("winner-dm") || "";
      const requiredMsgs = getOpt("required-messages") || 0;
      const bypassRoleOpt = getOpt("bypass-role");

      const targetChannel = channelOpt || channelId;

      const template = giveaways.find((g: any) => g.prize === prize) || giveaways[0] || {};
      const durationSecs = parseDuration(String(durationStr));
      const endTime = Math.floor(Date.now() / 1000) + durationSecs;
      const color = colorOpt ? parseInt(String(colorOpt).replace("#", ""), 16) : (template.color ? parseInt(String(template.color).replace("#", ""), 16) : 0xffd700);
      const endColor = template.endColor || "#FF4444";

      const roleReq = template.roleRequirement || "";
      const bypassRole = bypassRoleOpt || template.bypassRole || "";
      const reqMessages = requiredMsgs || template.requiredMessages || 0;

      const requirements: string[] = [];
      if (roleReq) requirements.push(`🔒 Required Role: <@&${roleReq}>`);
      if (reqMessages > 0) requirements.push(`💬 Min ${reqMessages} messages required`);
      if (bypassRole) requirements.push(`⚡ Bypass Role: <@&${bypassRole}>`);

      const hostLine = hostOpt ? `\n👑 **Hosted by:** <@${hostOpt}>` : "";

      const embed = {
        title: "🎉 GIVEAWAY 🎉",
        description: `**${prize}**\n\nClick the button below to enter!\n\n🏆 **Winners:** ${winners}\n⏰ **Ends:** <t:${endTime}:R>${hostLine}\n${requirements.length > 0 ? "\n" + requirements.join("\n") : ""}`,
        color,
        footer: { text: `${winners} winner(s) • Ends` },
        timestamp: new Date(endTime * 1000).toISOString(),
      };

      const msgRes = await fetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [embed],
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 3,
              label: "🎉 Enter Giveaway",
              custom_id: `giveaway_enter_${Date.now()}`,
            }],
          }],
        }),
      });

      if (msgRes.ok) {
        const sentMsg = await msgRes.json();
        await adminClient.from("active_giveaways").insert({
          bot_id: bot.id,
          message_id: sentMsg.id,
          channel_id: targetChannel,
          guild_id: guildId,
          prize,
          winners_count: winners,
          ends_at: new Date(endTime * 1000).toISOString(),
          color: colorOpt || template.color || "#FFD700",
          end_color: endColor,
        });
        return { type: 4, data: { content: `🎉 Giveaway for **${prize}** started${targetChannel !== channelId ? ` in <#${targetChannel}>` : ""}! Ends <t:${endTime}:R>`, flags: 64 } };
      }
      return { type: 4, data: { content: "❌ Failed to create giveaway.", flags: 64 } };
    }

    if (subCommand === "end") {
      // End all active giveaways in this channel
      const { data: activeGiveaways } = await adminClient.from("active_giveaways").select("*").eq("bot_id", bot.id).eq("channel_id", channelId).eq("ended", false);
      if (!activeGiveaways?.length) {
        return { type: 4, data: { content: "❌ No active giveaways in this channel.", flags: 64 } };
      }
      // Force end by setting ends_at to now
      for (const g of activeGiveaways) {
        await adminClient.from("active_giveaways").update({ ends_at: new Date().toISOString() }).eq("id", g.id);
      }
      // Trigger auto-end
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      await fetch(`${supabaseUrl}/functions/v1/discord-interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end_giveaways" }),
      });
      return { type: 4, data: { content: `✅ Ending ${activeGiveaways.length} giveaway(s)... Winners will be announced shortly.`, flags: 64 } };
    }

    if (subCommand === "reroll") {
      // Find most recent ended giveaway in this channel
      const { data: ended } = await adminClient.from("active_giveaways").select("*").eq("bot_id", bot.id).eq("channel_id", channelId).eq("ended", true).order("ends_at", { ascending: false }).limit(1);
      if (!ended?.length) {
        return { type: 4, data: { content: "❌ No ended giveaways to reroll.", flags: 64 } };
      }
      const giveaway = ended[0];
      const { data: entries } = await adminClient.from("giveaway_entries").select("user_id").eq("giveaway_id", giveaway.id);
      if (!entries?.length) {
        return { type: 4, data: { content: "❌ No entries to reroll from.", flags: 64 } };
      }
      const shuffled = entries.sort(() => Math.random() - 0.5);
      const newWinners = shuffled.slice(0, Math.min(giveaway.winners_count, entries.length));
      const mentions = newWinners.map((w: any) => `<@${w.user_id}>`).join(", ");

      await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: `🎉 **Reroll!** New winner${newWinners.length > 1 ? "s" : ""}: ${mentions} for **${giveaway.prize}**!` }),
      });
      return { type: 4, data: { content: `✅ Rerolled! New winners: ${mentions}`, flags: 64 } };
    }

    if (subCommand === "list") {
      const list = giveaways.map((g: any, i: number) => {
        const reqs: string[] = [];
        if (g.roleRequirement) reqs.push(`Role: <@&${g.roleRequirement}>`);
        if (g.requiredMessages > 0) reqs.push(`${g.requiredMessages} msgs`);
        return `${i + 1}. **${g.prize || "No prize"}** (${g.winners} winners, ${g.duration || "1d"})${reqs.length ? " — " + reqs.join(", ") : ""}`;
      }).join("\n") || "No giveaway templates configured.";
      return { type: 4, data: { content: `📋 **Giveaway Templates:**\n${list}`, flags: 64 } };
    }
  }

  // ── Ticket Commands ──
  if (commandName === "ticket") {
    const { data: ticketConfig } = await adminClient.from("ticket_config").select("*").eq("bot_id", bot.id).maybeSingle();
    if (!ticketConfig?.enabled) {
      return { type: 4, data: { content: "❌ Ticket system is not enabled.", flags: 64 } };
    }

    // Check allowed roles for ticket commands
    if (modules.tickets) {
      const ticketAllowedRoles = (modules.tickets.allowedRoles as string[]) || [];
      if (ticketAllowedRoles.length > 0 && !ticketAllowedRoles.some((r: string) => memberRoles.includes(r))) {
        return { type: 4, data: { content: "❌ You don't have permission to use ticket commands.", flags: 64 } };
      }
    }

    if (subCommand === "open") {
      const categoryName = interaction.data?.options?.[0]?.options?.find((o: any) => o.name === "category")?.value || "General Support";
      const ticketNumber = String(Date.now()).slice(-4).padStart(4, "0");
      const channelName = `ticket-${ticketNumber}`;

      const supportRoleIds: string[] = (ticketConfig.support_role_ids as string[]) || [];
      if (ticketConfig.support_role_id && !supportRoleIds.includes(ticketConfig.support_role_id)) {
        supportRoleIds.push(ticketConfig.support_role_id);
      }

      const permissionOverwrites: any[] = [
        { id: guildId, type: 0, deny: "1024" },
        { id: userId, type: 1, allow: "3072" },
      ];
      for (const roleId of supportRoleIds) {
        if (roleId) permissionOverwrites.push({ id: roleId, type: 0, allow: "3072" });
      }

      const channelPayload: any = { name: channelName, type: 0, permission_overwrites: permissionOverwrites };
      if (ticketConfig.category_id) channelPayload.parent_id = ticketConfig.category_id;

      const chRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(channelPayload),
      });

      if (!chRes.ok) return { type: 4, data: { content: "❌ Failed to create ticket. Bot needs Manage Channels permission.", flags: 64 } };
      const ch = await chRes.json();

      const rolePings = supportRoleIds.filter(Boolean).map(r => `<@&${r}>`).join(" ");
      const msg = (ticketConfig.welcome_message || "Ticket created!")
        .replace("{user}", `<@${userId}>`)
        .replace("{ticket_id}", channelName)
        .replace("{category}", categoryName);

      await fetch(`https://discord.com/api/v10/channels/${ch.id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          content: rolePings ? `${rolePings} — New ticket from <@${userId}>` : undefined,
          embeds: [{ title: `🎫 ${categoryName}`, description: msg, color: 0x5865f2, footer: { text: `Ticket ${channelName}` } }],
          components: [{
            type: 1,
            components: [
              { type: 2, style: 3, label: "🙋 Claim Ticket", custom_id: `ticket_claim_${ch.id}` },
              { type: 2, style: 4, label: "🔒 Close Ticket", custom_id: `ticket_close_${ch.id}` },
            ],
          }],
        }),
      });

      return { type: 4, data: { content: `✅ Ticket created: <#${ch.id}>`, flags: 64 } };
    }

    if (subCommand === "close") {
      await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
        method: "DELETE",
        headers: { Authorization: `Bot ${token}` },
      });
      return { type: 4, data: { content: "🔒 Ticket closed.", flags: 64 } };
    }
  }

  // ── Poll Commands ──
  if (commandName === "poll" && modules.polls) {
    const config = modules.polls;
    const pollTemplates = (config.polls as any[]) || [];

    // Check allowed roles (module-level)
    const pollAllowedRoles = (config.allowedRoles as string[]) || [];
    if (pollAllowedRoles.length > 0 && !pollAllowedRoles.some((r: string) => memberRoles.includes(r))) {
      return { type: 4, data: { content: "❌ You don't have permission to use poll commands.", flags: 64 } };
    }

    if (subCommand === "create" || !subCommand) {
      const getOpt = (name: string) => {
        // Handle both flat options and subcommand options
        const flatOpt = interaction.data?.options?.find((o: any) => o.name === name)?.value;
        if (flatOpt !== undefined) return flatOpt;
        const subOpts = interaction.data?.options?.[0]?.options;
        return subOpts?.find((o: any) => o.name === name)?.value;
      };

      const question = getOpt("question") || "No question";
      const optionsRaw = getOpt("options") || "";
      const durationStr = getOpt("duration") || (pollTemplates[0]?.duration || "1d");
      const channelOpt = getOpt("channel");
      const targetChannel = channelOpt || channelId;
      const multipleChoice = pollTemplates[0]?.multipleChoice || false;

      const opts = optionsRaw ? String(optionsRaw).split(",").map((o: string) => o.trim()).filter(Boolean) : ["Yes", "No"];
      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      const durationSecs = parseDuration(String(durationStr));
      const endTime = Math.floor(Date.now() / 1000) + durationSecs;

      const description = opts.map((o: string, i: number) => `${emojis[i] || "▫️"} ${o} — **0 votes**`).join("\n");
      const embed = {
        title: `📊 ${question}`,
        description: `${description}\n\n⏰ Ends <t:${endTime}:R>${multipleChoice ? "\n✅ Multiple choices allowed" : ""}`,
        color: 0x5865f2,
        footer: { text: `Poll by ${interaction.member?.user?.username || "someone"} • 0 total votes` },
      };

      // Build vote buttons
      const components: any[] = [];
      let currentRow: any = { type: 1, components: [] };
      const pollId = `${Date.now()}`;
      opts.forEach((opt: string, i: number) => {
        if (currentRow.components.length >= 5) {
          components.push(currentRow);
          currentRow = { type: 1, components: [] };
        }
        currentRow.components.push({
          type: 2,
          style: 2,
          label: `${emojis[i] || "▫️"} ${opt}`,
          custom_id: `poll_vote_${pollId}_${i}`,
        });
      });
      if (currentRow.components.length > 0) components.push(currentRow);

      const msgRes = await fetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed], components }),
      });

      if (msgRes.ok) {
        const msg = await msgRes.json();
        // Store active poll
        const votes: Record<string, string[]> = {};
        opts.forEach((_: string, i: number) => { votes[String(i)] = []; });
        await adminClient.from("active_polls").insert({
          bot_id: bot.id,
          message_id: msg.id,
          channel_id: targetChannel,
          guild_id: guildId,
          question,
          options: opts,
          votes,
          ends_at: new Date(endTime * 1000).toISOString(),
          multiple_choice: multipleChoice,
          anonymous: pollTemplates[0]?.anonymous || false,
        });
        return { type: 4, data: { content: `📊 Poll created! Ends <t:${endTime}:R>`, flags: 64 } };
      }
      return { type: 4, data: { content: "❌ Failed to create poll.", flags: 64 } };
    }

    if (subCommand === "end") {
      const { data: activePolls } = await adminClient.from("active_polls").select("*").eq("bot_id", bot.id).eq("channel_id", channelId).eq("ended", false);
      if (!activePolls?.length) return { type: 4, data: { content: "❌ No active polls in this channel.", flags: 64 } };
      for (const p of activePolls) {
        await adminClient.from("active_polls").update({ ends_at: new Date().toISOString() }).eq("id", p.id);
      }
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      await fetch(`${supabaseUrl}/functions/v1/discord-interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end_polls" }),
      });
      return { type: 4, data: { content: `✅ Ending ${activePolls.length} poll(s)... Results will be posted shortly.`, flags: 64 } };
    }

    if (subCommand === "results") {
      const { data: recentPoll } = await adminClient.from("active_polls").select("*").eq("bot_id", bot.id).eq("channel_id", channelId).eq("ended", true).order("ends_at", { ascending: false }).limit(1);
      if (!recentPoll?.length) return { type: 4, data: { content: "❌ No ended polls found in this channel.", flags: 64 } };
      const p = recentPoll[0];
      const resultsEmbed = buildPollResultsEmbed(p);
      return { type: 4, data: { embeds: [resultsEmbed] } };
    }
  }

  // ── Leveling Commands ──
  if (commandName === "rank") {
    const { data: levelConfig } = await adminClient.from("leveling_config").select("*").eq("bot_id", bot.id).maybeSingle();
    if (!levelConfig?.enabled) return { type: 4, data: { content: "❌ Leveling is not enabled.", flags: 64 } };
    const targetUser = interaction.data?.options?.find((o: any) => o.name === "user")?.value || userId;
    const { data: levelData } = await adminClient.from("user_levels").select("*").eq("bot_id", bot.id).eq("user_id", targetUser).eq("guild_id", guildId).maybeSingle();
    if (!levelData) return { type: 4, data: { content: `<@${targetUser}> has no XP yet. Start chatting!`, flags: 0 } };
    const xpForNext = 5 * levelData.level * levelData.level + 50 * levelData.level + 100;
    return { type: 4, data: { embeds: [{ title: "📊 Rank Card", description: `**<@${targetUser}>**\n\n🏆 **Level:** ${levelData.level}\n⭐ **XP:** ${levelData.xp} / ${xpForNext}`, color: 0x5865f2 }] } };
  }

  if (commandName === "leaderboard") {
    const { data: levels } = await adminClient.from("user_levels").select("*").eq("bot_id", bot.id).eq("guild_id", guildId).order("level", { ascending: false }).order("xp", { ascending: false }).limit(10);
    if (!levels?.length) return { type: 4, data: { content: "No leveling data yet.", flags: 64 } };
    const medals = ["🥇", "🥈", "🥉"];
    const list = levels.map((l: any, i: number) => `${medals[i] || `**${i + 1}.**`} <@${l.user_id}> — Level ${l.level} (${l.xp} XP)`).join("\n");
    return { type: 4, data: { embeds: [{ title: "🏆 Leaderboard", description: list, color: 0xffd700 }] } };
  }

  // ── Music Commands ──
  if (["play", "skip", "pause", "resume", "stop", "queue", "nowplaying", "volume", "shuffle", "loop", "remove", "clear"].includes(commandName)) {
    if (!modules.music) return { type: 4, data: { content: "❌ Music module is not enabled.", flags: 64 } };
    const musicConfig = modules.music;
    if (musicConfig.djOnly && musicConfig.djRoleId && !memberRoles.includes(musicConfig.djRoleId)) {
      return { type: 4, data: { content: "❌ Only DJs can use music commands.", flags: 64 } };
    }
    return { type: 4, data: { content: "🎵 Music commands require a persistent connection. Export your bot to run locally with full music support.", flags: 64 } };
  }

  // ── Help Command ──
  if (commandName === "help") {
    const sections: string[] = ["**📋 Available Commands:**"];
    const { data: cmds } = await adminClient.from("commands").select("name, description").eq("bot_id", bot.id).eq("enabled", true);
    if (cmds?.length) {
      sections.push("\n__Custom Commands__");
      cmds.forEach((c: any) => sections.push(`\`/${c.name.replace(/^\//, "")}\` — ${c.description || "No description"}`));
    }
    if (modules.giveaways) sections.push("\n__Giveaways__\n`/giveaway start` `/giveaway end` `/giveaway reroll` `/giveaway list`");
    if (modules.polls) sections.push("\n__Polls__\n`/poll`");
    sections.push("\n__Leveling__\n`/rank` `/leaderboard`");
    sections.push("\n__Tickets__\n`/ticket open` `/ticket close`");
    if (modules.music) sections.push("\n__Music__\n`/play` `/skip` `/pause` `/stop` `/queue` `/volume`");
    return { type: 4, data: { embeds: [{ title: "📖 Help", description: sections.join("\n"), color: 0x5865f2 }] } };
  }

  return null;
}

// ─── Deploy Reaction Role Panel ───────────────────────────────────
async function deployReactionRolePanel(adminClient: any, payload: any) {
  const { bot_id, channel_id, message_text, roles } = payload;
  const { data: bot } = await adminClient.from("bots").select("*").eq("id", bot_id).maybeSingle();
  if (!bot) return respond({ error: "Bot not found" });

  const token = atob(bot.token_encrypted);
  const components: any[] = [];
  let currentRow: any = { type: 1, components: [] };

  (roles || []).forEach((role: any) => {
    if (currentRow.components.length >= 5) {
      components.push(currentRow);
      currentRow = { type: 1, components: [] };
    }
    currentRow.components.push({
      type: 2,
      style: 2, // grey/secondary
      label: `${role.emoji} ${role.roleName}`,
      custom_id: `rr_${role.roleId}`,
    });
  });
  if (currentRow.components.length > 0) components.push(currentRow);

  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: "🎭 Role Menu",
        description: message_text || "Click a button to get or remove a role!",
        color: 0x5865f2,
      }],
      components,
    }),
  });

  if (!msgRes.ok) {
    const err = await msgRes.json();
    console.error("Reaction role panel error:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to send panel" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Reaction Role Button Handler (toggle role) ───────────────────
async function handleReactionRoleButton(interaction: any, bot: any, token: string) {
  const customId = interaction.data?.custom_id || "";
  const roleId = customId.replace("rr_", "");
  const userId = interaction.member?.user?.id;
  const guildId = interaction.guild_id;
  const memberRoles: string[] = interaction.member?.roles || [];

  const hasRole = memberRoles.includes(roleId);

  if (hasRole) {
    // Remove role
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      return respond({ type: 4, data: { content: "❌ Failed to remove role. Bot needs Manage Roles permission and the role must be below the bot's role.", flags: 64 } });
    }
    return respond({ type: 4, data: { content: `✅ Removed <@&${roleId}> from you.`, flags: 64 } });
  } else {
    // Add role
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      return respond({ type: 4, data: { content: "❌ Failed to add role. Bot needs Manage Roles permission and the role must be below the bot's role.", flags: 64 } });
    }
    return respond({ type: 4, data: { content: `✅ Added <@&${roleId}> to you!`, flags: 64 } });
  }
}

// ─── Poll Vote Handler ────────────────────────────────────────────
async function handlePollVote(interaction: any, bot: any, token: string, adminClient: any) {
  const userId = interaction.member?.user?.id;
  const messageId = interaction.message?.id;
  const customId = interaction.data?.custom_id || "";
  // Format: poll_vote_{pollId}_{optionIndex}
  const parts = customId.split("_");
  const optionIndex = parts[parts.length - 1];

  if (!messageId) {
    return respond({ type: 4, data: { content: "❌ Could not identify poll.", flags: 64 } });
  }

  const { data: poll } = await adminClient.from("active_polls").select("*").eq("message_id", messageId).eq("ended", false).maybeSingle();
  if (!poll) {
    return respond({ type: 4, data: { content: "❌ This poll has already ended.", flags: 64 } });
  }

  const votes = (poll.votes as Record<string, string[]>) || {};
  const options = (poll.options as string[]) || [];

  // Check if user already voted on this option
  const currentVoters = votes[optionIndex] || [];
  const alreadyVoted = currentVoters.includes(userId);

  if (alreadyVoted) {
    // Remove vote
    votes[optionIndex] = currentVoters.filter((id: string) => id !== userId);
  } else {
    // If not multiple choice, remove from all other options first
    if (!poll.multiple_choice) {
      for (const key of Object.keys(votes)) {
        votes[key] = (votes[key] || []).filter((id: string) => id !== userId);
      }
    }
    votes[optionIndex] = [...(votes[optionIndex] || []), userId];
  }

  // Update votes in DB
  await adminClient.from("active_polls").update({ votes }).eq("id", poll.id);

  // Calculate totals for embed update
  const totalVotes = Object.values(votes).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0);
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  const endTime = Math.floor(new Date(poll.ends_at).getTime() / 1000);

  const description = options.map((opt: string, i: number) => {
    const count = (votes[String(i)] || []).length;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    return `${emojis[i] || "▫️"} ${opt} — **${count} vote${count !== 1 ? "s" : ""}** (${pct}%)\n${bar}`;
  }).join("\n");

  const embed = {
    title: `📊 ${poll.question}`,
    description: `${description}\n\n⏰ Ends <t:${endTime}:R>${poll.multiple_choice ? "\n✅ Multiple choices allowed" : ""}`,
    color: 0x5865f2,
    footer: { text: `${totalVotes} total vote${totalVotes !== 1 ? "s" : ""}` },
  };

  // Update the original message embed
  await fetch(`https://discord.com/api/v10/channels/${poll.channel_id}/messages/${messageId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  const action = alreadyVoted ? "removed" : "recorded";
  return respond({ type: 4, data: { content: `✅ Vote ${action} for **${options[parseInt(optionIndex)] || "option"}**!`, flags: 64 } });
}

// ─── Build Poll Results Embed ─────────────────────────────────────
function buildPollResultsEmbed(poll: any) {
  const votes = (poll.votes as Record<string, string[]>) || {};
  const options = (poll.options as string[]) || [];
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  const totalVotes = Object.values(votes).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0);

  const description = options.map((opt: string, i: number) => {
    const count = (votes[String(i)] || []).length;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    return `${emojis[i] || "▫️"} **${opt}** — ${count} vote${count !== 1 ? "s" : ""} (${pct}%)\n${bar}`;
  }).join("\n");

  // Find winner(s)
  let maxVotes = 0;
  const winners: string[] = [];
  options.forEach((opt: string, i: number) => {
    const count = (votes[String(i)] || []).length;
    if (count > maxVotes) { maxVotes = count; winners.length = 0; winners.push(opt); }
    else if (count === maxVotes && count > 0) winners.push(opt);
  });

  const winnerText = winners.length > 0 ? `\n\n🏆 **Winner${winners.length > 1 ? "s" : ""}:** ${winners.join(", ")}` : "";

  return {
    title: `📊 Poll Results: ${poll.question}`,
    description: `${description}${winnerText}\n\n📊 **Total Votes:** ${totalVotes}`,
    color: 0x57f287,
    footer: { text: "Poll ended" },
    timestamp: new Date().toISOString(),
  };
}

// ─── Auto-End Polls ───────────────────────────────────────────────
async function autoEndPolls(adminClient: any) {
  const now = new Date().toISOString();
  const { data: expiredPolls } = await adminClient
    .from("active_polls")
    .select("*")
    .eq("ended", false)
    .lte("ends_at", now);

  if (!expiredPolls?.length) {
    return new Response(JSON.stringify({ ended: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let endedCount = 0;
  for (const poll of expiredPolls) {
    try {
      const { data: bot } = await adminClient.from("bots").select("*").eq("id", poll.bot_id).maybeSingle();
      if (!bot) continue;
      const token = atob(bot.token_encrypted);

      const resultsEmbed = buildPollResultsEmbed(poll);

      // Edit original message to show ended state with disabled buttons
      const options = (poll.options as string[]) || [];
      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      const components: any[] = [];
      let currentRow: any = { type: 1, components: [] };
      options.forEach((opt: string, i: number) => {
        if (currentRow.components.length >= 5) {
          components.push(currentRow);
          currentRow = { type: 1, components: [] };
        }
        currentRow.components.push({
          type: 2, style: 2,
          label: `${emojis[i] || "▫️"} ${opt}`,
          custom_id: `poll_ended_${poll.id}_${i}`,
          disabled: true,
        });
      });
      if (currentRow.components.length > 0) components.push(currentRow);

      await fetch(`https://discord.com/api/v10/channels/${poll.channel_id}/messages/${poll.message_id}`, {
        method: "PATCH",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{ ...resultsEmbed, title: `📊 POLL ENDED: ${poll.question}` }],
          components,
        }),
      });

      // Send results as a new message
      await fetch(`https://discord.com/api/v10/channels/${poll.channel_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [resultsEmbed] }),
      });

      await adminClient.from("active_polls").update({ ended: true }).eq("id", poll.id);
      endedCount++;
    } catch (err) {
      console.error("Error ending poll:", err);
    }
  }

  return new Response(JSON.stringify({ ended: endedCount }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── HTML Selector Extraction (enhanced) ──

function decodeEntities(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSelectorPattern(selector: string): RegExp {
  // Support: .class, #id, tag, tag.class, .parent .child (basic descendant)
  // Also support data attributes: [data-attr="value"]
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (selector.includes(" ")) {
    // Descendant selector — just use the last part for matching
    const parts = selector.trim().split(/\s+/);
    const last = parts[parts.length - 1];
    return buildSelectorPattern(last);
  }

  if (selector.startsWith("#")) {
    const id = esc(selector.slice(1));
    return new RegExp(`<(\\w+)[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)</\\1>`, "i");
  }
  if (selector.startsWith(".")) {
    // Support .class1.class2
    const classes = selector.slice(1).split(".").map(esc);
    const classPattern = classes.map(c => `(?=[^"']*\\b${c}\\b)`).join("");
    return new RegExp(`<(\\w+)[^>]*\\bclass=["']${classPattern}[^"']*["'][^>]*>([\\s\\S]*?)</\\1>`, "i");
  }
  if (selector.startsWith("[")) {
    // Attribute selector: [data-price], [data-attr="value"]
    const attrMatch = selector.match(/^\[(\w[\w-]*)(?:=["']?(.+?)["']?)?\]$/);
    if (attrMatch) {
      const attr = esc(attrMatch[1]);
      if (attrMatch[2]) {
        const val = esc(attrMatch[2]);
        return new RegExp(`<(\\w+)[^>]*\\b${attr}=["']${val}["'][^>]*>([\\s\\S]*?)</\\1>`, "i");
      }
      return new RegExp(`<(\\w+)[^>]*\\b${attr}(?:=["'][^"']*["'])?[^>]*>([\\s\\S]*?)</\\1>`, "i");
    }
  }
  // Tag with optional class: div.myclass
  if (/^\w+\.\w/.test(selector)) {
    const [tag, ...cls] = selector.split(".");
    const tagEsc = esc(tag);
    const classPattern = cls.map(esc).map(c => `(?=[^"']*\\b${c}\\b)`).join("");
    return new RegExp(`<${tagEsc}[^>]*\\bclass=["']${classPattern}[^"']*["'][^>]*>([\\s\\S]*?)</${tagEsc}>`, "i");
  }
  // Plain tag
  const tag = esc(selector);
  return new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
}

function extractBySelector(html: string, selector: string): string {
  const pattern = buildSelectorPattern(selector);
  const match = html.match(pattern);
  if (!match) return "";
  // The captured content is in group 2 for id/class patterns, group 1 for tag patterns
  const content = match[2] ?? match[1] ?? "";
  return decodeEntities(content);
}

function extractAllBySelector(html: string, selector: string): string[] {
  const pattern = buildSelectorPattern(selector);
  const globalPattern = new RegExp(pattern.source, "gi");
  const results: string[] = [];
  let m;
  while ((m = globalPattern.exec(html)) !== null) {
    const content = m[2] ?? m[1] ?? "";
    const decoded = decodeEntities(content);
    if (decoded) results.push(decoded);
    if (results.length >= 50) break; // Safety limit
  }
  return results;
}

function extractImageBySelector(html: string, selector: string): string {
  const pattern = buildSelectorPattern(selector);
  const match = html.match(pattern);
  if (!match) {
    // If selector itself targets an img, extract src directly
    if (selector === "img" || selector.startsWith("img.") || selector.startsWith("img[")) {
      const imgMatch = html.match(/<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
      return imgMatch?.[1] || "";
    }
    return "";
  }
  const innerHtml = match[2] ?? match[1] ?? "";
  // Find first <img> src within the matched element
  const imgMatch = innerHtml.match(/<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  return imgMatch?.[1] || "";
}

function extractAttrBySelector(html: string, selector: string, attribute: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Build a pattern to find the opening tag matching the selector
  let tagPattern: RegExp;
  if (selector.startsWith("#")) {
    const id = esc(selector.slice(1));
    tagPattern = new RegExp(`<\\w+[^>]*\\bid=["']${id}["'][^>]*>`, "i");
  } else if (selector.startsWith(".")) {
    const cls = esc(selector.slice(1));
    tagPattern = new RegExp(`<\\w+[^>]*\\bclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>`, "i");
  } else {
    const tag = esc(selector);
    tagPattern = new RegExp(`<${tag}[^>]*>`, "i");
  }
  const tagMatch = html.match(tagPattern);
  if (!tagMatch) return "";
  const attrEsc = esc(attribute);
  const attrPattern = new RegExp(`\\b${attrEsc}=["']([^"']*)["']`);
  const attrMatch = tagMatch[0].match(attrPattern);
  return attrMatch?.[1] || "";
}
