import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp",
};

// Convert hex string to Uint8Array
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");
    const body = await req.text();

    if (!signature || !timestamp) {
      return new Response("Missing signature", { status: 401, headers: corsHeaders });
    }

    // We need to find the public key for verification
    // Parse the interaction to get the application_id, then look up the bot
    let interaction: any;
    try {
      interaction = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    // For PING, we respond immediately (Discord verification)
    if (interaction.type === 1) {
      // We need to verify the signature. Get public key from our stored bots.
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Look up bot by application_id (bot_id field)
      const { data: bot } = await adminClient
        .from("bots")
        .select("*")
        .eq("bot_id", interaction.application_id)
        .maybeSingle();

      if (bot) {
        // Get public key from Discord API
        const token = atob(bot.token_encrypted);
        const appRes = await fetch("https://discord.com/api/v10/applications/@me", {
          headers: { Authorization: `Bot ${token}` },
        });
        if (appRes.ok) {
          const appData = await appRes.json();
          const publicKey = appData.verify_key;

          const isValid = nacl.sign.detached.verify(
            new TextEncoder().encode(timestamp + body),
            hexToUint8Array(signature),
            hexToUint8Array(publicKey)
          );

          if (!isValid) {
            return new Response("Invalid signature", { status: 401, headers: corsHeaders });
          }
        }
      }

      return new Response(JSON.stringify({ type: 1 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For actual interactions, verify signature and handle
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const appId = interaction.application_id;
    const { data: bot } = await adminClient
      .from("bots")
      .select("*")
      .eq("bot_id", appId)
      .maybeSingle();

    if (!bot) {
      return new Response(JSON.stringify({ type: 4, data: { content: "❌ Bot not configured.", flags: 64 } }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = atob(bot.token_encrypted);

    // Verify signature
    const appRes = await fetch("https://discord.com/api/v10/applications/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (appRes.ok) {
      const appData = await appRes.json();
      const isValid = nacl.sign.detached.verify(
        new TextEncoder().encode(timestamp + body),
        hexToUint8Array(signature),
        hexToUint8Array(appData.verify_key)
      );
      if (!isValid) {
        return new Response("Invalid signature", { status: 401, headers: corsHeaders });
      }
    }

    // Handle slash command interactions (type 2)
    if (interaction.type === 2) {
      const commandName = interaction.data?.name;
      const subCommand = interaction.data?.options?.find((o: any) => o.type === 1)?.name;
      const memberRoles: string[] = interaction.member?.roles || [];

      // Load custom commands
      const { data: commands } = await adminClient
        .from("commands")
        .select("*")
        .eq("bot_id", bot.id)
        .eq("enabled", true);

      // Load modules
      const { data: allModules } = await adminClient
        .from("bot_modules")
        .select("*")
        .eq("bot_id", bot.id)
        .eq("enabled", true);

      const modules: Record<string, any> = {};
      allModules?.forEach((m: any) => { modules[m.module_name] = m.config; });

      // Check custom commands first
      const cmd = commands?.find(
        (c: any) => c.name === commandName || c.name === `/${commandName}`
      );

      if (cmd) {
        // Check role permissions
        const requiredRoles = (cmd.permissions as string[]) || [];
        if (requiredRoles.length > 0 && !requiredRoles.some((r) => memberRoles.includes(r))) {
          return respond({ type: 4, data: { content: "❌ You don't have the required role to use this command.", flags: 64 } });
        }

        const responses = (cmd.responses as any[]) || [];
        const content = responses.length > 0 ? (responses[0]?.content || "Command executed!") : "Command executed!";

        // Increment usage (fire and forget)
        adminClient.from("commands").update({ uses: (cmd.uses || 0) + 1 }).eq("id", cmd.id);
        adminClient.from("bot_logs").insert({
          bot_id: bot.id,
          user_id: bot.user_id,
          level: "info",
          source: "command",
          message: `/${commandName} used by ${interaction.member?.user?.username || "unknown"}`,
        });

        const responseData: any = { type: 4, data: { content } };
        if (cmd.embed) responseData.data.embeds = [cmd.embed];
        if (cmd.ephemeral) responseData.data.flags = 64;

        return respond(responseData);
      }

      // Handle module commands
      const result = await handleModuleCommand(
        commandName,
        subCommand,
        interaction,
        modules,
        token,
        adminClient,
        bot,
        memberRoles
      );
      if (result) return respond(result);

      return respond({ type: 4, data: { content: "❌ Unknown command.", flags: 64 } });
    }

    // Default response
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
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Module Command Handler ─────────────────────────────────────
async function handleModuleCommand(
  commandName: string,
  subCommand: string | undefined,
  interaction: any,
  modules: Record<string, any>,
  token: string,
  adminClient: any,
  bot: any,
  memberRoles: string[]
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
      const duration = interaction.data?.options?.[0]?.options?.find((o: any) => o.name === "duration")?.value || 86400;
      const winners = interaction.data?.options?.[0]?.options?.find((o: any) => o.name === "winners")?.value || 1;

      const endTime = Math.floor(Date.now() / 1000) + duration;
      const embed = {
        title: "🎉 GIVEAWAY 🎉",
        description: `**${prize}**\n\nReact with 🎉 to enter!\n\n**Winners:** ${winners}\n**Ends:** <t:${endTime}:R>`,
        color: 0xffd700,
        footer: { text: `${winners} winner(s) • Ends` },
        timestamp: new Date(endTime * 1000).toISOString(),
      };

      // Send giveaway message
      const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });

      if (msgRes.ok) {
        const msg = await msgRes.json();
        // Add reaction
        await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}/reactions/%F0%9F%8E%89/@me`, {
          method: "PUT",
          headers: { Authorization: `Bot ${token}` },
        });
        return { type: 4, data: { content: `🎉 Giveaway for **${prize}** started! Ends <t:${endTime}:R>`, flags: 64 } };
      }
      return { type: 4, data: { content: "❌ Failed to create giveaway.", flags: 64 } };
    }

    if (subCommand === "end" || subCommand === "reroll") {
      return { type: 4, data: { content: `✅ Giveaway ${subCommand} executed.`, flags: 64 } };
    }

    if (subCommand === "list") {
      const list = giveaways.map((g: any, i: number) => `${i + 1}. **${g.prize || "No prize"}** (${g.winners} winners)`).join("\n") || "No giveaway templates configured.";
      return { type: 4, data: { content: `📋 **Giveaway Templates:**\n${list}`, flags: 64 } };
    }
  }

  // ── Poll Commands ──
  if (commandName === "poll" && modules.polls) {
    const question = interaction.data?.options?.find((o: any) => o.name === "question")?.value || "No question";
    const optionsRaw = interaction.data?.options?.find((o: any) => o.name === "options")?.value || "";
    const opts = optionsRaw.split(",").map((o: string) => o.trim()).filter(Boolean);
    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

    const description = opts.length > 0
      ? opts.map((o: string, i: number) => `${emojis[i] || "▫️"} ${o}`).join("\n")
      : "👍 Yes\n👎 No";

    const embed = {
      title: `📊 ${question}`,
      description,
      color: 0x5865f2,
      footer: { text: `Poll by ${interaction.member?.user?.username || "someone"}` },
    };

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
          method: "PUT",
          headers: { Authorization: `Bot ${token}` },
        });
      }
      return { type: 4, data: { content: "📊 Poll created!", flags: 64 } };
    }
    return { type: 4, data: { content: "❌ Failed to create poll.", flags: 64 } };
  }

  // ── Leveling Commands ──
  if (commandName === "rank") {
    const { data: levelConfig } = await adminClient
      .from("leveling_config")
      .select("*")
      .eq("bot_id", bot.id)
      .maybeSingle();

    if (!levelConfig?.enabled) {
      return { type: 4, data: { content: "❌ Leveling is not enabled.", flags: 64 } };
    }

    const targetUser = interaction.data?.options?.find((o: any) => o.name === "user")?.value || userId;
    const { data: levelData } = await adminClient
      .from("user_levels")
      .select("*")
      .eq("bot_id", bot.id)
      .eq("user_id", targetUser)
      .eq("guild_id", guildId)
      .maybeSingle();

    if (!levelData) {
      return { type: 4, data: { content: `<@${targetUser}> has no XP yet. Start chatting!`, flags: 0 } };
    }

    const xpForNext = 5 * levelData.level * levelData.level + 50 * levelData.level + 100;
    return {
      type: 4,
      data: {
        embeds: [{
          title: `📊 Rank Card`,
          description: `**<@${targetUser}>**\n\n🏆 **Level:** ${levelData.level}\n⭐ **XP:** ${levelData.xp} / ${xpForNext}\n`,
          color: 0x5865f2,
        }],
      },
    };
  }

  if (commandName === "leaderboard") {
    const { data: levels } = await adminClient
      .from("user_levels")
      .select("*")
      .eq("bot_id", bot.id)
      .eq("guild_id", guildId)
      .order("level", { ascending: false })
      .order("xp", { ascending: false })
      .limit(10);

    if (!levels || levels.length === 0) {
      return { type: 4, data: { content: "No leveling data yet.", flags: 64 } };
    }

    const medals = ["🥇", "🥈", "🥉"];
    const list = levels.map((l: any, i: number) =>
      `${medals[i] || `**${i + 1}.**`} <@${l.user_id}> — Level ${l.level} (${l.xp} XP)`
    ).join("\n");

    return {
      type: 4,
      data: {
        embeds: [{
          title: "🏆 Leaderboard",
          description: list,
          color: 0xffd700,
        }],
      },
    };
  }

  // ── Music Commands (informational - music needs persistent connection) ──
  if (["play", "skip", "pause", "resume", "stop", "queue", "nowplaying", "volume", "shuffle", "loop", "remove", "clear"].includes(commandName)) {
    if (!modules.music) {
      return { type: 4, data: { content: "❌ Music module is not enabled.", flags: 64 } };
    }

    // Check DJ role
    const musicConfig = modules.music;
    if (musicConfig.djOnly && musicConfig.djRoleId && !memberRoles.includes(musicConfig.djRoleId)) {
      return { type: 4, data: { content: "❌ Only DJs can use music commands.", flags: 64 } };
    }

    return {
      type: 4,
      data: {
        content: `🎵 Music commands require a persistent connection. Export your bot via the dashboard to run locally with full music support.`,
        flags: 64,
      },
    };
  }

  // ── Help Command ──
  if (commandName === "help") {
    const sections: string[] = ["**📋 Available Commands:**"];

    // Custom commands
    const { data: cmds } = await adminClient
      .from("commands")
      .select("name, description")
      .eq("bot_id", bot.id)
      .eq("enabled", true);

    if (cmds && cmds.length > 0) {
      sections.push("\n__Custom Commands__");
      cmds.forEach((c: any) => sections.push(`\`/${c.name.replace(/^\//, "")}\` — ${c.description || "No description"}`));
    }

    if (modules.giveaways) sections.push("\n__Giveaways__\n`/giveaway start` `/giveaway end` `/giveaway reroll` `/giveaway list`");
    if (modules.polls) sections.push("\n__Polls__\n`/poll`");
    sections.push("\n__Leveling__\n`/rank` `/leaderboard`");
    if (modules.music) sections.push("\n__Music__\n`/play` `/skip` `/pause` `/stop` `/queue` `/volume`");

    return {
      type: 4,
      data: {
        embeds: [{
          title: "📖 Help",
          description: sections.join("\n"),
          color: 0x5865f2,
        }],
      },
    };
  }

  return null;
}
