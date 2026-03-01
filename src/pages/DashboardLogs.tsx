import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const logs = [
  { timestamp: "2026-03-01 14:32:01", level: "info", message: "Bot connected to gateway", source: "system" },
  { timestamp: "2026-03-01 14:31:55", level: "info", message: "Command /ban executed by User#1234", source: "commands" },
  { timestamp: "2026-03-01 14:30:12", level: "warn", message: "Rate limit hit on guild 8291374", source: "api" },
  { timestamp: "2026-03-01 14:28:44", level: "info", message: "Auto-mod: Deleted spam message in #general", source: "moderation" },
  { timestamp: "2026-03-01 14:25:00", level: "error", message: "Failed to send welcome message: Missing permissions", source: "events" },
  { timestamp: "2026-03-01 14:22:33", level: "info", message: "Command /help deployed successfully", source: "commands" },
  { timestamp: "2026-03-01 14:20:01", level: "info", message: "Heartbeat acknowledged, latency: 42ms", source: "system" },
  { timestamp: "2026-03-01 14:15:10", level: "warn", message: "Slowmode adjusted in #off-topic", source: "moderation" },
];

const levelColors = {
  info: "text-primary",
  warn: "text-warning",
  error: "text-destructive",
};

export default function DashboardLogs() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time bot activity logs</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 rounded-lg border border-border bg-card overflow-hidden"
      >
        <div className="bg-secondary/50 px-4 py-2 border-b border-border flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse-glow" />
          <span className="text-xs text-muted-foreground font-mono">Live</span>
        </div>
        <div className="p-1 font-mono text-xs max-h-[60vh] overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="flex gap-3 px-3 py-1.5 hover:bg-secondary/30 rounded transition-colors">
              <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
              <span className={cn("uppercase w-12 shrink-0 font-semibold", levelColors[log.level as keyof typeof levelColors])}>
                {log.level}
              </span>
              <span className="text-muted-foreground shrink-0">[{log.source}]</span>
              <span className="text-card-foreground">{log.message}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
