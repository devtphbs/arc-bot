import { StatCard } from "@/components/StatCard";
import { Users, Terminal, Server, Activity, Circle, Play, Square, RotateCcw, ExternalLink, Bot as BotIcon, BookOpen, Loader2, Copy, CheckCheck, AlertTriangle } from "lucide-react";
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
  const [copied, setCopied] = useState(false);
  const [showStopWarning, setShowStopWarning] = useState(false);

  useEffect(() => {
    if (!selectedBot || !user) return;
    supabase.from("commands").select("id", { count: "exact" }).eq("bot_id", selectedBot.id).then(({ count }) => setCommandCount(count || 0));
    supabase.from("bot_logs").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(5).then(({ data }) => setRecentLogs(data || []));
  }, [selectedBot, user]);

  const manageBotAction = async (action: "start" | "stop" | "restart") => {
    if (!selectedBot || !user) return;

    // Show stop warning
    if (action === "stop") {
      setShowStopWarning(true);
    }

    setBotAction(action === "start" ? "starting" : action === "stop" ? "stopping" : "restarting");
    try {
      const { data, error } = await supabase.functions.invoke("manage-bot", {
        body: { bot_id: selectedBot.id, action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await supabase.from("bot_logs").insert({
        bot_id: selectedBot.id, user_id: user.id, level: "info", source: "dashboard",
        message: `Bot ${action === "start" ? "started" : action === "stop" ? "stopped" : "restarted"} — slash commands ${action !== "stop" ? "synced with Discord" : "unchanged"}`,
      });
      toast.success(`Bot ${action === "start" ? "started" : action === "stop" ? "stopped" : "restarted"}!`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} bot`);
    } finally {
      setBotAction(null);
      setShowStopWarning(false);
    }
  };

  const copyInviteLink = () => {
    if (!selectedBot?.bot_id) { toast.error("Start your bot first to generate an invite link"); return; }
    const url = `https://discord.com/oauth2/authorize?client_id=${selectedBot.bot_id}&permissions=8&scope=bot%20applications.commands`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const isOnline = selectedBot?.status === "online";

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {selectedBot ? `Managing ${selectedBot.bot_name} — use the sidebar to configure features` : "Select or add a bot to get started"}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard title="Connected Bots" value={bots.length} icon={Server} />
        <StatCard title="Guilds" value={selectedBot?.guild_count || 0} icon={Users} />
        <StatCard title="Commands" value={commandCount} icon={Terminal} />
        <StatCard title="Status" value={selectedBot?.status || "N/A"} icon={Activity} />
      </div>

      {/* Stop Warning Banner */}
      {showStopWarning && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-card-foreground">Bot is stopping…</p>
            <p className="text-xs text-muted-foreground mt-1">Turning off the bot might take a moment. Please don't make any other changes while the bot is stopping. The keepalive system will also stop reconnecting this bot.</p>
          </div>
        </motion.div>
      )}

      {selectedBot && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Bot Controls */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
              <BotIcon className="w-4 h-4 text-primary" /> Bot Controls
            </h2>
            <div className="flex flex-col items-center py-4">
              <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mb-3 transition-all overflow-hidden", isOnline ? "bg-primary/10 ring-2 ring-primary/30" : "bg-secondary")}>
                {selectedBot.bot_avatar ? (
                  <img src={selectedBot.bot_avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Circle className={cn("w-6 h-6 fill-current", isOnline ? "text-primary animate-pulse" : "text-muted-foreground")} />
                )}
              </div>
              <p className="font-medium text-card-foreground">{selectedBot.bot_name}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-primary" : "bg-muted-foreground")} />
                <p className={cn("text-xs capitalize", isOnline ? "text-primary" : "text-muted-foreground")}>{botAction || selectedBot.status}</p>
              </div>
              
              <div className="flex items-center gap-2 mt-4 w-full">
                {isOnline ? (
                  <button onClick={() => manageBotAction("stop")} disabled={!!botAction} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 transition-colors disabled:opacity-50">
                    {botAction === "stopping" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />} Stop
                  </button>
                ) : (
                  <button onClick={() => manageBotAction("start")} disabled={!!botAction} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors disabled:opacity-50">
                    {botAction === "starting" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Start
                  </button>
                )}
                <button onClick={() => manageBotAction("restart")} disabled={!!botAction} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors disabled:opacity-50">
                  {botAction === "restarting" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Restart
                </button>
              </div>

              {selectedBot.bot_id && (
                <button onClick={copyInviteLink} className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors">
                  {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy Invite Link"}
                </button>
              )}

              <p className="text-[10px] text-muted-foreground text-center mt-3">Starting your bot registers slash commands with Discord and connects it to the Gateway for 24/7 uptime. The keepalive system auto-reconnects every 2 minutes.</p>
            </div>
          </motion.div>

          {/* Quick Start Guide */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" /> How It Works
            </h2>
            <div className="space-y-3">
              {[
                { step: "1", title: "Create a bot on Discord", desc: "Go to the Discord Developer Portal → New Application → Bot tab → Create Bot → Copy the token. Enable 'Message Content Intent' under Privileged Gateway Intents for auto-responder and leveling features.", link: "https://discord.com/developers/applications" },
                { step: "2", title: "Connect your bot here", desc: "Click 'Add Bot' in the sidebar, paste your bot token. We validate it securely with Discord's API and never expose it." },
                { step: "3", title: "Invite bot to your server", desc: "Click 'Copy Invite Link' above. This includes bot + applications.commands scopes with administrator permissions." },
                { step: "4", title: "Configure features", desc: "Use the sidebar to set up Commands, Welcome messages, Reaction Roles, Leveling, Moderation, Auto Responder, Giveaways, Polls, and more. All features are off by default — enable only what you need." },
                { step: "5", title: "Start your bot", desc: "Click Start — your commands get synced to Discord and the bot connects to the Gateway. It stays online 24/7 with automatic reconnection every 2 minutes." },
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
          <h2 className="text-sm font-medium text-card-foreground mb-1">Recent Activity</h2>
          <p className="text-xs text-muted-foreground mb-3">Latest events from your bot including command usage, connection changes, and errors.</p>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet. Connect a bot and create commands to get started.</p>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-1.5 h-1.5 rounded-full", log.level === "error" ? "bg-destructive" : log.level === "warn" ? "bg-accent" : "bg-primary")} />
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
              { label: "Discord Developer Portal", url: "https://discord.com/developers/applications", desc: "Manage your bot application & intents" },
              { label: "Bot Invite Generator", url: "https://discordapi.com/permissions.html", desc: "Generate invite links with custom permissions" },
              { label: "Discord API Docs", url: "https://discord.com/developers/docs", desc: "Official API documentation & reference" },
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
