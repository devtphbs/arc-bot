import { motion } from "framer-motion";
import { Plus, Search, Slash, MessageSquare, MousePointerClick, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Command = Tables<"commands">;

const typeIcon = { slash: Slash, prefix: MessageSquare, context: MousePointerClick };
const typeLabel = { slash: "Slash", prefix: "Prefix", context: "Context" };

export default function DashboardCommands() {
  const navigate = useNavigate();
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [commands, setCommands] = useState<Command[]>([]);
  const [search, setSearch] = useState("");

  const fetchCommands = async () => {
    if (!selectedBot) return;
    const { data } = await supabase.from("commands").select("*").eq("bot_id", selectedBot.id).order("created_at");
    if (data) setCommands(data);
  };

  useEffect(() => { fetchCommands(); }, [selectedBot]);

  const filtered = commands.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.description || "").toLowerCase().includes(search.toLowerCase()));

  const toggleCommand = async (cmd: Command) => {
    await supabase.from("commands").update({ enabled: !cmd.enabled }).eq("id", cmd.id);
    fetchCommands();
  };

  const deleteCommand = async (id: string) => {
    await supabase.from("commands").delete().eq("id", id);
    toast.success("Command deleted");
    fetchCommands();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Commands</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Create and manage your bot commands</p>
        </div>
        <button onClick={() => navigate("/dashboard/command-builder")} disabled={!selectedBot} className="flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50 w-full sm:w-auto">
          <Plus className="w-4 h-4" /> New Command
        </button>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select or add a bot first.</p>
      ) : (
        <>
          <div className="mt-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search commands..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
          </div>

          <div className="mt-4 space-y-2">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No commands yet. Create your first command!</p>}
            {filtered.map((cmd, i) => {
              const TypeIcon = typeIcon[cmd.type];
              return (
                <motion.div key={cmd.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-3 sm:gap-4 cursor-pointer min-w-0 flex-1" onClick={() => navigate(`/dashboard/command-builder?edit=${cmd.id}`)}>
                    <div className="p-2 rounded-md bg-primary/10 shrink-0"><TypeIcon className="w-4 h-4 text-primary" /></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-card-foreground truncate">{cmd.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground uppercase tracking-wider shrink-0">{typeLabel[cmd.type]}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{cmd.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 ml-auto sm:ml-0 shrink-0">
                    <span className="text-xs text-muted-foreground font-mono">{cmd.uses} uses</span>
                    <button onClick={() => toggleCommand(cmd)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {cmd.enabled ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                    <button onClick={() => deleteCommand(cmd.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
