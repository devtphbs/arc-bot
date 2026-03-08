import { motion } from "framer-motion";
import { BarChart3, Vote, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";

interface PollTemplate {
  id: string;
  question: string;
  options: string[];
  duration: number;
  multipleChoice: boolean;
  anonymous: boolean;
}

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function DashboardPolls() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [polls, setPolls] = useState<PollTemplate[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id).eq("module_name", "polls").maybeSingle().then(({ data }) => {
      if (data?.config) {
        const c = data.config as { polls?: PollTemplate[] };
        setPolls(c.polls || []);
        setEnabled(data.enabled);
      }
    });
  }, [selectedBot?.id]);

  const addPoll = () => setPolls((p) => [...p, { id: createId(), question: "", options: ["Option 1", "Option 2"], duration: 3600, multipleChoice: false, anonymous: false }]);
  const updatePoll = (id: string, updates: Partial<PollTemplate>) => setPolls((p) => p.map((pl) => (pl.id === id ? { ...pl, ...updates } : pl)));
  const deletePoll = (id: string) => setPolls((p) => p.filter((pl) => pl.id !== id));
  const addOption = (id: string) => setPolls((p) => p.map((pl) => (pl.id === id ? { ...pl, options: [...pl.options, `Option ${pl.options.length + 1}`] } : pl)));
  const updateOption = (pollId: string, i: number, value: string) => setPolls((p) => p.map((pl) => {
    if (pl.id !== pollId) return pl;
    const opts = [...pl.options]; opts[i] = value;
    return { ...pl, options: opts };
  }));
  const removeOption = (pollId: string, i: number) => setPolls((p) => p.map((pl) => {
    if (pl.id !== pollId) return pl;
    return { ...pl, options: pl.options.filter((_, idx) => idx !== i) };
  }));

  const save = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      const config = { polls } as unknown as Json;
      const { data: existing } = await supabase.from("bot_modules").select("id").eq("bot_id", selectedBot.id).eq("module_name", "polls").maybeSingle();
      if (existing) {
        await supabase.from("bot_modules").update({ enabled, config }).eq("id", existing.id);
      } else {
        await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: "polls", enabled, config });
      }
      toast.success("Poll config saved!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!selectedBot) return <div className="p-6"><p className="text-muted-foreground">Select a bot first.</p></div>;

  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Vote className="w-6 h-6 text-primary" /> Polls
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create polls and surveys for your server</p>
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

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Poll Commands</h3>
        <div className="flex flex-wrap gap-2">
          {["/poll create", "/poll end", "/poll results"].map((cmd) => (
            <span key={cmd} className="px-3 py-1.5 rounded-md bg-background border border-border text-sm font-mono text-primary">{cmd}</span>
          ))}
        </div>
      </motion.div>

      <div className="space-y-4 mt-6">
        {polls.map((poll, i) => (
          <motion.div key={poll.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-card-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> Poll Template #{i + 1}
              </span>
              <button onClick={() => deletePoll(poll.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Question</label>
                <input type="text" value={poll.question} onChange={(e) => updatePoll(poll.id, { question: e.target.value })} placeholder="What should we play tonight?" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Options</label>
                  {poll.options.length < 10 && <button onClick={() => addOption(poll.id)} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>}
                </div>
                <div className="space-y-2">
                  {poll.options.map((opt, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <span className="text-sm">{emojis[j]}</span>
                      <input type="text" value={opt} onChange={(e) => updateOption(poll.id, j, e.target.value)} className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      {poll.options.length > 2 && <button onClick={() => removeOption(poll.id, j)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={poll.multipleChoice} onChange={(e) => updatePoll(poll.id, { multipleChoice: e.target.checked })} className="accent-primary" /> Multiple choice
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={poll.anonymous} onChange={(e) => updatePoll(poll.id, { anonymous: e.target.checked })} className="accent-primary" /> Anonymous
                </label>
              </div>
            </div>
          </motion.div>
        ))}

        <button onClick={addPoll} className="w-full py-3 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Poll Template
        </button>
      </div>
    </div>
  );
}
