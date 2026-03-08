import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTENT_CANDIDATES = [33281, 513, 1];

interface KeepaliveResult {
  success: boolean;
  guild_count?: number;
  user?: any;
  error?: string;
  close_code?: number;
  intents?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

        const gatewayRes = await fetch("https://discord.com/api/v10/gateway/bot", {
          headers: { Authorization: `Bot ${token}` },
        });

        if (!gatewayRes.ok) {
          await adminClient.from("bots").update({ status: "offline" }).eq("id", bot.id);
          await adminClient.from("bot_logs").insert({
            bot_id: bot.id,
            user_id: bot.user_id,
            level: "warn",
            source: "keepalive",
            message: "Bot token rejected by Discord gateway endpoint",
          });
          results.push({ bot_id: bot.id, bot_name: bot.bot_name, success: false, error: "Invalid token" });
          continue;
        }

        const gatewayData = await gatewayRes.json();
        const gatewayUrl = `${gatewayData.url}/?v=10&encoding=json`;

        const result = await connectWithFallback({
          gatewayUrl,
          token,
          presenceStatus,
          activityType,
          statusText,
        });

        if (!result.success) {
          await adminClient.from("bots").update({ status: "offline" }).eq("id", bot.id);
          await adminClient.from("bot_logs").insert({
            bot_id: bot.id,
            user_id: bot.user_id,
            level: "warn",
            source: "keepalive",
            message: `Keepalive failed: ${result.error || "Unknown error"}`,
          });
          results.push({ bot_id: bot.id, bot_name: bot.bot_name, success: false, error: result.error });
          continue;
        }

        await adminClient.from("bots").update({
          status: "online",
          guild_count: result.guild_count || 0,
          bot_id: result.user?.id || bot.bot_id,
        }).eq("id", bot.id);

        results.push({ bot_id: bot.id, bot_name: bot.bot_name, success: true });
      } catch (err: any) {
        await adminClient.from("bots").update({ status: "offline" }).eq("id", bot.id);
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

async function connectWithFallback(params: {
  gatewayUrl: string;
  token: string;
  presenceStatus: string;
  activityType: number;
  statusText: string;
}): Promise<KeepaliveResult> {
  let lastError: KeepaliveResult = { success: false, error: "Gateway connection failed" };

  for (const intents of INTENT_CANDIDATES) {
    const result = await connectOnce(params, intents);
    if (result.success) return result;

    lastError = result;
    if (result.close_code === 4014) continue;
    break;
  }

  return lastError;
}

function connectOnce(params: {
  gatewayUrl: string;
  token: string;
  presenceStatus: string;
  activityType: number;
  statusText: string;
}, intents: number): Promise<KeepaliveResult> {
  return new Promise((resolve) => {
    const ws = new WebSocket(params.gatewayUrl);
    let settled = false;
    let sequence: number | null = null;
    let heartbeatInterval: number | null = null;
    let readyPayload: any = null;

    const timeout = setTimeout(() => {
      settle({ success: false, error: "Gateway connection timed out" });
    }, 18000) as unknown as number;

    const settle = (result: KeepaliveResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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

        const activities = params.statusText ? [{ name: params.statusText, type: params.activityType }] : [];
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token: params.token,
            intents,
            properties: { os: "linux", browser: "ArcBot", device: "ArcBot" },
            presence: { activities, status: params.presenceStatus, since: null, afk: false },
          },
        }));
        return;
      }

      if (op === 0 && t === "READY") {
        readyPayload = d;
        setTimeout(() => {
          settle({ success: true, guild_count: d.guilds?.length || 0, user: d.user });
        }, 3000);
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
        settle({ success: true, guild_count: readyPayload.guilds?.length || 0, user: readyPayload.user });
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

