import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

// @ts-ignore - External module imports
// @ts-ignore - Deno global

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
  "Access-Control-Max-Age": "86400",
};

// @ts-ignore - External module imports
// @ts-ignore - Deno global

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// @ts-ignore
Deno.serve(async (req: any) => {
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

    const { token, bot_id } = await req.json();

    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Token is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate token format: tokens are base64.base64.base64
    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
      return new Response(JSON.stringify({ valid: false, error: "Invalid token format. Discord bot tokens have 3 dot-separated parts." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Discord API to validate
    const discordRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!discordRes.ok) {
      const errBody = await discordRes.text();
      return new Response(JSON.stringify({ valid: false, error: "Discord rejected this token. It may be invalid or revoked.", discord_status: discordRes.status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botUser = await discordRes.json();

    if (!botUser.bot) {
      return new Response(JSON.stringify({ valid: false, error: "This token belongs to a user account, not a bot." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get guild count
    const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bot ${token}` },
    });
    const guilds = guildsRes.ok ? await guildsRes.json() : [];

    // If bot_id provided, update the bot record
    if (bot_id) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      await adminClient.from("bots").update({
        bot_id: botUser.id,
        bot_name: botUser.username,
        bot_avatar: botUser.avatar ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png` : null,
        guild_count: guilds.length || 0,
        status: "online",
        token_encrypted: btoa(token),
      }).eq("id", bot_id).eq("user_id", user.id);
    }

    return new Response(JSON.stringify({
      valid: true,
      bot: {
        id: botUser.id,
        username: botUser.username,
        discriminator: botUser.discriminator,
        avatar: botUser.avatar ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png` : null,
        guild_count: guilds.length || 0,
      },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
