import { motion } from "framer-motion";
import { Shield, AlertTriangle, Ban, Clock, MessageSquareOff, Settings, X, Plus, Trash2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface ModuleConfig {
  enabled: boolean;
  config: Record<string, any>;
}

const defaultModules = [
  {
    module_name: "automod", label: "Auto Moderation", description: "Automatically filter spam, links, invites, and mass mentions",
    icon: Shield, configFields: [
      { key: "block_links", label: "Block Links", type: "toggle", default: true },
      { key: "block_invites", label: "Block Discord Invites", type: "toggle", default: true },
      { key: "block_caps", label: "Block Excessive Caps", type: "toggle", default: false },
      { key: "caps_threshold", label: "Caps Threshold (%)", type: "number", default: 70 },
      { key: "max_mentions", label: "Max Mentions Per Message", type: "number", default: 5 },
      { key: "action", label: "Action", type: "select", options: ["warn", "mute", "kick", "delete"], default: "delete" },
      { key: "log_channel", label: "Log Channel ID", type: "text", default: "" },
    ],
  },
  {
    module_name: "wordfilter", label: "Word Filter", description: "Block specific words, phrases, and regex patterns",
    icon: MessageSquareOff, configFields: [
      { key: "blocked_words", label: "Blocked Words (one per line)", type: "textarea", default: "" },
      { key: "use_regex", label: "Enable Regex Patterns", type: "toggle", default: false },
      { key: "wildcard_match", label: "Wildcard Matching", type: "toggle", default: true },
      { key: "action", label: "Action", type: "select", options: ["warn", "mute", "delete"], default: "delete" },
      { key: "exempt_roles", label: "Exempt Role IDs (comma-separated)", type: "text", default: "" },
    ],
  },
  {
    module_name: "antispam", label: "Anti-Spam", description: "Detect and prevent message spam, duplicate messages, and emoji spam",
    icon: AlertTriangle, configFields: [
      { key: "max_messages", label: "Max Messages Per Interval", type: "number", default: 5 },
      { key: "interval_seconds", label: "Interval (seconds)", type: "number", default: 5 },
      { key: "max_duplicates", label: "Max Duplicate Messages", type: "number", default: 3 },
      { key: "max_emojis", label: "Max Emojis Per Message", type: "number", default: 10 },
      { key: "action", label: "Action", type: "select", options: ["warn", "mute", "kick", "timeout"], default: "mute" },
      { key: "timeout_duration", label: "Timeout Duration (minutes)", type: "number", default: 5 },
    ],
  },
  {
    module_name: "raidprotect", label: "Raid Protection", description: "Protect against mass join raids and suspicious account patterns",
    icon: Ban, configFields: [
      { key: "join_threshold", label: "Join Threshold (per minute)", type: "number", default: 10 },
      { key: "min_account_age", label: "Min Account Age (days)", type: "number", default: 7 },
      { key: "lockdown_on_raid", label: "Auto-Lockdown on Raid", type: "toggle", default: true },
      { key: "verify_new_members", label: "Require Verification", type: "toggle", default: false },
      { key: "action", label: "Action on Raid", type: "select", options: ["lockdown", "kick_new", "ban_new"], default: "lockdown" },
      { key: "alert_channel", label: "Alert Channel ID", type: "text", default: "" },
    ],
  },
  {
    module_name: "slowmode", label: "Smart Slowmode", description: "Auto-adjust slowmode based on channel activity and message velocity",
    icon: Clock, configFields: [
      { key: "auto_adjust", label: "Auto-Adjust Slowmode", type: "toggle", default: true },
      { key: "min_slowmode", label: "Min Slowmode (seconds)", type: "number", default: 0 },
      { key: "max_slowmode", label: "Max Slowmode (seconds)", type: "number", default: 30 },
      { key: "velocity_threshold", label: "Message Velocity Threshold", type: "number", default: 20 },
      { key: "cooldown_period", label: "Cooldown Period (minutes)", type: "number", default: 5 },
    ],
  },
];

export default function DashboardModeration() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [modules, setModules] = useState<Record<string, ModuleConfig>>({});
  const [configOpen, setConfigOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id).then(({ data }) => {
      const map: Record<string, ModuleConfig> = {};
      data?.forEach((m) => { map[m.module_name] = { enabled: m.enabled, config: (m.config as Record<string, any>) || {} }; });
      setModules(map);
    });
  }, [selectedBot]);

  const toggle = async (moduleName: string) => {
    if (!selectedBot || !user) return;
    const current = modules[moduleName]?.enabled || false;
    const { data: existing } = await supabase.from("bot_modules").select("id").eq("bot_id", selectedBot.id).eq("module_name", moduleName).maybeSingle();
    if (existing) {
      await supabase.from("bot_modules").update({ enabled: !current }).eq("id", existing.id);
    } else {
      await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: moduleName, enabled: true });
    }
    setModules((p) => ({ ...p, [moduleName]: { ...p[moduleName], enabled: !current, config: p[moduleName]?.config || {} } }));
  };

  const updateConfig = (moduleName: string, key: string, value: any) => {
    setModules((p) => ({
      ...p,
      [moduleName]: {
        ...p[moduleName],
        enabled: p[moduleName]?.enabled || false,
        config: { ...(p[moduleName]?.config || {}), [key]: value },
      },
    }));
  };

  const saveConfig = async (moduleName: string) => {
    if (!selectedBot || !user) return;
    setSaving(true);
    const config = modules[moduleName]?.config || {};
    const { data: existing } = await supabase.from("bot_modules").select("id").eq("bot_id", selectedBot.id).eq("module_name", moduleName).maybeSingle();
    if (existing) {
      await supabase.from("bot_modules").update({ config: config as Json }).eq("id", existing.id);
    } else {
      await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: moduleName, enabled: true, config: config as Json });
    }
    toast.success(`${moduleName} settings saved`);
    setSaving(false);
  };

  const openModule = configOpen ? defaultModules.find((m) => m.module_name === configOpen) : null;

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Moderation</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure auto-moderation and safety features for your server</p>
      </motion.div>
      {!selectedBot ? <p className="text-muted-foreground mt-8">Select a bot first.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {defaultModules.map((mod, i) => {
            const state = modules[mod.module_name];
            const enabled = state?.enabled || false;
            return (
              <motion.div key={mod.module_name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cn("rounded-lg border p-5 transition-colors", enabled ? "border-primary/30 bg-card" : "border-border bg-card")}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={cn("p-2 rounded-md", enabled ? "bg-primary/10" : "bg-secondary")}><mod.icon className={cn("w-5 h-5", enabled ? "text-primary" : "text-muted-foreground")} /></div>
                    <div>
                      <h3 className="text-sm font-medium text-card-foreground">{mod.label}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setConfigOpen(mod.module_name)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggle(mod.module_name)} className={cn("w-9 h-5 rounded-full flex items-center transition-colors px-0.5 cursor-pointer", enabled ? "bg-primary justify-end" : "bg-secondary justify-start")}>
                      <div className="w-4 h-4 rounded-full bg-foreground/90" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Config Panel */}
      {openModule && configOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setConfigOpen(null)} />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-lg mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <openModule.icon className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-card-foreground">{openModule.label} Settings</h3>
              </div>
              <button onClick={() => setConfigOpen(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              {openModule.configFields.map((field) => {
                const val = modules[configOpen]?.config?.[field.key] ?? field.default;
                return (
                  <div key={field.key}>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">{field.label}</label>
                    {field.type === "toggle" && (
                      <button onClick={() => updateConfig(configOpen, field.key, !val)} className={cn("w-9 h-5 rounded-full flex items-center transition-colors px-0.5", val ? "bg-primary justify-end" : "bg-secondary justify-start")}>
                        <div className="w-4 h-4 rounded-full bg-foreground/90" />
                      </button>
                    )}
                    {field.type === "number" && (
                      <input type="number" value={val} onChange={(e) => updateConfig(configOpen, field.key, Number(e.target.value))} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    )}
                    {field.type === "text" && (
                      <input type="text" value={val} onChange={(e) => updateConfig(configOpen, field.key, e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                    )}
                    {field.type === "textarea" && (
                      <textarea value={val} onChange={(e) => updateConfig(configOpen, field.key, e.target.value)} rows={4} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                    )}
                    {field.type === "select" && (
                      <select value={val} onChange={(e) => updateConfig(configOpen, field.key, e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                        {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={() => saveConfig(configOpen)} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
