import { StatCard } from "@/components/StatCard";
import { Users, Terminal, Server, Activity, Circle } from "lucide-react";
import { motion } from "framer-motion";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export default function DashboardOverview() {
  const { selectedBot, bots } = useBot();
  const { user } = useAuth();
  const [commandCount, setCommandCount] = useState(0);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedBot || !user) return;
    supabase.from("commands").select("id", { count: "exact" }).eq("bot_id", selectedBot.id).then(({ count }) => setCommandCount(count || 0));
    supabase.from("bot_logs").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(5).then(({ data }) => setRecentLogs(data || []));
  }, [selectedBot, user]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {selectedBot ? `Managing ${selectedBot.bot_name}` : "Select or add a bot to get started"}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard title="Connected Bots" value={bots.length} icon={Server} />
        <StatCard title="Guilds" value={selectedBot?.guild_count || 0} icon={Users} />
        <StatCard title="Commands" value={commandCount} icon={Terminal} />
        <StatCard title="Status" value={selectedBot?.status || "N/A"} icon={Activity} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-card-foreground mb-4">Recent Activity</h2>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet. Connect a bot and create commands to get started.</p>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-sm text-card-foreground">{log.message}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-card-foreground mb-4">Bot Status</h2>
          {selectedBot ? (
            <div className="flex flex-col items-center py-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3 glow-primary">
                <Circle className={`w-6 h-6 fill-current ${selectedBot.status === "online" ? "text-success animate-pulse-glow" : "text-muted-foreground"}`} />
              </div>
              <p className="font-medium text-card-foreground">{selectedBot.bot_name}</p>
              <p className={`text-xs mt-1 ${selectedBot.status === "online" ? "text-success" : "text-muted-foreground"}`}>{selectedBot.status}</p>
              <div className="w-full mt-6 space-y-2">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Prefix</span><span className="text-card-foreground font-mono">{selectedBot.prefix}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Guilds</span><span className="text-card-foreground font-mono">{selectedBot.guild_count}</span></div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No bot selected</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
