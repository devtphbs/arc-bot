import { motion } from "framer-motion";
import { UserPlus, UserMinus, Hash, Save, Loader2, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface WelcomeConfig {
  enabled: boolean;
  channelId: string;
  message: string;
  embedEnabled: boolean;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
}

interface LeaveConfig {
  enabled: boolean;
  channelId: string;
  message: string;
}

const DEFAULT_WELCOME: WelcomeConfig = {
  enabled: false,
  channelId: "",
  message: "Welcome to the server, {user}! 🎉 We're glad to have you here.",
  embedEnabled: false,
  embedTitle: "Welcome!",
  embedDescription: "Hey {user}, welcome to **{server}**! Check out the rules and have fun.",
  embedColor: "#FFD700",
};

const DEFAULT_LEAVE: LeaveConfig = {
  enabled: false,
  channelId: "",
  message: "{user} has left the server. Goodbye! 👋",
};

const VARIABLES = [
  { token: "{user}", desc: "Username" },
  { token: "{mention}", desc: "@mention" },
  { token: "{server}", desc: "Server name" },
  { token: "{memberCount}", desc: "Member count" },
];

export default function DashboardWelcome() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [welcome, setWelcome] = useState<WelcomeConfig>(DEFAULT_WELCOME);
  const [leave, setLeave] = useState<LeaveConfig>(DEFAULT_LEAVE);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"welcome" | "leave">("welcome");

  useEffect(() => {
    if (!selectedBot) return;
    supabase
      .from("bot_modules")
      .select("*")
      .eq("bot_id", selectedBot.id)
      .in("module_name", ["welcome", "leave"])
      .then(({ data }) => {
        data?.forEach((m) => {
          const cfg = m.config as Record<string, unknown> | null;
          if (m.module_name === "welcome" && cfg) {
            setWelcome({
              enabled: m.enabled,
              channelId: (cfg.channelId as string) || (cfg.channel as string) || "",
              message: (cfg.message as string) || DEFAULT_WELCOME.message,
              embedEnabled: Boolean(cfg.embedEnabled),
              embedTitle: (cfg.embedTitle as string) || "",
              embedDescription: (cfg.embedDescription as string) || "",
              embedColor: (cfg.embedColor as string) || "#FFD700",
            });
          }
          if (m.module_name === "leave" && cfg) {
            setLeave({
              enabled: m.enabled,
              channelId: (cfg.channelId as string) || (cfg.channel as string) || "",
              message: (cfg.message as string) || DEFAULT_LEAVE.message,
            });
          }
        });
      });
  }, [selectedBot?.id]);

  const saveConfig = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      for (const [moduleName, config, enabled] of [
        ["welcome", { channelId: welcome.channelId, message: welcome.message, embedEnabled: welcome.embedEnabled, embedTitle: welcome.embedTitle, embedDescription: welcome.embedDescription, embedColor: welcome.embedColor }, welcome.enabled],
        ["leave", { channelId: leave.channelId, message: leave.message }, leave.enabled],
      ] as [string, Record<string, unknown>, boolean][]) {
        const { data: existing } = await supabase
          .from("bot_modules")
          .select("id")
          .eq("bot_id", selectedBot.id)
          .eq("module_name", moduleName)
          .maybeSingle();
        if (existing) {
          await supabase.from("bot_modules").update({ enabled, config: config as unknown as Json }).eq("id", existing.id);
        } else {
          await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: moduleName, enabled, config: config as unknown as Json });
        }
      }
      toast.success("Welcome & leave settings saved!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const resolvePreview = (text: string) =>
    text
      .replace(/\{user\}/g, "NewUser")
      .replace(/\{mention\}/g, "@NewUser")
      .replace(/\{server\}/g, selectedBot?.bot_name || "My Server")
      .replace(/\{memberCount\}/g, "128");

  if (!selectedBot) return <div className="p-6 lg:p-8"><p className="text-muted-foreground">Select a bot first.</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Welcome & Leave Messages</h1>
          <p className="text-sm text-muted-foreground mt-1">Greet new members and say goodbye when they leave</p>
        </div>
        <button onClick={saveConfig} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </motion.div>

      {/* Welcome Section */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-success/10"><UserPlus className="w-5 h-5 text-success" /></div>
            <div>
              <h2 className="text-sm font-medium text-card-foreground">Welcome Message</h2>
              <p className="text-xs text-muted-foreground">Sent when a new member joins</p>
            </div>
          </div>
          <button onClick={() => setWelcome((p) => ({ ...p, enabled: !p.enabled }))} className={cn("w-10 h-5 rounded-full flex items-center transition-colors px-0.5", welcome.enabled ? "bg-success justify-end" : "bg-secondary justify-start")}>
            <div className="w-4 h-4 rounded-full bg-foreground/90" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Channel ID</label>
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <input type="text" value={welcome.channelId} onChange={(e) => setWelcome((p) => ({ ...p, channelId: e.target.value }))} placeholder="123456789012345678" className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Message</label>
            <textarea value={welcome.message} onChange={(e) => setWelcome((p) => ({ ...p, message: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground inline-flex items-center gap-2"><input type="checkbox" checked={welcome.embedEnabled} onChange={(e) => setWelcome((p) => ({ ...p, embedEnabled: e.target.checked }))} className="accent-primary" /> Send as embed</label>
          </div>
          {welcome.embedEnabled && (
            <div className="space-y-3 pl-4 border-l-2 border-primary/20">
              <input type="text" value={welcome.embedTitle} onChange={(e) => setWelcome((p) => ({ ...p, embedTitle: e.target.value }))} placeholder="Embed title" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              <textarea value={welcome.embedDescription} onChange={(e) => setWelcome((p) => ({ ...p, embedDescription: e.target.value }))} placeholder="Embed description" rows={2} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Color</label>
                <input type="color" value={welcome.embedColor} onChange={(e) => setWelcome((p) => ({ ...p, embedColor: e.target.value }))} className="w-8 h-8 rounded border-0 cursor-pointer" />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Leave Section */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-destructive/10"><UserMinus className="w-5 h-5 text-destructive" /></div>
            <div>
              <h2 className="text-sm font-medium text-card-foreground">Leave Message</h2>
              <p className="text-xs text-muted-foreground">Sent when a member leaves</p>
            </div>
          </div>
          <button onClick={() => setLeave((p) => ({ ...p, enabled: !p.enabled }))} className={cn("w-10 h-5 rounded-full flex items-center transition-colors px-0.5", leave.enabled ? "bg-success justify-end" : "bg-secondary justify-start")}>
            <div className="w-4 h-4 rounded-full bg-foreground/90" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Channel ID</label>
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <input type="text" value={leave.channelId} onChange={(e) => setLeave((p) => ({ ...p, channelId: e.target.value }))} placeholder="123456789012345678" className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Message</label>
            <textarea value={leave.message} onChange={(e) => setLeave((p) => ({ ...p, message: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>
        </div>
      </motion.div>

      {/* Variables */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 rounded-lg border border-border bg-card p-5">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Available Variables</h3>
        <div className="flex flex-wrap gap-2">
          {VARIABLES.map((v) => (
            <span key={v.token} className="px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-mono">
              {v.token} <span className="text-muted-foreground ml-1">— {v.desc}</span>
            </span>
          ))}
        </div>
      </motion.div>

      {/* Preview */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Eye className="w-4 h-4 text-primary" /><h3 className="text-sm font-medium text-card-foreground">Preview</h3></div>
          <div className="flex gap-1">
            {(["welcome", "leave"] as const).map((m) => (
              <button key={m} onClick={() => setPreviewMode(m)} className={cn("px-2.5 py-1 rounded-md text-xs transition-colors capitalize", previewMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}>{m}</button>
            ))}
          </div>
        </div>
        <div className="rounded-md bg-background border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">B</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-card-foreground">{selectedBot.bot_name}</span>
                <span className="text-[10px] px-1 py-0.5 rounded bg-primary/20 text-primary">BOT</span>
                <span className="text-[10px] text-muted-foreground">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-sm text-card-foreground mt-1">
                {previewMode === "welcome" ? resolvePreview(welcome.message) : resolvePreview(leave.message)}
              </p>
              {previewMode === "welcome" && welcome.embedEnabled && (
                <div className="mt-2 rounded-md border-l-4 p-3 bg-secondary/50" style={{ borderColor: welcome.embedColor }}>
                  {welcome.embedTitle && <p className="text-sm font-semibold text-card-foreground">{resolvePreview(welcome.embedTitle)}</p>}
                  {welcome.embedDescription && <p className="text-xs text-muted-foreground mt-1">{resolvePreview(welcome.embedDescription)}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
