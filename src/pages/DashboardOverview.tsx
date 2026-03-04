import { StatCard } from "@/components/StatCard";
import { Users, Terminal, Server, Activity, Circle, Play, Square, RotateCcw, HelpCircle, ExternalLink, Bot as BotIcon, Image, Type, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function DashboardOverview() {
  const { selectedBot, bots, refetch } = useBot();
  const { user } = useAuth();
  const [commandCount, setCommandCount] = useState(0);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [botAction, setBotAction] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedBot || !user) return;
    supabase.from("commands").select("id", { count: "exact" }).eq("bot_id", selectedBot.id).then(({ count }) => setCommandCount(count || 0));
    supabase.from("bot_logs").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(5).then(({ data }) => setRecentLogs(data || []));
  }, [selectedBot, user]);

  const updateBotStatus = async (status: "online" | "offline") => {
    if (!selectedBot) return;
    setBotAction(status === "online" ? "starting" : "stopping");
    await supabase.from("bots").update({ status }).eq("id", selectedBot.id);
    if (user && selectedBot) {
      await supabase.from("bot_logs").insert({ bot_id: selectedBot.id, user_id: user.id, level: "info", source: "dashboard", message: `Bot ${status === "online" ? "started" : "stopped"} by user` });
    }
    toast.success(`Bot ${status === "online" ? "started" : "stopped"}!`);
    refetch();
    setBotAction(null);
  };

  const restartBot = async () => {
    if (!selectedBot) return;
    setBotAction("restarting");
    await supabase.from("bots").update({ status: "offline" }).eq("id", selectedBot.id);
    await new Promise((r) => setTimeout(r, 1000));
    await supabase.from("bots").update({ status: "online" }).eq("id", selectedBot.id);
    if (user && selectedBot) {
      await supabase.from("bot_logs").insert({ bot_id: selectedBot.id, user_id: user.id, level: "info", source: "dashboard", message: "Bot restarted by user" });
    }
    toast.success("Bot restarted!");
    refetch();
    setBotAction(null);
  };

  const isOnline = selectedBot?.status === "online";

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

      {selectedBot && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Bot Controls */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
              <BotIcon className="w-4 h-4 text-primary" /> Bot Controls
            </h2>
            <div className="flex flex-col items-center py-4">
              <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mb-3 transition-all", isOnline ? "bg-success/10 glow-primary" : "bg-secondary")}>
                <Circle className={cn("w-6 h-6 fill-current", isOnline ? "text-success animate-pulse-glow" : "text-muted-foreground")} />
              </div>
              <p className="font-medium text-card-foreground">{selectedBot.bot_name}</p>
              <p className={cn("text-xs mt-1 capitalize", isOnline ? "text-success" : "text-muted-foreground")}>{botAction || selectedBot.status}</p>
              
              <div className="flex items-center gap-2 mt-4 w-full">
                {isOnline ? (
                  <button onClick={() => updateBotStatus("offline")} disabled={!!botAction} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 transition-colors disabled:opacity-50">
                    <Square className="w-3.5 h-3.5" /> Stop
                  </button>
                ) : (
                  <button onClick={() => updateBotStatus("online")} disabled={!!botAction} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-success/10 text-success text-sm hover:bg-success/20 transition-colors disabled:opacity-50">
                    <Play className="w-3.5 h-3.5" /> Start
                  </button>
                )}
                <button onClick={restartBot} disabled={!!botAction} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors disabled:opacity-50">
                  <RotateCcw className="w-3.5 h-3.5" /> Restart
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-3">Your bot runs 24/7 for free while it's started</p>
            </div>
          </motion.div>

          {/* Quick Start Guide */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" /> Getting Started
            </h2>
            <div className="space-y-3">
              {[
                { step: "1", title: "Add your bot to a server", desc: "Go to the Discord Developer Portal → OAuth2 → URL Generator. Select 'bot' and 'applications.commands' scopes, pick permissions, then use the generated URL to invite your bot.", link: "https://discord.com/developers/applications" },
                { step: "2", title: "Change bot name & avatar", desc: "In the Developer Portal, click your application → Bot tab. Here you can change the username and upload a profile picture." },
                { step: "3", title: "Create commands", desc: "Go to Commands in the sidebar and click 'New Command'. Use the visual builder to add reply blocks, conditions, and more." },
                { step: "4", title: "Set up welcome messages", desc: "Go to Welcome page to configure join/leave messages. Choose a channel and customize the message with variables." },
                { step: "5", title: "Start your bot", desc: "Click the Start button above to bring your bot online. It runs 24/7 for free!" },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">{item.step}</div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1 mt-1">
                        Open Developer Portal <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-card-foreground mb-4">Recent Activity</h2>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet. Connect a bot and create commands to get started.</p>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-1.5 h-1.5 rounded-full", log.level === "error" ? "bg-destructive" : log.level === "warn" ? "bg-warning" : "bg-primary")} />
                    <span className="text-sm text-card-foreground">{log.message}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-card-foreground mb-4">Quick Links</h2>
          <div className="space-y-2">
            {[
              { label: "Discord Developer Portal", url: "https://discord.com/developers/applications", desc: "Manage your bot application" },
              { label: "Discord Permissions Calculator", url: "https://discordapi.com/permissions.html", desc: "Generate permission integers" },
              { label: "Cron Expression Generator", url: "https://crontab.guru/", desc: "Build cron schedules for automations" },
            ].map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-2.5 rounded-md hover:bg-secondary/50 transition-colors group">
                <div>
                  <p className="text-sm text-card-foreground group-hover:text-primary transition-colors">{link.label}</p>
                  <p className="text-[10px] text-muted-foreground">{link.desc}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
              </a>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
