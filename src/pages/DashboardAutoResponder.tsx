import { motion } from "framer-motion";
import { MessageSquare, Plus, Trash2, Save, Loader2, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";

interface AutoResponse {
  id: string;
  trigger: string;
  response: string;
  matchType: "contains" | "exact" | "startsWith" | "regex";
  ignoreCase: boolean;
  deleteOriginal: boolean;
  channels: string;
}

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function DashboardAutoResponder() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [responses, setResponses] = useState<AutoResponse[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id).eq("module_name", "auto_responder").maybeSingle().then(({ data }) => {
      if (data?.config) {
        const c = data.config as { responses?: AutoResponse[] };
        setResponses(c.responses || []);
        setEnabled(data.enabled);
      }
    });
  }, [selectedBot?.id]);

  const addResponse = () => {
    setResponses((p) => [...p, { id: createId(), trigger: "", response: "", matchType: "contains", ignoreCase: true, deleteOriginal: false, channels: "" }]);
  };

  const updateResponse = (id: string, updates: Partial<AutoResponse>) => {
    setResponses((p) => p.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const deleteResponse = (id: string) => setResponses((p) => p.filter((r) => r.id !== id));

  const save = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      const config = { responses } as unknown as Json;
      const { data: existing } = await supabase.from("bot_modules").select("id").eq("bot_id", selectedBot.id).eq("module_name", "auto_responder").maybeSingle();
      if (existing) {
        await supabase.from("bot_modules").update({ enabled, config }).eq("id", existing.id);
      } else {
        await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: "auto_responder", enabled, config });
      }
      toast.success("Auto-responder saved!");
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
            <MessageSquare className="w-6 h-6 text-primary" /> Auto Responder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Automatically respond to messages matching triggers</p>
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
        {responses.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /><span className="text-sm font-medium text-card-foreground">Trigger #{i + 1}</span></div>
              <button onClick={() => deleteResponse(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_150px] gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Trigger Text</label>
                  <input type="text" value={r.trigger} onChange={(e) => updateResponse(r.id, { trigger: e.target.value })} placeholder="hello" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Match Type</label>
                  <select value={r.matchType} onChange={(e) => updateResponse(r.id, { matchType: e.target.value as any })} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="contains">Contains</option>
                    <option value="exact">Exact</option>
                    <option value="startsWith">Starts With</option>
                    <option value="regex">Regex</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Response</label>
                <textarea value={r.response} onChange={(e) => updateResponse(r.id, { response: e.target.value })} rows={2} placeholder="Hey there! 👋" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                <p className="text-[10px] text-muted-foreground mt-1">Variables: <code className="font-mono text-primary">{'{user}'}</code> <code className="font-mono text-primary">{'{server}'}</code> <code className="font-mono text-primary">{'{channel}'}</code></p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={r.ignoreCase} onChange={(e) => updateResponse(r.id, { ignoreCase: e.target.checked })} className="accent-primary" /> Ignore case
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={r.deleteOriginal} onChange={(e) => updateResponse(r.id, { deleteOriginal: e.target.checked })} className="accent-primary" /> Delete original
                </label>
              </div>
            </div>
          </motion.div>
        ))}

        <button onClick={addResponse} className="w-full py-3 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Trigger
        </button>
      </div>
    </div>
  );
}
