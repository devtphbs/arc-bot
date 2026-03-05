import { motion } from "framer-motion";
import { BarChart3, TrendingUp, Users, Terminal, Clock, Activity } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from "recharts";

const COLORS = ["hsl(48,100%,50%)", "hsl(210,100%,56%)", "hsl(152,69%,45%)", "hsl(0,72%,55%)", "hsl(38,92%,55%)"];

export default function DashboardAnalytics() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [commands, setCommands] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedBot) return;
    Promise.all([
      supabase.from("commands").select("*").eq("bot_id", selectedBot.id),
      supabase.from("bot_logs").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(500),
      supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id),
    ]).then(([cmds, lg, mods]) => {
      setCommands(cmds.data || []);
      setLogs(lg.data || []);
      setModules(mods.data || []);
    });
  }, [selectedBot]);

  const topCommands = useMemo(() => {
    return [...commands].sort((a, b) => (b.uses || 0) - (a.uses || 0)).slice(0, 8).map((c) => ({ name: c.name, uses: c.uses || 0 }));
  }, [commands]);

  const activityByDay = useMemo(() => {
    const days: Record<string, number> = {};
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toLocaleDateString("en", { weekday: "short" });
      days[key] = 0;
    }
    logs.forEach((log) => {
      const d = new Date(log.created_at);
      const key = d.toLocaleDateString("en", { weekday: "short" });
      if (key in days) days[key]++;
    });
    return Object.entries(days).map(([day, count]) => ({ day, events: count }));
  }, [logs]);

  const logLevelBreakdown = useMemo(() => {
    const counts: Record<string, number> = { info: 0, warn: 0, error: 0 };
    logs.forEach((l) => { if (l.level in counts) counts[l.level]++; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [logs]);

  const commandTypeBreakdown = useMemo(() => {
    const counts: Record<string, number> = { slash: 0, prefix: 0, context: 0 };
    commands.forEach((c) => { if (c.type in counts) counts[c.type]++; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [commands]);

  const totalUses = commands.reduce((s, c) => s + (c.uses || 0), 0);
  const enabledModules = modules.filter((m) => m.enabled).length;

  const customTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-card-foreground">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs text-muted-foreground">{p.name}: <span className="text-primary font-mono">{p.value}</span></p>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Track your bot's performance and usage</p>
      </motion.div>

      {!selectedBot ? <p className="text-muted-foreground mt-8">Select a bot first.</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {[
              { label: "Total Commands", value: commands.length, icon: Terminal },
              { label: "Total Uses", value: totalUses, icon: TrendingUp },
              { label: "Log Events", value: logs.length, icon: Activity },
              { label: "Active Modules", value: enabledModules, icon: BarChart3 },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</span>
                  <stat.icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-2xl font-semibold text-card-foreground">{stat.value}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Activity Over Time */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Activity (Last 7 Days)</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityByDay}>
                    <defs>
                      <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(48,100%,50%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(48,100%,50%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={customTooltip} />
                    <Area type="monotone" dataKey="events" stroke="hsl(48,100%,50%)" fill="url(#colorEvents)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Top Commands */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Top Commands by Usage</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCommands} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip content={customTooltip} />
                    <Bar dataKey="uses" fill="hsl(48,100%,50%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Command Types */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Command Types</h3>
              <div className="h-48 flex items-center justify-center">
                {commandTypeBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No commands yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={commandTypeBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                        {commandTypeBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={customTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>

            {/* Log Levels */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Log Level Distribution</h3>
              <div className="h-48 flex items-center justify-center">
                {logLevelBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No logs yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={logLevelBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                        {logLevelBreakdown.map((entry, i) => (
                          <Cell key={i} fill={entry.name === "error" ? "hsl(0,72%,55%)" : entry.name === "warn" ? "hsl(38,92%,55%)" : "hsl(210,100%,56%)"} />
                        ))}
                      </Pie>
                      <Tooltip content={customTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
