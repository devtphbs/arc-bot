import { motion } from "framer-motion";
import { Variable, Plus, Trash2, Save, Loader2, Code } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface CustomVariable {
  id: string;
  name: string;
  value: string;
  description: string;
}

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function DashboardVariables() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [variables, setVariables] = useState<CustomVariable[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id).eq("module_name", "custom_variables").maybeSingle().then(({ data }) => {
      if (data?.config) {
        const c = data.config as { variables?: CustomVariable[] };
        setVariables(c.variables || []);
      }
    });
  }, [selectedBot?.id]);

  const addVariable = () => setVariables((p) => [...p, { id: createId(), name: "", value: "", description: "" }]);
  const updateVariable = (id: string, updates: Partial<CustomVariable>) => setVariables((p) => p.map((v) => (v.id === id ? { ...v, ...updates } : v)));
  const deleteVariable = (id: string) => setVariables((p) => p.filter((v) => v.id !== id));

  const save = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      const config = { variables } as unknown as Json;
      const { data: existing } = await supabase.from("bot_modules").select("id").eq("bot_id", selectedBot.id).eq("module_name", "custom_variables").maybeSingle();
      if (existing) {
        await supabase.from("bot_modules").update({ enabled: true, config }).eq("id", existing.id);
      } else {
        await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: "custom_variables", enabled: true, config });
      }
      toast.success("Variables saved!");
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
            <Variable className="w-6 h-6 text-primary" /> Custom Variables
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Define reusable variables for commands and messages</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 glow-primary disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2"><Code className="w-4 h-4 text-primary" /><h3 className="text-xs font-medium text-card-foreground uppercase tracking-wider">Usage</h3></div>
        <p className="text-xs text-muted-foreground">Use <code className="font-mono text-primary">{'{$variable_name}'}</code> in your commands, welcome messages, embeds, and auto-responses. Variables are resolved at runtime.</p>
      </motion.div>

      {/* Built-in variables */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Built-in Variables</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { name: "{user}", desc: "Username" },
            { name: "{mention}", desc: "@mention" },
            { name: "{server}", desc: "Server name" },
            { name: "{channel}", desc: "Channel name" },
            { name: "{members}", desc: "Member count" },
            { name: "{guilds}", desc: "Server count" },
            { name: "{level}", desc: "User level" },
            { name: "{xp}", desc: "User XP" },
            { name: "{date}", desc: "Current date" },
          ].map((v) => (
            <div key={v.name} className="px-3 py-2 rounded-md bg-background border border-border">
              <span className="text-xs font-mono text-primary">{v.name}</span>
              <span className="text-[10px] text-muted-foreground ml-2">{v.desc}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Custom variables */}
      <div className="space-y-3 mt-6">
        {variables.map((v, i) => (
          <motion.div key={v.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">Custom Variable</span>
              <button onClick={() => deleteVariable(v.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Name</label>
                <input type="text" value={v.name} onChange={(e) => updateVariable(v.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} placeholder="my_variable" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                {v.name && <p className="text-[10px] text-primary font-mono mt-1">{`{$${v.name}}`}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Value</label>
                <input type="text" value={v.value} onChange={(e) => updateVariable(v.id, { value: e.target.value })} placeholder="Variable value" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
          </motion.div>
        ))}

        <button onClick={addVariable} className="w-full py-3 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Variable
        </button>
      </div>
    </div>
  );
}
