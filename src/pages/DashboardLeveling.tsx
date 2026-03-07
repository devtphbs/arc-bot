import { motion } from "framer-motion";
import { Trophy, Star, Gift, Loader2, Plus, Trash2 } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";

interface RoleReward {
  level: number;
  role_id: string;
  role_name: string;
}

export default function DashboardLeveling() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [xpPerMessage, setXpPerMessage] = useState(15);
  const [xpCooldown, setXpCooldown] = useState(60);
  const [levelUpMessage, setLevelUpMessage] = useState("Congratulations {user}, you reached level {level}!");
  const [roleRewards, setRoleRewards] = useState<RoleReward[]>([]);
  const [newLevel, setNewLevel] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleId, setNewRoleId] = useState("");

  useEffect(() => {
    if (!selectedBot) return;
    setLoading(true);
    supabase
      .from("leveling_config")
      .select("*")
      .eq("bot_id", selectedBot.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEnabled(data.enabled);
          setXpPerMessage(data.xp_per_message);
          setXpCooldown(data.xp_cooldown);
          setLevelUpMessage(data.level_up_message || "");
          setRoleRewards((data.role_rewards as unknown as RoleReward[]) || []);
        }
        setLoading(false);
      });
  }, [selectedBot]);

  const save = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      const payload = {
        bot_id: selectedBot.id,
        user_id: user.id,
        enabled,
        xp_per_message: xpPerMessage,
        xp_cooldown: xpCooldown,
        level_up_message: levelUpMessage,
        role_rewards: roleRewards as any,
      };
      const { data: existing } = await supabase.from("leveling_config").select("id").eq("bot_id", selectedBot.id).maybeSingle();
      if (existing) {
        await supabase.from("leveling_config").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("leveling_config").insert(payload);
      }
      toast.success("Leveling config saved!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addReward = () => {
    if (!newLevel || !newRoleName) return;
    setRoleRewards([...roleRewards, { level: parseInt(newLevel), role_id: newRoleId || newRoleName, role_name: newRoleName }]);
    setNewLevel("");
    setNewRoleName("");
    setNewRoleId("");
  };

  const removeReward = (i: number) => setRoleRewards(roleRewards.filter((_, idx) => idx !== i));

  const xpForLevel = (lvl: number) => 5 * lvl * lvl + 50 * lvl + 100;

  if (!selectedBot) return <div className="p-6"><p className="text-muted-foreground">Select a bot first.</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Trophy className="w-6 h-6 text-primary" /> Leveling & XP</h1>
        <p className="text-sm text-muted-foreground mt-1">Reward active members with XP and automatic role upgrades</p>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6 mt-8">
          {/* Enable Toggle */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-card-foreground">Enable Leveling System</h2>
                <p className="text-xs text-muted-foreground mt-1">Members earn XP for sending messages</p>
              </div>
              <button onClick={() => setEnabled(!enabled)} className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? "bg-primary" : "bg-secondary"}`}>
                <div className={`w-5 h-5 rounded-full bg-background absolute top-0.5 transition-transform ${enabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
          </motion.div>

          {/* XP Settings */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4"><Star className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">XP Settings</h2></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">XP Per Message</label>
                <input type="number" value={xpPerMessage} onChange={(e) => setXpPerMessage(parseInt(e.target.value) || 0)} min={1} max={100} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Cooldown (seconds)</label>
                <input type="number" value={xpCooldown} onChange={(e) => setXpCooldown(parseInt(e.target.value) || 0)} min={0} max={600} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Level Up Message</label>
              <input type="text" value={levelUpMessage} onChange={(e) => setLevelUpMessage(e.target.value)} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              <p className="text-[10px] text-muted-foreground mt-1.5">Variables: <code className="font-mono text-primary">{'{user}'}</code> <code className="font-mono text-primary">{'{level}'}</code> <code className="font-mono text-primary">{'{xp}'}</code></p>
            </div>

            {/* XP Table Preview */}
            <div className="mt-4 p-3 rounded-md bg-background border border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Level Progression Preview</p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 5, 10, 20, 50].map((lvl) => (
                  <div key={lvl} className="text-center">
                    <p className="text-xs font-medium text-primary">Lvl {lvl}</p>
                    <p className="text-[10px] text-muted-foreground">{xpForLevel(lvl).toLocaleString()} XP</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Role Rewards */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4"><Gift className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Role Rewards</h2></div>
            <p className="text-xs text-muted-foreground mb-3">Automatically assign roles when members reach certain levels</p>

            {roleRewards.sort((a, b) => a.level - b.level).map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-md bg-background border border-border mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-primary">Level {r.level}</span>
                  <span className="text-sm text-card-foreground">→ @{r.role_name}</span>
                </div>
                <button onClick={() => removeReward(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}

            <div className="flex items-end gap-2 mt-3">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Level</label>
                <input type="number" value={newLevel} onChange={(e) => setNewLevel(e.target.value)} placeholder="5" className="w-20 px-2 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground block mb-1">Role Name</label>
                <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Member+" className="w-full px-2 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground block mb-1">Role ID (optional)</label>
                <input type="text" value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)} placeholder="123456789" className="w-full px-2 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <button onClick={addReward} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"><Plus className="w-4 h-4" /></button>
            </div>
          </motion.div>

          <button onClick={save} disabled={saving} className="w-full py-3 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Leveling Config"}
          </button>
        </div>
      )}
    </div>
  );
}
