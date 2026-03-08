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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { bot_id } = await req.json();
    if (!bot_id) {
      return new Response(JSON.stringify({ error: "bot_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: bot } = await adminClient
      .from("bots")
      .select("id, user_id, bot_name, bot_id, status, guild_count, updated_at, token_encrypted")
      .eq("id", bot_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!bot) {
      return new Response(JSON.stringify({ error: "Bot not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = atob(bot.token_encrypted);

    const [meRes, gatewayRes, recentLogsRes] = await Promise.all([
      fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${token}` } }),
      fetch("https://discord.com/api/v10/gateway/bot", { headers: { Authorization: `Bot ${token}` } }),
      adminClient
        .from("bot_logs")
        .select("id, level, source, message, created_at")
        .eq("bot_id", bot_id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const mePayload = await meRes.json().catch(() => null);
    const gatewayPayload = await gatewayRes.json().catch(() => null);

    const tokenValid = meRes.ok;
    const gatewayReachable = gatewayRes.ok;

    return new Response(
      JSON.stringify({
        success: true,
        bot: {
          id: bot.id,
          bot_id: bot.bot_id,
          name: bot.bot_name,
          status: bot.status,
          guild_count: bot.guild_count,
          updated_at: bot.updated_at,
        },
        checks: {
          token_valid: tokenValid,
          gateway_reachable: gatewayReachable,
          gateway_shards: gatewayPayload?.shards ?? null,
          gateway_session_start_limit: gatewayPayload?.session_start_limit ?? null,
        },
        discord_bot: tokenValid
          ? {
              id: mePayload?.id,
              username: mePayload?.username,
              avatar: mePayload?.avatar,
            }
          : null,
        errors: {
          token_error: tokenValid ? null : mePayload?.message || "Invalid bot token",
          gateway_error: gatewayReachable ? null : gatewayPayload?.message || "Gateway endpoint unreachable",
        },
        recent_logs: recentLogsRes.data || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
