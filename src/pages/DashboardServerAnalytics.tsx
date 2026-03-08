import { motion } from "framer-motion";
import { BarChart3, Users, MessageSquare, Hash, TrendingUp, Activity, UserPlus, UserMinus } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const COLORS = ["hsl(48,100%,50%)", "hsl(210,100%,56%)", "hsl(152,69%,45%)", "hsl(0,72%,55%)", "hsl(38,92%,55%)", "hsl(280,70%,55%)"];

export default function DashboardServerAnalytics() {
  const { selectedBot } = useBot();
  const [events, setEvents] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedBot) return;
    setLoading(true);
    Promise.all([
      supabase.from("server_events").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(1000),
      supabase.from("bot_logs").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(500),
      supabase.from("user_levels").select("*").eq("bot_id", selectedBot.id).order("xp", { ascending: false }).limit(50),
    ]).then(([ev, lg, lv]) => {
      setEvents(ev.data || []);
      setLogs(lg.data || []);
      setLevels(lv.data || []);
      setLoading(false);
    });
  }, [selectedBot?.id]);

  const memberActivity = useMemo(() => {
    const days: Record<string, { joins: number; leaves: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toLocaleDateString("en", { month: "short", day: "numeric" });
      days[key] = { joins: 0, leaves: 0 };
    }
    events.forEach((e) => {
      const d = new Date(e.created_at);
      const key = d.toLocaleDateString("en", { month: "short", day: "numeric" });
      if (key in days) {
        if (e.event_type === "member_join") days[key].joins++;
        if (e.event_type === "member_leave") days[key].leaves++;
      }
    });
    return Object.entries(days).map(([day, data]) => ({ day, ...data }));
  }, [events]);

  const messageActivity = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toLocaleDateString("en", { weekday: "short" });
      days[key] = 0;
    }
    events.filter((e) => e.event_type === "message").forEach((e) => {
      const d = new Date(e.created_at);
      const key = d.toLocaleDateString("en", { weekday: "short" });
      if (key in days) days[key]++;
    });
    return Object.entries(days).map(([day, messages]) => ({ day, messages }));
  }, [events]);

  const topChannels = useMemo(() => {
    const counts: Record<string, number> = {};
    events.filter((e) => e.event_type === "message" && e.event_data?.channel_id).forEach((e) => {
      const ch = e.event_data.channel_id;
      counts[ch] = (counts[ch] || 0) + 1;
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 6).map(([channel, count]) => ({ channel, count }));
  }, [events]);

  const topUsers = useMemo(() => {
    return levels.slice(0, 10).map((l) => ({
      user: l.user_id,
      xp: l.xp,
      level: l.level,
    }));
  }, [levels]);

  const eventBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => { counts[e.event_type] = (counts[e.event_type] || 0) + 1; });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 6).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [events]);

  const totalJoins = events.filter((e) => e.event_type === "member_join").length;
  const totalLeaves = events.filter((e) => e.event_type === "member_leave").length;
  const totalMessages = events.filter((e) => e.event_type === "message").length;

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
        <h1 className="text-2xl font-semibold text-foreground">Server Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Track member growth, message activity, and server trends</p>
      </motion.div>

      {!selectedBot ? <p className="text-muted-foreground mt-8">Select a bot first.</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {[
              { label: "Member Joins", value: totalJoins, icon: UserPlus, color: "text-success" },
              { label: "Member Leaves", value: totalLeaves, icon: UserMinus, color: "text-destructive" },
              { label: "Messages Tracked", value: totalMessages, icon: MessageSquare, color: "text-primary" },
              { label: "Top Users", value: levels.length, icon: Users, color: "text-info" },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</span>
                  <stat.icon className={cn("w-4 h-4", stat.color)} />
                </div>
                <p className="text-2xl font-semibold text-card-foreground">{stat.value}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Member Growth */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Member Activity (14 Days)</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={memberActivity}>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={customTooltip} />
                    <Bar dataKey="joins" fill="hsl(152,69%,45%)" radius={[2, 2, 0, 0]} name="Joins" />
                    <Bar dataKey="leaves" fill="hsl(0,72%,55%)" radius={[2, 2, 0, 0]} name="Leaves" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Message Activity */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Message Activity (7 Days)</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={messageActivity}>
                    <defs>
                      <linearGradient id="colorMsgs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(48,100%,50%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(48,100%,50%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={customTooltip} />
                    <Area type="monotone" dataKey="messages" stroke="hsl(48,100%,50%)" fill="url(#colorMsgs)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Top Channels */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Top Active Channels</h3>
              <div className="h-48">
                {topChannels.length === 0 ? (
                  <p className="text-sm text-muted-foreground flex items-center justify-center h-full">No channel data yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topChannels} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="channel" tick={{ fontSize: 10, fill: "hsl(0,0%,50%)" }} axisLine={false} tickLine={false} width={100} />
                      <Tooltip content={customTooltip} />
                      <Bar dataKey="count" fill="hsl(210,100%,56%)" radius={[0, 4, 4, 0]} name="Messages" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>

            {/* Event Breakdown */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Event Breakdown</h3>
              <div className="h-48 flex items-center justify-center">
                {eventBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events tracked yet. Start your bot to collect data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={eventBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                        {eventBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={customTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>

            {/* Top Users by XP */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
              <h3 className="text-sm font-medium text-card-foreground mb-4">Top Users by XP</h3>
              {topUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No leveling data yet</p>
              ) : (
                <div className="space-y-2">
                  {topUsers.map((u, i) => (
                    <div key={u.user} className="flex items-center gap-3 p-2.5 rounded-md bg-background border border-border">
                      <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", i < 3 ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-mono text-card-foreground flex-1">{u.user}</span>
                      <span className="text-xs text-muted-foreground">Level {u.level}</span>
                      <span className="text-xs font-mono text-primary">{u.xp.toLocaleString()} XP</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
