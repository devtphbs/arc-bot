import { motion } from "framer-motion";
import { Gift, Plus, Trash2, Save, Loader2, Clock, Users, Trophy, Palette, Shield, MessageSquare, ShieldCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";

interface Giveaway {
  id: string;
  prize: string;
  channelId: string;
  duration: string; // e.g. "1d", "30m", "1mo"
  winners: number;
  roleRequirement: string;
  bypassRole: string;
  requiredMessages: number;
  color: string;
  endColor: string;
  active: boolean;
}

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function parseDuration(input: string): number {
  const match = input.trim().match(/^(\d+)\s*(mo|months?|d|days?|h|hours?|m|mins?|minutes?|s|secs?|seconds?)$/i);
  if (!match) return 86400;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("mo")) return val * 30 * 86400;
  if (unit.startsWith("d")) return val * 86400;
  if (unit.startsWith("h")) return val * 3600;
  if (unit.startsWith("m")) return val * 60;
  if (unit.startsWith("s")) return val;
  return 86400;
}

function formatDurationDisplay(input: string): string {
  const secs = parseDuration(input);
  if (secs >= 30 * 86400) return `${Math.round(secs / (30 * 86400))} month(s)`;
  if (secs >= 86400) return `${Math.round(secs / 86400)} day(s)`;
  if (secs >= 3600) return `${Math.round(secs / 3600)} hour(s)`;
  if (secs >= 60) return `${Math.round(secs / 60)} minute(s)`;
  return `${secs} second(s)`;
}

function hexToDecimal(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

export default function DashboardGiveaways() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id).eq("module_name", "giveaways").maybeSingle().then(({ data }) => {
      if (data?.config) {
        const c = data.config as { giveaways?: Giveaway[] };
        setGiveaways(c.giveaways || []);
        setEnabled(data.enabled);
      }
    });
  }, [selectedBot?.id]);

  const addGiveaway = () => {
    setGiveaways((p) => [...p, {
      id: createId(), prize: "", channelId: "", duration: "1d", winners: 1,
      roleRequirement: "", bypassRole: "", requiredMessages: 0,
      color: "#FFD700", endColor: "#FF4444", active: true,
    }]);
  };

  const updateGiveaway = (id: string, updates: Partial<Giveaway>) => setGiveaways((p) => p.map((g) => (g.id === id ? { ...g, ...updates } : g)));
  const deleteGiveaway = (id: string) => setGiveaways((p) => p.filter((g) => g.id !== id));

  const save = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      const config = { giveaways } as unknown as Json;
      const { data: existing } = await supabase.from("bot_modules").select("id").eq("bot_id", selectedBot.id).eq("module_name", "giveaways").maybeSingle();
      if (existing) {
        await supabase.from("bot_modules").update({ enabled, config }).eq("id", existing.id);
      } else {
        await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: "giveaways", enabled, config });
      }
      toast.success("Giveaway config saved!");
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
            <Gift className="w-6 h-6 text-primary" /> Giveaways
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage server giveaways with buttons, role requirements, and more</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setEnabled(!enabled)} className={cn("w-12 h-6 rounded-full transition-colors relative", enabled ? "bg-primary" : "bg-secondary")}>
            <div className={cn("w-5 h-5 rounded-full bg-background absolute top-0.5 transition-transform", enabled ? "translate-x-6" : "translate-x-0.5")} />
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </motion.div>

      {/* How it works */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">How Giveaways Work</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Users click a <strong className="text-primary">🎉 Enter Giveaway</strong> button (no reactions needed)</li>
          <li>You can require a specific role or minimum message count to enter</li>
          <li>Set a bypass role that skips all requirements</li>
          <li>Winner names are shown when the giveaway ends</li>
          <li>Duration supports: <code className="text-primary font-mono">1s</code> <code className="text-primary font-mono">30m</code> <code className="text-primary font-mono">1h</code> <code className="text-primary font-mono">7d</code> <code className="text-primary font-mono">1mo</code></li>
        </ul>
      </motion.div>

      {/* Commands */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Giveaway Commands</h3>
        <div className="flex flex-wrap gap-2">
          {["/giveaway start", "/giveaway end", "/giveaway reroll", "/giveaway list"].map((cmd) => (
            <span key={cmd} className="px-3 py-1.5 rounded-md bg-background border border-border text-sm font-mono text-primary">{cmd}</span>
          ))}
        </div>
      </motion.div>

      <div className="space-y-4 mt-6">
        {giveaways.map((g, i) => (
          <motion.div key={g.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-card-foreground flex items-center gap-2">
                <Gift className="w-4 h-4 text-primary" /> Giveaway Template #{i + 1}
              </span>
              <button onClick={() => deleteGiveaway(g.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              {/* Prize */}
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">🎁 Prize</label>
                <input type="text" value={g.prize} onChange={(e) => updateGiveaway(g.id, { prize: e.target.value })} placeholder="Nitro, Steam Key, etc." className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>

              {/* Channel, Duration, Winners */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">📢 Channel ID</label>
                  <input type="text" value={g.channelId} onChange={(e) => updateGiveaway(g.id, { channelId: e.target.value })} placeholder="Channel to post in" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><Clock className="w-3 h-3" /> Duration</label>
                  <input type="text" value={g.duration} onChange={(e) => updateGiveaway(g.id, { duration: e.target.value })} placeholder="1d, 30m, 1mo" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">= {formatDurationDisplay(g.duration)}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><Users className="w-3 h-3" /> Winners</label>
                  <input type="number" value={g.winners} onChange={(e) => updateGiveaway(g.id, { winners: parseInt(e.target.value) || 1 })} min={1} max={20} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><Palette className="w-3 h-3" /> Embed Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={g.color} onChange={(e) => updateGiveaway(g.id, { color: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
                    <input type="text" value={g.color} onChange={(e) => updateGiveaway(g.id, { color: e.target.value })} className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Color while giveaway is running</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><Palette className="w-3 h-3" /> End Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={g.endColor} onChange={(e) => updateGiveaway(g.id, { endColor: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
                    <input type="text" value={g.endColor} onChange={(e) => updateGiveaway(g.id, { endColor: e.target.value })} className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Color after giveaway ends</p>
                </div>
              </div>

              {/* Role Requirements */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><Shield className="w-3 h-3" /> Required Role ID</label>
                  <input type="text" value={g.roleRequirement} onChange={(e) => updateGiveaway(g.id, { roleRequirement: e.target.value })} placeholder="Only this role can enter" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">Leave empty = anyone can enter</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Bypass Role ID</label>
                  <input type="text" value={g.bypassRole} onChange={(e) => updateGiveaway(g.id, { bypassRole: e.target.value })} placeholder="Skips all requirements" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">This role bypasses role + message requirements</p>
                </div>
              </div>

              {/* Message Requirement */}
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Required Messages</label>
                <input type="number" value={g.requiredMessages} onChange={(e) => updateGiveaway(g.id, { requiredMessages: parseInt(e.target.value) || 0 })} min={0} className="w-32 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <p className="text-[10px] text-muted-foreground mt-1">Minimum total messages sent in server to enter (0 = no requirement)</p>
              </div>
            </div>

            {/* Preview */}
            <div className="mt-4 rounded-md bg-[#2b2d31] border border-[#1e1f22] p-4">
              <p className="text-[10px] uppercase tracking-wider text-[#b5bac1] mb-2">Discord Preview</p>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-xs font-bold shrink-0">BOT</div>
                <div className="flex-1">
                  <div className="rounded-md overflow-hidden" style={{ borderLeft: `4px solid ${g.color}` }}>
                    <div className="bg-[#2f3136] p-3">
                      <p className="text-sm font-semibold text-white">🎉 GIVEAWAY 🎉</p>
                      <p className="text-xs text-[#dcddde] mt-1">
                        <strong>{g.prize || "Prize"}</strong>
                      </p>
                      <p className="text-xs text-[#b5bac1] mt-1">
                        Click the button below to enter!
                      </p>
                      <p className="text-xs text-[#b5bac1] mt-1">
                        🏆 {g.winners} winner{g.winners > 1 ? "s" : ""} • ⏰ Ends in {formatDurationDisplay(g.duration)}
                      </p>
                      {g.roleRequirement && <p className="text-xs text-[#b5bac1] mt-1">🔒 Requires role: &lt;@&amp;{g.roleRequirement}&gt;</p>}
                      {g.requiredMessages > 0 && <p className="text-xs text-[#b5bac1] mt-1">💬 Min {g.requiredMessages} messages required</p>}
                    </div>
                  </div>
                  <div className="mt-2">
                    <button className="px-4 py-1.5 rounded bg-[#248046] text-white text-xs font-medium">🎉 Enter Giveaway</button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        <button onClick={addGiveaway} className="w-full py-3 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Giveaway Template
        </button>
      </div>
    </div>
  );
}
