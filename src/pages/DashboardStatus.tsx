import { motion } from "framer-motion";
import { Activity, ShieldCheck, ShieldAlert, Loader2, RefreshCw } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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

export default function DashboardStatus() {
  const { selectedBot } = useBot();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logCounts, setLogCounts] = useState({ info: 0, warn: 0, error: 0 });

  const fetchStatus = async (silent = false) => {
    if (!selectedBot) {
      setStatus(null);
      return;
    }

    if (!silent) setLoading(true);
    setRefreshing(true);

    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [{ data, error }, { data: logData, error: logError }] = await Promise.all([
        supabase.functions.invoke("bot-status", { body: { bot_id: selectedBot.id } }),
        supabase
          .from("bot_logs")
          .select("level")
          .eq("bot_id", selectedBot.id)
          .gte("created_at", since24h)
          .limit(1000),
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
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch status");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
    if (!selectedBot) return;

    const interval = setInterval(() => {
      void fetchStatus(true);
    }, 30000);

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
            <Activity className="w-6 h-6 text-primary" /> Bot Status Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Live health checks, connectivity state, and operational events</p>
        </div>
        <button
          onClick={() => void fetchStatus()}
          disabled={!selectedBot || refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select a bot first.</p>
      ) : loading && !status ? (
        <p className="text-muted-foreground mt-8">Loading status…</p>
      ) : (
        <div className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Stored Status</p>
              <p className="text-lg font-semibold text-card-foreground capitalize mt-1">{status?.bot.status || selectedBot.status}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Token Check</p>
              <p className="text-lg font-semibold mt-1 inline-flex items-center gap-2">
                {status?.checks.token_valid ? (
                  <><ShieldCheck className="w-4 h-4 text-success" /><span className="text-success">Valid</span></>
                ) : (
                  <><ShieldAlert className="w-4 h-4 text-destructive" /><span className="text-destructive">Invalid</span></>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Gateway Check</p>
              <p className="text-lg font-semibold mt-1 text-card-foreground">
                {status?.checks.gateway_reachable ? "Reachable" : "Unreachable"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Health State</p>
              <p className={`text-lg font-semibold mt-1 ${healthState === "healthy" ? "text-success" : "text-destructive"}`}>
                {healthState === "healthy" ? "Healthy" : "Degraded"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-card-foreground mb-3">Recent Bot Events</h2>
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
                      <span className={`text-xs uppercase ${log.level === "error" ? "text-destructive" : log.level === "warn" ? "text-warning" : "text-primary"}`}>
                        {log.level}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-card-foreground mb-3">Last 24h Log Counts</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Info</span><span className="text-card-foreground font-medium">{logCounts.info}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Warnings</span><span className="text-warning font-medium">{logCounts.warn}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Errors</span><span className="text-destructive font-medium">{logCounts.error}</span></div>
                <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                  Last backend update: {status?.bot.updated_at ? new Date(status.bot.updated_at).toLocaleString() : "Unknown"}
                </div>
                {status?.errors?.token_error && <p className="text-xs text-destructive">Token: {status.errors.token_error}</p>}
                {status?.errors?.gateway_error && <p className="text-xs text-destructive">Gateway: {status.errors.gateway_error}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
