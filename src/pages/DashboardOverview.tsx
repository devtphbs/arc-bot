import { StatCard } from "@/components/StatCard";
import { Users, Terminal, Server, Activity, Circle } from "lucide-react";
import { motion } from "framer-motion";

const recentActivity = [
  { action: "Command /ban deployed", time: "2 min ago", type: "command" },
  { action: "Bot went online", time: "15 min ago", type: "status" },
  { action: "Auto-mod triggered (spam)", time: "1 hr ago", type: "mod" },
  { action: "Welcome message sent", time: "2 hrs ago", type: "event" },
  { action: "Command /help updated", time: "5 hrs ago", type: "command" },
];

export default function DashboardOverview() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor your bot performance and activity</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard title="Total Servers" value="24" change="+3 this week" icon={Server} positive />
        <StatCard title="Active Users" value="1,284" change="+12%" icon={Users} positive />
        <StatCard title="Commands" value="18" icon={Terminal} />
        <StatCard title="Uptime" value="99.9%" change="Last 30 days" icon={Activity} positive />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        {/* Activity */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 rounded-lg border border-border bg-card p-5"
        >
          <h2 className="text-sm font-medium text-card-foreground mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span className="text-sm text-card-foreground">{item.action}</span>
                </div>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Bot Status */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-lg border border-border bg-card p-5"
        >
          <h2 className="text-sm font-medium text-card-foreground mb-4">Bot Status</h2>
          <div className="flex flex-col items-center py-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3 glow-primary">
              <Circle className="w-6 h-6 text-success fill-success animate-pulse-glow" />
            </div>
            <p className="font-medium text-card-foreground">ArcBot Dev</p>
            <p className="text-xs text-success mt-1">Online</p>
            <div className="w-full mt-6 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Latency</span>
                <span className="text-card-foreground font-mono">42ms</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Memory</span>
                <span className="text-card-foreground font-mono">128MB</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Guilds</span>
                <span className="text-card-foreground font-mono">24</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
