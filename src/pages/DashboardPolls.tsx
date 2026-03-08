import { motion } from "framer-motion";
import { BarChart3, Vote, Plus, Trash2, Save, Loader2, Clock, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";
import { DiscordEntityPicker } from "@/components/DiscordEntityPicker";

interface PollTemplate {
  id: string;
  question: string;
  options: string[];
  duration: string;
  multipleChoice: boolean;
  anonymous: boolean;
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

export default function DashboardPolls() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [polls, setPolls] = useState<PollTemplate[]>([]);
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id).eq("module_name", "polls").maybeSingle().then(({ data }) => {
      if (data?.config) {
        const c = data.config as { polls?: PollTemplate[]; allowedRoles?: string[] };
        setPolls(c.polls || []);
        setAllowedRoles(c.allowedRoles || []);
        setEnabled(data.enabled);
      }
    });
  }, [selectedBot?.id]);

  const addPoll = () => setPolls((p) => [...p, { id: createId(), question: "", options: ["Option 1", "Option 2"], duration: "1d", multipleChoice: false, anonymous: false }]);
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
      const config = { polls, allowedRoles } as unknown as Json;
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
          <p className="text-sm text-muted-foreground mt-1">Create polls and surveys for your server with button voting</p>
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
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">How Polls Work</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Users click <strong className="text-primary">buttons</strong> to vote (no reactions)</li>
          <li>When the poll ends, a <strong className="text-primary">results message</strong> shows vote counts and percentages</li>
          <li>Duration supports: <code className="text-primary font-mono">1m</code> <code className="text-primary font-mono">1h</code> <code className="text-primary font-mono">1d</code> <code className="text-primary font-mono">1mo</code></li>
          <li>Restrict who can create polls with <strong className="text-primary">allowed roles</strong></li>
        </ul>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-lg border border-border bg-card p-4">
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

              {/* Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1"><Clock className="w-3 h-3" /> Duration</label>
                  <input type="text" value={poll.duration} onChange={(e) => updatePoll(poll.id, { duration: e.target.value })} placeholder="1d, 30m, 1mo" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-1">= {formatDurationDisplay(poll.duration)}</p>
                </div>
                <div className="flex items-end gap-4 pb-5">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={poll.multipleChoice} onChange={(e) => updatePoll(poll.id, { multipleChoice: e.target.checked })} className="accent-primary" /> Multiple choice
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={poll.anonymous} onChange={(e) => updatePoll(poll.id, { anonymous: e.target.checked })} className="accent-primary" /> Anonymous
                  </label>
                </div>
              </div>

              {/* Options */}
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

              {/* Allowed Roles */}
              <div>
                <DiscordEntityPicker
                  type="role"
                  value=""
                  onChange={() => {}}
                  multiple
                  values={poll.allowedRoles || []}
                  onChangeMultiple={(v) => updatePoll(poll.id, { allowedRoles: v })}
                  label="🔒 Allowed Roles (who can use /poll)"
                  placeholder="Leave empty = everyone"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Restrict who can create polls with this command. Empty = anyone.</p>
              </div>
            </div>

            {/* Discord Preview */}
            <div className="mt-4 rounded-md bg-[#2b2d31] border border-[#1e1f22] p-4">
              <p className="text-[10px] uppercase tracking-wider text-[#b5bac1] mb-2">Discord Preview</p>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-xs font-bold shrink-0">BOT</div>
                <div className="flex-1">
                  <div className="rounded-md overflow-hidden" style={{ borderLeft: "4px solid #5865f2" }}>
                    <div className="bg-[#2f3136] p-3">
                      <p className="text-sm font-semibold text-white">📊 {poll.question || "Your question here"}</p>
                      <p className="text-xs text-[#b5bac1] mt-1">Click a button to vote! • Ends in {formatDurationDisplay(poll.duration)}</p>
                      {poll.multipleChoice && <p className="text-xs text-[#b5bac1] mt-0.5">✅ Multiple choices allowed</p>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {poll.options.map((opt, j) => (
                      <button key={j} className="px-3 py-1.5 rounded bg-[#4f545c] text-white text-xs font-medium hover:bg-[#5d6269] transition-colors">
                        {emojis[j]} {opt}
                      </button>
                    ))}
                  </div>
                </div>
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
