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

    // Get bot token
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
          return new Response(JSON.stringify({ error: err.message || "Discord rejected the name change" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const updated = await res.json();
        await adminClient.from("bots").update({ bot_name: updated.username }).eq("id", bot_id);
        return new Response(JSON.stringify({ success: true, username: updated.username }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "update_avatar": {
        if (!avatar) {
          return new Response(JSON.stringify({ error: "Avatar data URI is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const res = await fetch("https://discord.com/api/v10/users/@me", {
          method: "PATCH",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ avatar }),
        });
        if (!res.ok) {
          const err = await res.json();
          return new Response(JSON.stringify({ error: err.message || "Discord rejected the avatar change" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const updated = await res.json();
        const avatarUrl = updated.avatar ? `https://cdn.discordapp.com/avatars/${updated.id}/${updated.avatar}.png` : null;
        await adminClient.from("bots").update({ bot_avatar: avatarUrl }).eq("id", bot_id);
        return new Response(JSON.stringify({ success: true, avatar_url: avatarUrl }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "start": {
        // Register slash commands with Discord
        const { data: commands } = await adminClient.from("commands").select("*").eq("bot_id", bot_id).eq("enabled", true);
        
        if (commands && commands.length > 0 && bot.bot_id) {
          const slashCommands = commands.filter(c => c.type === "slash").map(c => ({
            name: c.name.replace(/^\//, ""),
            description: c.description || "No description",
            type: 1,
          }));

          if (slashCommands.length > 0) {
            await fetch(`https://discord.com/api/v10/applications/${bot.bot_id}/commands`, {
              method: "PUT",
              headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(slashCommands),
            });
          }
        }

        // Connect to Discord Gateway to bring bot online with presence
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const gatewayRes = await fetch(`${supabaseUrl}/functions/v1/discord-gateway`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader!,
          },
          body: JSON.stringify({ bot_id }),
        });
        const gatewayResult = await gatewayRes.json();

        if (!gatewayResult.success) {
          // Still mark as online even if gateway had issues (commands are registered)
          await adminClient.from("bots").update({ status: "online" }).eq("id", bot_id);
        }

        return new Response(JSON.stringify({ success: true, status: "online", gateway: gatewayResult }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "stop": {
        await adminClient.from("bots").update({ status: "offline" }).eq("id", bot_id);
        return new Response(JSON.stringify({ success: true, status: "offline" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "restart": {
        // Re-register commands on restart
        const { data: cmds } = await adminClient.from("commands").select("*").eq("bot_id", bot_id).eq("enabled", true);
        if (cmds && cmds.length > 0 && bot.bot_id) {
          const slashCmds = cmds.filter(c => c.type === "slash").map(c => ({
            name: c.name.replace(/^\//, ""),
            description: c.description || "No description",
            type: 1,
          }));
          if (slashCmds.length > 0) {
            await fetch(`https://discord.com/api/v10/applications/${bot.bot_id}/commands`, {
              method: "PUT",
              headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(slashCmds),
            });
          }
        }
        await adminClient.from("bots").update({ status: "online" }).eq("id", bot_id);
        return new Response(JSON.stringify({ success: true, status: "online" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "update_status": {
        // Note: Gateway-based presence requires a WebSocket connection.
        // We store the desired status config so the bot gateway can use it.
        await adminClient.from("bot_modules").upsert({
          bot_id,
          user_id: user.id,
          module_name: "custom_status",
          enabled: true,
          config: { status_text, activity_type: activity_type || 0, presence_status: presence_status || "online" },
        }, { onConflict: "bot_id,module_name" });
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
