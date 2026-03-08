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
        const responses = (cmd.responses as any[]) || [];
        const content = responses.length > 0 ? (responses[0]?.content || "Command executed!") : "Command executed!";
        adminClient.from("commands").update({ uses: (cmd.uses || 0) + 1 }).eq("id", cmd.id);
        adminClient.from("bot_logs").insert({ bot_id: bot.id, user_id: bot.user_id, level: "info", source: "command", message: `/${commandName} used by ${interaction.member?.user?.username || "unknown"}` });
        const responseData: any = { type: 4, data: { content } };
        if (cmd.embed) responseData.data.embeds = [cmd.embed];
        if (cmd.ephemeral) responseData.data.flags = 64;
        return respond(responseData);
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

    if (subCommand === "start") {
      const prize = interaction.data?.options?.[0]?.options?.find((o: any) => o.name === "prize")?.value || "Amazing Prize";
      const durationStr = interaction.data?.options?.[0]?.options?.find((o: any) => o.name === "duration")?.value || "1d";
      const winners = interaction.data?.options?.[0]?.options?.find((o: any) => o.name === "winners")?.value || 1;

      const template = giveaways.find((g: any) => g.prize === prize) || giveaways[0] || {};
      const durationSecs = parseDuration(String(durationStr));
      const endTime = Math.floor(Date.now() / 1000) + durationSecs;
      const color = template.color ? parseInt(String(template.color).replace("#", ""), 16) : 0xffd700;
      const endColor = template.endColor || "#FF4444";

      const requirements: string[] = [];
      if (template.roleRequirement) requirements.push(`🔒 Required Role: <@&${template.roleRequirement}>`);
      if (template.requiredMessages > 0) requirements.push(`💬 Min ${template.requiredMessages} messages required`);
      if (template.bypassRole) requirements.push(`⚡ Bypass Role: <@&${template.bypassRole}>`);

      const embed = {
        title: "🎉 GIVEAWAY 🎉",
        description: `**${prize}**\n\nClick the button below to enter!\n\n🏆 **Winners:** ${winners}\n⏰ **Ends:** <t:${endTime}:R>\n${requirements.length > 0 ? "\n" + requirements.join("\n") : ""}`,
        color,
        footer: { text: `${winners} winner(s) • Ends` },
        timestamp: new Date(endTime * 1000).toISOString(),
      };

      const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
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
        // Store active giveaway in DB
        await adminClient.from("active_giveaways").insert({
          bot_id: bot.id,
          message_id: sentMsg.id,
          channel_id: channelId,
          guild_id: guildId,
          prize,
          winners_count: winners,
          ends_at: new Date(endTime * 1000).toISOString(),
          color: template.color || "#FFD700",
          end_color: endColor,
        });
        return { type: 4, data: { content: `🎉 Giveaway for **${prize}** started! Ends <t:${endTime}:R>`, flags: 64 } };
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
    const question = interaction.data?.options?.find((o: any) => o.name === "question")?.value || "No question";
    const optionsRaw = interaction.data?.options?.find((o: any) => o.name === "options")?.value || "";
    const opts = optionsRaw.split(",").map((o: string) => o.trim()).filter(Boolean);
    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
    const description = opts.length > 0 ? opts.map((o: string, i: number) => `${emojis[i] || "▫️"} ${o}`).join("\n") : "👍 Yes\n👎 No";
    const embed = { title: `📊 ${question}`, description, color: 0x5865f2, footer: { text: `Poll by ${interaction.member?.user?.username || "someone"}` } };

    const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (msgRes.ok) {
      const msg = await msgRes.json();
      const reactEmojis = opts.length > 0 ? emojis.slice(0, opts.length) : ["👍", "👎"];
      for (const emoji of reactEmojis) {
        await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}/@me`, {
          method: "PUT", headers: { Authorization: `Bot ${token}` },
        });
      }
      return { type: 4, data: { content: "📊 Poll created!", flags: 64 } };
    }
    return { type: 4, data: { content: "❌ Failed to create poll.", flags: 64 } };
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
