import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useBot } from "@/hooks/useBot";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

type LogLevel = "all" | "info" | "warn" | "error";

export default function DashboardLogs() {
  const { selectedBot } = useBot();
  const [logs, setLogs] = useState<any[]>([]);
  const [level, setLevel] = useState<LogLevel>("all");
  const [searchSource, setSearchSource] = useState("");

  useEffect(() => {
    if (!selectedBot) {
      setLogs([]);
      return;
    }

    supabase
      .from("bot_logs")
      .select("*")
      .eq("bot_id", selectedBot.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setLogs(data || []));

    const channel = supabase
      .channel("logs-" + selectedBot.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bot_logs",
          filter: `bot_id=eq.${selectedBot.id}`,
        },
        (payload) => {
          setLogs((prev) => [payload.new as any, ...prev].slice(0, 100));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedBot?.id]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const levelPass = level === "all" ? true : log.level === level;
      const sourcePass = searchSource.trim()
        ? (log.source || "").toLowerCase().includes(searchSource.toLowerCase())
        : true;
      return levelPass && sourcePass;
    });
  }, [logs, level, searchSource]);

  const levelColors: Record<string, string> = {
    info: "text-primary",
    warn: "text-warning",
    error: "text-destructive",
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time command and automation logs</p>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select a bot first.</p>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
          <div className="bg-secondary/50 px-4 py-3 border-b border-border flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse-glow" />
              <span className="text-xs text-muted-foreground font-mono">Live Stream</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["all", "info", "warn", "error"] as LogLevel[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setLevel(item)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wide transition-colors",
                    level === item
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item}
                </button>
              ))}
              <input
                type="text"
                value={searchSource}
                onChange={(e) => setSearchSource(e.target.value)}
                placeholder="Filter source"
                className="h-7 px-2.5 rounded-md bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="p-1 font-mono text-xs max-h-[62vh] overflow-y-auto">
            {filteredLogs.length === 0 && <p className="text-muted-foreground p-4">No logs for this filter.</p>}

            {filteredLogs.map((log) => (
              <div key={log.id} className="grid grid-cols-[160px_56px_120px_1fr] gap-3 px-3 py-1.5 hover:bg-secondary/30 rounded transition-colors items-start">
                <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                <span className={cn("uppercase font-semibold", levelColors[log.level] || "text-foreground")}>{log.level}</span>
                <span className="text-muted-foreground truncate">[{log.source}]</span>
                <span className="text-card-foreground break-words">{log.message}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
