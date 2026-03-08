import { motion } from "framer-motion";
import { Gift, Plus, Trash2, Save, Loader2, Clock, Users, Trophy } from "lucide-react";
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
  duration: number;
  winners: number;
  roleRequirement: string;
  active: boolean;
}

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    setGiveaways((p) => [...p, { id: createId(), prize: "", channelId: "", duration: 86400, winners: 1, roleRequirement: "", active: true }]);
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

  const formatDuration = (seconds: number) => {
    if (seconds >= 86400) return `${Math.round(seconds / 86400)}d`;
    if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 60)}m`;
  };

  if (!selectedBot) return <div className="p-6"><p className="text-muted-foreground">Select a bot first.</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Gift className="w-6 h-6 text-primary" /> Giveaways
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage server giveaways</p>
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

      {/* Commands preview */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-border bg-card p-4">
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
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Prize</label>
                <input type="text" value={g.prize} onChange={(e) => updateGiveaway(g.id, { prize: e.target.value })} placeholder="Nitro, Steam Key, etc." className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Channel ID</label>
                  <input type="text" value={g.channelId} onChange={(e) => updateGiveaway(g.id, { channelId: e.target.value })} placeholder="Channel" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><Clock className="w-3 h-3" /> Duration (sec)</label>
                  <input type="number" value={g.duration} onChange={(e) => updateGiveaway(g.id, { duration: parseInt(e.target.value) || 86400 })} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDuration(g.duration)}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><Users className="w-3 h-3" /> Winners</label>
                  <input type="number" value={g.winners} onChange={(e) => updateGiveaway(g.id, { winners: parseInt(e.target.value) || 1 })} min={1} max={20} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Required Role ID (optional)</label>
                <input type="text" value={g.roleRequirement} onChange={(e) => updateGiveaway(g.id, { roleRequirement: e.target.value })} placeholder="Only members with this role can enter" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>

            {/* Mini preview */}
            <div className="mt-4 rounded-md bg-background border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preview</p>
              <div className="flex items-start gap-2">
                <span className="text-lg">🎉</span>
                <div>
                  <p className="text-sm font-semibold text-primary">{g.prize || "Prize"}</p>
                  <p className="text-xs text-muted-foreground">React with 🎉 to enter! • {g.winners} winner{g.winners > 1 ? "s" : ""} • Ends in {formatDuration(g.duration)}</p>
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
