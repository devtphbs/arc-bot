import { motion } from "framer-motion";
import { Activity, ShieldCheck, ShieldAlert, Loader2, RefreshCw, Bell, BellOff, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StatusResponse = {
  bot: {
    id: string;
    bot_id: string | null;
    name: string;
    status: string;
    guild_count: number | null;
    updated_at: string;
  };
  checks: {
    token_valid: boolean;
    gateway_reachable: boolean;
    gateway_shards: number | null;
  };
  errors: {
    token_error: string | null;
    gateway_error: string | null;
  };
  recent_logs: Array<{
    id: string;
    level: string;
    source: string | null;
    message: string;
    created_at: string;
  }>;
};

type DowntimeAlert = {
  id: string;
  alert_type: string;
  message: string;
  resolved: boolean;
  created_at: string;
};

export default function DashboardStatus() {
  const { selectedBot } = useBot();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logCounts, setLogCounts] = useState({ info: 0, warn: 0, error: 0 });
  const [alerts, setAlerts] = useState<DowntimeAlert[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  const fetchStatus = async (silent = false) => {
    if (!selectedBot) { setStatus(null); return; }
    if (!silent) setLoading(true);
    setRefreshing(true);

    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [{ data, error }, { data: logData, error: logError }, { data: alertData }] = await Promise.all([
        supabase.functions.invoke("bot-status", { body: { bot_id: selectedBot.id } }),
        supabase.from("bot_logs").select("level").eq("bot_id", selectedBot.id).gte("created_at", since24h).limit(1000),
        supabase.from("downtime_alerts").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(20),
      ]);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (logError) throw logError;

      const counts = (logData || []).reduce(
        (acc, log: any) => {
          if (log.level === "warn") acc.warn += 1;
          else if (log.level === "error") acc.error += 1;
          else acc.info += 1;
          return acc;
        },
        { info: 0, warn: 0, error: 0 },
      );

      setLogCounts(counts);
      setStatus(data as StatusResponse);
      setAlerts((alertData || []) as DowntimeAlert[]);
      setUnresolvedCount((alertData || []).filter((a: any) => !a.resolved).length);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch status");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const resolveAlert = async (alertId: string) => {
    await supabase.from("downtime_alerts").update({ resolved: true }).eq("id", alertId);
    setAlerts((p) => p.map((a) => a.id === alertId ? { ...a, resolved: true } : a));
    setUnresolvedCount((p) => Math.max(0, p - 1));
  };

  const resolveAll = async () => {
    if (!selectedBot) return;
    await supabase.from("downtime_alerts").update({ resolved: true }).eq("bot_id", selectedBot.id).eq("resolved", false);
    setAlerts((p) => p.map((a) => ({ ...a, resolved: true })));
    setUnresolvedCount(0);
    toast.success("All alerts resolved");
  };

  useEffect(() => {
    void fetchStatus();
    if (!selectedBot) return;
    const interval = setInterval(() => { void fetchStatus(true); }, 30000);
    return () => clearInterval(interval);
  }, [selectedBot?.id]);

  const healthState = useMemo(() => {
    if (!status) return "unknown";
    if (status.checks.token_valid && status.checks.gateway_reachable) return "healthy";
    return "degraded";
  }, [status]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Bot Status & Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Live health checks, downtime alerts, connectivity diagnostics, and operational event logs. Auto-refreshes every 30 seconds.</p>
        </div>
        <button onClick={() => void fetchStatus()} disabled={!selectedBot || refreshing} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors disabled:opacity-50">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
        </button>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select a bot first.</p>
      ) : loading && !status ? (
        <p className="text-muted-foreground mt-8">Loading status…</p>
      ) : (
        <div className="space-y-6 mt-6">
          {/* Info Banner */}
          <div className="rounded-lg border border-info/20 bg-info/5 p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-card-foreground font-medium">How Status Monitoring Works</p>
              <p className="text-xs text-muted-foreground mt-1">
                We validate your bot token with Discord, check Gateway accessibility, and monitor logs for errors. If your bot goes offline unexpectedly, a downtime alert is automatically created. The keepalive system reconnects your bot every 2 minutes.
              </p>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Stored Status</p>
              <p className="text-lg font-semibold text-card-foreground capitalize mt-1">{status?.bot.status || selectedBot.status}</p>
              <p className="text-[10px] text-muted-foreground mt-1">The current status saved in our database</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Token Validity</p>
              <p className="text-lg font-semibold mt-1 inline-flex items-center gap-2">
                {status?.checks.token_valid ? (
                  <><ShieldCheck className="w-4 h-4 text-success" /><span className="text-success">Valid</span></>
                ) : (
                  <><ShieldAlert className="w-4 h-4 text-destructive" /><span className="text-destructive">Invalid</span></>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Checks if Discord accepts your bot token</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Gateway Connection</p>
              <p className="text-lg font-semibold mt-1 text-card-foreground">{status?.checks.gateway_reachable ? "Reachable" : "Unreachable"}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Discord's WebSocket Gateway availability</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Overall Health</p>
              <p className={`text-lg font-semibold mt-1 ${healthState === "healthy" ? "text-success" : "text-destructive"}`}>
                {healthState === "healthy" ? "Healthy" : "Degraded"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Combined check of token + gateway</p>
            </div>
          </div>

          {/* Downtime Alerts */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-medium text-card-foreground">Downtime Alerts</h2>
                {unresolvedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium">{unresolvedCount} unresolved</span>
                )}
              </div>
              {unresolvedCount > 0 && (
                <button onClick={resolveAll} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                  <BellOff className="w-3 h-3" /> Resolve All
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">Alerts are generated when the keepalive system detects your bot is offline or when health checks fail.</p>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No downtime alerts — your bot is running smoothly! ✨</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {alerts.map((alert) => (
                  <div key={alert.id} className={cn("flex items-center justify-between py-2 px-3 rounded-md transition-colors", alert.resolved ? "opacity-50" : "bg-destructive/5")}>
                    <div className="flex items-center gap-2">
                      {alert.resolved ? <CheckCircle className="w-4 h-4 text-success shrink-0" /> : <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                      <div>
                        <p className="text-sm text-card-foreground">{alert.message}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    {!alert.resolved && (
                      <button onClick={() => resolveAlert(alert.id)} className="text-xs text-primary hover:text-primary/80">Resolve</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Logs & Counts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-card-foreground mb-1">Recent Bot Events</h2>
              <p className="text-xs text-muted-foreground mb-3">The latest operational events from your bot's gateway connection and command execution.</p>
              {!status?.recent_logs?.length ? (
                <p className="text-sm text-muted-foreground">No recent events.</p>
              ) : (
                <div className="space-y-2">
                  {status.recent_logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm text-card-foreground">{log.message}</p>
                        <p className="text-[11px] text-muted-foreground">[{log.source || "system"}] {new Date(log.created_at).toLocaleString()}</p>
                      </div>
                      <span className={`text-xs uppercase ${log.level === "error" ? "text-destructive" : log.level === "warn" ? "text-warning" : "text-primary"}`}>{log.level}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-card-foreground mb-1">Last 24h Summary</h2>
              <p className="text-xs text-muted-foreground mb-3">Aggregated log counts from the past 24 hours.</p>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Info events</span><span className="text-card-foreground font-medium">{logCounts.info}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Warnings</span><span className="text-warning font-medium">{logCounts.warn}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Errors</span><span className="text-destructive font-medium">{logCounts.error}</span></div>
                <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                  Last updated: {status?.bot.updated_at ? new Date(status.bot.updated_at).toLocaleString() : "Unknown"}
                </div>
                {status?.errors?.token_error && <p className="text-xs text-destructive">Token error: {status.errors.token_error}</p>}
                {status?.errors?.gateway_error && <p className="text-xs text-destructive">Gateway error: {status.errors.gateway_error}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
