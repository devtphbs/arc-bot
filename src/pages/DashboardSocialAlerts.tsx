import { motion } from "framer-motion";
import { Bell, Plus, Trash2, Save, Loader2, Globe } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";

interface SocialAlert {
  id: string;
  platform: "twitch" | "youtube" | "twitter";
  username: string;
  channelId: string;
  message: string;
  mentionRole: string;
}

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const PLATFORMS = [
  { value: "twitch" as const, label: "Twitch", color: "text-purple-400", emoji: "📺" },
  { value: "youtube" as const, label: "YouTube", color: "text-destructive", emoji: "▶️" },
  { value: "twitter" as const, label: "Twitter/X", color: "text-info", emoji: "🐦" },
];

export default function DashboardSocialAlerts() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<SocialAlert[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id).eq("module_name", "social_alerts").maybeSingle().then(({ data }) => {
      if (data?.config) {
        const c = data.config as { alerts?: SocialAlert[] };
        setAlerts(c.alerts || []);
        setEnabled(data.enabled);
      }
    });
  }, [selectedBot?.id]);

  const addAlert = () => setAlerts((p) => [...p, { id: createId(), platform: "twitch", username: "", channelId: "", message: "{user} is now live on {platform}! 🎮", mentionRole: "" }]);
  const updateAlert = (id: string, updates: Partial<SocialAlert>) => setAlerts((p) => p.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  const deleteAlert = (id: string) => setAlerts((p) => p.filter((a) => a.id !== id));

  const save = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      const config = { alerts } as unknown as Json;
      const { data: existing } = await supabase.from("bot_modules").select("id").eq("bot_id", selectedBot.id).eq("module_name", "social_alerts").maybeSingle();
      if (existing) {
        await supabase.from("bot_modules").update({ enabled, config }).eq("id", existing.id);
      } else {
        await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: "social_alerts", enabled, config });
      }
      toast.success("Social alerts saved!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!selectedBot) return <div className="p-6"><p className="text-muted-foreground">Select a bot first.</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" /> Social Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Get notified when creators go live or post</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setEnabled(!enabled)} className={cn("w-12 h-6 rounded-full transition-colors relative", enabled ? "bg-primary" : "bg-secondary")}>
            <div className={cn("w-5 h-5 rounded-full bg-background absolute top-0.5 transition-transform", enabled ? "translate-x-6" : "translate-x-0.5")} />
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 glow-primary disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </motion.div>

      <div className="space-y-4 mt-6">
        {alerts.map((alert, i) => {
          const platform = PLATFORMS.find((p) => p.value === alert.platform);
          return (
            <motion.div key={alert.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-card-foreground flex items-center gap-2">
                  <span>{platform?.emoji}</span> {platform?.label} Alert
                </span>
                <button onClick={() => deleteAlert(alert.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-[140px_1fr] gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Platform</label>
                    <select value={alert.platform} onChange={(e) => updateAlert(alert.id, { platform: e.target.value as any })} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                      {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.emoji} {p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Username / Handle</label>
                    <input type="text" value={alert.username} onChange={(e) => updateAlert(alert.id, { username: e.target.value })} placeholder="username" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Notification Channel ID</label>
                    <input type="text" value={alert.channelId} onChange={(e) => updateAlert(alert.id, { channelId: e.target.value })} placeholder="Channel ID" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Mention Role ID</label>
                    <input type="text" value={alert.mentionRole} onChange={(e) => updateAlert(alert.id, { mentionRole: e.target.value })} placeholder="Optional" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Message</label>
                  <textarea value={alert.message} onChange={(e) => updateAlert(alert.id, { message: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                  <p className="text-[10px] text-muted-foreground mt-1">Variables: <code className="font-mono text-primary">{'{user}'}</code> <code className="font-mono text-primary">{'{platform}'}</code> <code className="font-mono text-primary">{'{url}'}</code></p>
                </div>
              </div>
            </motion.div>
          );
        })}

        <button onClick={addAlert} className="w-full py-3 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Alert
        </button>
      </div>
    </div>
  );
}
