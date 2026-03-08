import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cron-triggered function that reconnects all "online" bots to Discord Gateway
// to maintain 24/7 uptime. Called every 2 minutes via pg_cron.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all bots marked as "online"
    const { data: onlineBots, error } = await adminClient
      .from("bots")
      .select("id, user_id, bot_name, token_encrypted, bot_id")
      .eq("status", "online");

    if (error || !onlineBots || onlineBots.length === 0) {
      return new Response(JSON.stringify({ message: "No online bots to keep alive", count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { bot_id: string; bot_name: string; success: boolean; error?: string }[] = [];

    for (const bot of onlineBots) {
      try {
        const token = atob(bot.token_encrypted);

        // Load status config
        const { data: statusModule } = await adminClient
          .from("bot_modules")
          .select("config")
          .eq("bot_id", bot.id)
          .eq("module_name", "custom_status")
          .maybeSingle();

        const statusConfig = (statusModule?.config as any) || {};
        const presenceStatus = statusConfig.presence_status || "online";
        const activityType = statusConfig.activity_type || 0;
        const statusText = statusConfig.status_text || "";

        // Get Gateway URL
        const gatewayRes = await fetch("https://discord.com/api/v10/gateway/bot", {
          headers: { Authorization: `Bot ${token}` },
        });

        if (!gatewayRes.ok) {
          results.push({ bot_id: bot.id, bot_name: bot.bot_name, success: false, error: "Invalid token" });
          await adminClient.from("bots").update({ status: "offline" }).eq("id", bot.id);
          continue;
        }

        const gatewayData = await gatewayRes.json();
        const gatewayUrl = `${gatewayData.url}/?v=10&encoding=json`;

        // Connect and identify
        const result = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => { resolve(false); }, 20000);
          const ws = new WebSocket(gatewayUrl);
          let seq: number | null = null;
          let hbInterval: number | null = null;

          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.s) seq = data.s;

            if (data.op === 10) {
              hbInterval = setInterval(() => {
                ws.send(JSON.stringify({ op: 1, d: seq }));
              }, data.d.heartbeat_interval) as unknown as number;

              const activities = statusText ? [{ name: statusText, type: activityType }] : [];
              ws.send(JSON.stringify({
                op: 2,
                d: {
                  token,
                  intents: 33281,
                  properties: { os: "linux", browser: "ArcBot", device: "ArcBot" },
                  presence: { activities, status: presenceStatus, since: null, afk: false },
                },
              }));
            }

            if (data.op === 0 && data.t === "READY") {
              const guildCount = data.d.guilds?.length || 0;
              adminClient.from("bots").update({
                status: "online",
                guild_count: guildCount,
                bot_id: data.d.user?.id || bot.bot_id,
              }).eq("id", bot.id);

              // Stay connected for a few seconds to handle interactions
              setTimeout(() => {
                clearTimeout(timeout);
                if (hbInterval) clearInterval(hbInterval);
                try { ws.close(); } catch (_) {}
                resolve(true);
              }, 5000);
            }

            if (data.op === 9) {
              clearTimeout(timeout);
              if (hbInterval) clearInterval(hbInterval);
              try { ws.close(); } catch (_) {}
              resolve(false);
            }
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            if (hbInterval) clearInterval(hbInterval);
            resolve(false);
          };

          ws.onclose = () => {
            if (hbInterval) clearInterval(hbInterval);
          };
        });

        results.push({ bot_id: bot.id, bot_name: bot.bot_name, success: result });

        if (!result) {
          await adminClient.from("bots").update({ status: "offline" }).eq("id", bot.id);
        }
      } catch (err: any) {
        results.push({ bot_id: bot.id, bot_name: bot.bot_name, success: false, error: err.message });
      }
    }

    return new Response(JSON.stringify({ message: "Keepalive complete", results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
