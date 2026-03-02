import { motion } from "framer-motion";
import { Plus, Clock, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Automation = Tables<"automations">;

export default function DashboardAutomations() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [items, setItems] = useState<Automation[]>([]);
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [loading, setLoading] = useState(false);

  const timedItems = useMemo(
    () => items.filter((item) => item.trigger_type === "schedule"),
    [items],
  );

  const fetchTimedAutomations = async () => {
    if (!selectedBot) {
      setItems([]);
      return;
    }

    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("bot_id", selectedBot.id)
      .eq("trigger_type", "schedule")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      return;
    }

    setItems(data || []);
  };

  useEffect(() => {
    fetchTimedAutomations();
  }, [selectedBot?.id]);

  const createTimedEvent = async () => {
    if (!selectedBot || !user || !name.trim() || !cron.trim()) return;
    setLoading(true);

    const { error } = await supabase.from("automations").insert({
      bot_id: selectedBot.id,
      user_id: user.id,
      name: name.trim(),
      trigger_type: "schedule",
      trigger_config: {
        source: "manual_timed_event",
        cron: cron.trim(),
        timezone: "UTC",
      },
      actions: {
        action: "send_message",
        message: "Timed event executed",
      },
      active: true,
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Timed event created");
    setName("");
    fetchTimedAutomations();
  };

  const toggleActive = async (automation: Automation) => {
    const { error } = await supabase
      .from("automations")
      .update({ active: !automation.active })
      .eq("id", automation.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === automation.id ? { ...item, active: !item.active } : item,
      ),
    );
  };

  const deleteAutomation = async (id: string) => {
    const { error } = await supabase.from("automations").delete().eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
    toast.success("Timed event removed");
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and run timed events with real backend persistence</p>
        </div>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select a bot first.</p>
      ) : (
        <>
          <div className="mt-6 rounded-lg border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Timed Event Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Daily welcome reminder"
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Cron</label>
              <input
                type="text"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 9 * * *"
                className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              onClick={createTimedEvent}
              disabled={loading || !name.trim() || !cron.trim()}
              className="h-10 px-4 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>

          <div className="space-y-3 mt-6">
            {timedItems.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No timed events yet. Create one above.</p>
            )}

            {timedItems.map((auto, i) => (
              <motion.div
                key={auto.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-card"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-card-foreground truncate">{auto.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {(auto.trigger_config as { cron?: string } | null)?.cron || "No cron set"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleActive(auto)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Toggle automation"
                  >
                    {auto.active ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={() => deleteAutomation(auto.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Delete automation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
