import { motion } from "framer-motion";
import { ClipboardList, RefreshCw, Loader2, Info } from "lucide-react";
import { useState, useEffect } from "react";
import { useBot } from "@/hooks/useBot";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export default function DashboardAuditLog() {
  const { selectedBot } = useBot();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">("all");

  const fetchLogs = async () => {
    if (!selectedBot) return;
    setLoading(true);
    let query = supabase.from("bot_logs").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(100);
    if (filter !== "all") query = query.eq("level", filter);
    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [selectedBot?.id, filter]);

  if (!selectedBot) return <div className="p-6 lg:p-8"><p className="text-muted-foreground">Select a bot first.</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" /> Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Complete history of all bot actions, command usage, errors, and system events. Filter by severity level to find specific events.</p>
        </div>
        <button onClick={fetchLogs} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
        </button>
      </motion.div>

      <div className="mt-4 flex items-center gap-2">
        {(["all", "info", "warn", "error"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("px-3 py-1.5 rounded-md text-xs capitalize transition-colors", filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent")}>
            {f}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">No logs found for this filter.</p>
        ) : (
          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-3 p-3 hover:bg-secondary/30 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", log.level === "error" ? "bg-destructive" : log.level === "warn" ? "bg-warning" : "bg-primary")} />
                  <div className="min-w-0">
                    <p className="text-sm text-card-foreground break-words">{log.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">[{log.source || "system"}] · {log.level}</p>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
