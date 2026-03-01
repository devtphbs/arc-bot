import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export default function DashboardLogs() {
  const { selectedBot } = useBot();
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("bot_logs").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(50).then(({ data }) => setLogs(data || []));

    // Realtime subscription
    const channel = supabase.channel("logs-" + selectedBot.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "bot_logs", filter: `bot_id=eq.${selectedBot.id}` }, (payload) => {
      setLogs((prev) => [payload.new as any, ...prev].slice(0, 50));
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedBot]);

  const levelColors: Record<string, string> = { info: "text-primary", warn: "text-warning", error: "text-destructive" };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time bot activity logs</p>
      </motion.div>
      {!selectedBot ? <p className="text-muted-foreground mt-8">Select a bot first.</p> : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
          <div className="bg-secondary/50 px-4 py-2 border-b border-border flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse-glow" />
            <span className="text-xs text-muted-foreground font-mono">Live</span>
          </div>
          <div className="p-1 font-mono text-xs max-h-[60vh] overflow-y-auto">
            {logs.length === 0 && <p className="text-muted-foreground p-4">No logs yet.</p>}
            {logs.map((log) => (
              <div key={log.id} className="flex gap-3 px-3 py-1.5 hover:bg-secondary/30 rounded transition-colors">
                <span className="text-muted-foreground shrink-0">{new Date(log.created_at).toLocaleString()}</span>
                <span className={cn("uppercase w-12 shrink-0 font-semibold", levelColors[log.level] || "text-foreground")}>{log.level}</span>
                <span className="text-muted-foreground shrink-0">[{log.source}]</span>
                <span className="text-card-foreground">{log.message}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
