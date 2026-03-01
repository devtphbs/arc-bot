import { motion } from "framer-motion";
import { Key, Globe, Bell } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export default function DashboardSettings() {
  const { selectedBot, refetch } = useBot();
  const [prefix, setPrefix] = useState(selectedBot?.prefix || "!");

  const updatePrefix = async () => {
    if (!selectedBot) return;
    await supabase.from("bots").update({ prefix }).eq("id", selectedBot.id);
    toast.success("Prefix updated");
    refetch();
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
        <p className="text-sm text-muted-foreground mt-1">Manage your bot and account settings</p>
      </motion.div>
      {!selectedBot ? <p className="text-muted-foreground mt-8">Select a bot first.</p> : (
        <div className="space-y-6 mt-8">
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4"><Key className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Bot Token</h2></div>
            <div className="flex gap-3">
              <input type="password" value="••••••••••••••••••••••••••••" readOnly className="flex-1 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none" />
              <button className="px-4 py-2.5 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors">Update</button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Your token is encrypted and never exposed.</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4"><Globe className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Bot Prefix</h2></div>
            <div className="flex gap-3">
              <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-32 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={updatePrefix} className="px-4 py-2.5 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-lg border border-destructive/30 bg-card p-5">
            <h2 className="text-sm font-medium text-destructive mb-2">Danger Zone</h2>
            <p className="text-xs text-muted-foreground mb-3">Permanently disconnect this bot and delete all associated data.</p>
            <button onClick={disconnectBot} className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:opacity-90 transition-opacity">Disconnect Bot</button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
