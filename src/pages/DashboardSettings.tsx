import { motion } from "framer-motion";
import { Key, Globe, Image, Type, Trash2, Upload, Loader2, ExternalLink, Gamepad2, MessageCircle } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const statusTypes = [
  { value: "online", label: "Online", color: "bg-green-500" },
  { value: "idle", label: "Idle", color: "bg-yellow-500" },
  { value: "dnd", label: "Do Not Disturb", color: "bg-destructive" },
  { value: "invisible", label: "Invisible", color: "bg-muted-foreground" },
];

const activityTypes = [
  { value: "0", label: "Playing" },
  { value: "1", label: "Streaming" },
  { value: "2", label: "Listening to" },
  { value: "3", label: "Watching" },
  { value: "5", label: "Competing in" },
];

export default function DashboardSettings() {
  const { selectedBot, refetch } = useBot();
  const [prefix, setPrefix] = useState(selectedBot?.prefix || "!");
  const [botName, setBotName] = useState(selectedBot?.bot_name || "");
  const [updatingName, setUpdatingName] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [customStatus, setCustomStatus] = useState("");
  const [activityType, setActivityType] = useState("0");
  const [presenceStatus, setPresenceStatus] = useState("online");

  useEffect(() => {
    if (selectedBot) {
      setPrefix(selectedBot.prefix || "!");
      setBotName(selectedBot.bot_name || "");
    }
  }, [selectedBot]);

  const updatePrefix = async () => {
    if (!selectedBot) return;
    await supabase.from("bots").update({ prefix }).eq("id", selectedBot.id);
    toast.success("Prefix updated");
    refetch();
  };

  const updateBotName = async () => {
    if (!selectedBot || !botName.trim()) return;
    setUpdatingName(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-bot", {
        body: { bot_id: selectedBot.id, action: "update_name", name: botName.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Bot name updated on Discord!");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to update name");
    } finally {
      setUpdatingName(false);
    }
  };

  const updateBotAvatar = async () => {
    if (!selectedBot) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { toast.error("Image must be under 8MB"); return; }
      setUpdatingAvatar(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          const { data, error } = await supabase.functions.invoke("manage-bot", {
            body: { bot_id: selectedBot.id, action: "update_avatar", avatar: base64 },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          toast.success("Bot avatar updated on Discord!");
          refetch();
          setUpdatingAvatar(false);
        };
        reader.readAsDataURL(file);
      } catch (err: any) {
        toast.error(err.message || "Failed to update avatar");
        setUpdatingAvatar(false);
      }
    };
    input.click();
  };

  const updateCustomStatus = async () => {
    if (!selectedBot) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-bot", {
        body: { bot_id: selectedBot.id, action: "update_status", status_text: customStatus, activity_type: parseInt(activityType), presence_status: presenceStatus },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Bot status updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const disconnectBot = async () => {
    if (!selectedBot) return;
    if (!confirm("Are you sure? This will delete all commands and data for this bot.")) return;
    await supabase.from("bots").delete().eq("id", selectedBot.id);
    toast.success("Bot disconnected");
    refetch();
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your bot's identity and configuration</p>
      </motion.div>
      {!selectedBot ? <p className="text-muted-foreground mt-8">Select a bot first.</p> : (
        <div className="space-y-6 mt-8">
          {/* Bot Identity */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4"><Type className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Bot Identity</h2></div>
            <div className="flex items-start gap-4 mb-4">
              <div className="relative group">
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center overflow-hidden border-2 border-border">
                  {selectedBot.bot_avatar ? (
                    <img src={selectedBot.bot_avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-muted-foreground">{selectedBot.bot_name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <button onClick={updateBotAvatar} disabled={updatingAvatar} className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  {updatingAvatar ? <Loader2 className="w-5 h-5 animate-spin text-foreground" /> : <Upload className="w-5 h-5 text-foreground" />}
                </button>
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Bot Username</label>
                <div className="flex gap-2">
                  <input type="text" value={botName} onChange={(e) => setBotName(e.target.value)} className="flex-1 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  <button onClick={updateBotName} disabled={updatingName || botName === selectedBot.bot_name} className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                    {updatingName ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Changes the bot's username on Discord. Limited to 2 changes per hour by Discord.</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              To change the bot's banner, go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Discord Developer Portal</a> → Your App → Bot → Banner
            </p>
          </motion.div>

          {/* Custom Status */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4"><Gamepad2 className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Custom Status</h2></div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Presence</label>
                <div className="flex gap-2">
                  {statusTypes.map((s) => (
                    <button key={s.value} onClick={() => setPresenceStatus(s.value)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${presenceStatus === s.value ? "bg-primary/10 text-primary border border-primary/30" : "bg-secondary text-secondary-foreground border border-transparent"}`}>
                      <div className={`w-2 h-2 rounded-full ${s.color}`} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Activity Type</label>
                <select value={activityType} onChange={(e) => setActivityType(e.target.value)} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  {activityTypes.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Status Text</label>
                <div className="flex gap-2">
                  <input type="text" value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} placeholder="e.g. with 1,000 users" className="flex-1 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  <button onClick={updateCustomStatus} disabled={!customStatus.trim()} className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">Save</button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Variables: <code className="font-mono text-primary">{'{guilds}'}</code> <code className="font-mono text-primary">{'{members}'}</code> <code className="font-mono text-primary">{'{commands}'}</code></p>
              </div>
            </div>
          </motion.div>

          {/* Bot Token */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4"><Key className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Bot Token</h2></div>
            <div className="flex gap-3">
              <input type="password" value="••••••••••••••••••••••••••••" readOnly className="flex-1 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none" />
              <button className="px-4 py-2.5 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors">Regenerate</button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Your token is encrypted and never exposed. To reset, regenerate in the Discord Developer Portal.</p>
          </motion.div>

          {/* Bot Prefix */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4"><MessageCircle className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Bot Prefix</h2></div>
            <div className="flex gap-3">
              <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-32 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={updatePrefix} className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Used for prefix-based commands like <code className="font-mono text-primary">!help</code></p>
          </motion.div>

          {/* Danger Zone */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-lg border border-destructive/30 bg-card p-5">
            <h2 className="text-sm font-medium text-destructive mb-2">Danger Zone</h2>
            <p className="text-xs text-muted-foreground mb-3">Permanently disconnect this bot and delete all associated data including commands, modules, and logs.</p>
            <button onClick={disconnectBot} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:opacity-90 transition-opacity">Disconnect Bot</button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
