import { motion } from "framer-motion";
import { Key, Globe, Bell, Palette } from "lucide-react";

export default function DashboardSettings() {
  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your bot and account settings</p>
      </motion.div>

      <div className="space-y-6 mt-8">
        {/* Bot Token */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-card-foreground">Bot Token</h2>
          </div>
          <div className="flex gap-3">
            <input
              type="password"
              value="••••••••••••••••••••••••••••"
              readOnly
              className="flex-1 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none"
            />
            <button className="px-4 py-2.5 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors">
              Update
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Your token is encrypted and never exposed to the frontend.</p>
        </motion.div>

        {/* Prefix */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-card-foreground">Bot Prefix</h2>
          </div>
          <input
            type="text"
            defaultValue="!"
            className="w-32 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </motion.div>

        {/* Notifications */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-card-foreground">Notifications</h2>
          </div>
          <label className="flex items-center gap-3 text-sm text-card-foreground cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded border-border accent-primary" />
            Email me when my bot goes offline
          </label>
        </motion.div>

        {/* Danger Zone */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-lg border border-destructive/30 bg-card p-5">
          <h2 className="text-sm font-medium text-destructive mb-2">Danger Zone</h2>
          <p className="text-xs text-muted-foreground mb-3">Permanently disconnect this bot and delete all associated data.</p>
          <button className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:opacity-90 transition-opacity">
            Disconnect Bot
          </button>
        </motion.div>
      </div>
    </div>
  );
}
