import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { UserPlus, UserMinus, MessageSquare, Heart, Bell, ToggleLeft, ToggleRight, CalendarClock } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

const events = [
  { id: "welcome", name: "Welcome Message", description: "Send a message when a user joins", icon: UserPlus },
  { id: "leave", name: "Leave Message", description: "Send a message when a user leaves", icon: UserMinus },
  { id: "autoreply", name: "Auto Responses", description: "Automatically reply to keywords", icon: MessageSquare },
  { id: "reactionroles", name: "Reaction Roles", description: "Assign roles via reactions", icon: Heart },
  { id: "notifications", name: "Notifications", description: "Send alerts for specific events", icon: Bell },
];

type EventAutomation = Tables<"automations">;

export default function DashboardEvents() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [hookEvents, setHookEvents] = useState<EventAutomation[]>([]);

  const fetchData = async () => {
    if (!selectedBot) {
      setModules({});
      setHookEvents([]);
      return;
    }

    const [modulesResult, hooksResult] = await Promise.all([
      supabase.from("bot_modules").select("module_name, enabled").eq("bot_id", selectedBot.id),
      supabase
        .from("automations")
        .select("*")
        .eq("bot_id", selectedBot.id)
        .eq("trigger_type", "event")
        .filter("trigger_config->>source", "eq", "command_builder_event")
        .order("created_at", { ascending: false }),
    ]);

    if (modulesResult.error) toast.error(modulesResult.error.message);
    if (hooksResult.error) toast.error(hooksResult.error.message);

    const moduleMap: Record<string, boolean> = {};
    modulesResult.data?.forEach((item) => {
      moduleMap[item.module_name] = item.enabled;
    });

    setModules(moduleMap);
    setHookEvents(hooksResult.data || []);
  };

  useEffect(() => {
    fetchData();
  }, [selectedBot?.id]);

  const toggleModule = async (moduleName: string) => {
    if (!selectedBot || !user) return;

    const current = modules[moduleName] || false;
    const { data: existing } = await supabase
      .from("bot_modules")
      .select("id")
      .eq("bot_id", selectedBot.id)
      .eq("module_name", moduleName)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("bot_modules").update({ enabled: !current }).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("bot_modules").insert({
        bot_id: selectedBot.id,
        user_id: user.id,
        module_name: moduleName,
        enabled: true,
      });
      if (error) return toast.error(error.message);
    }

    setModules((prev) => ({ ...prev, [moduleName]: !current }));
  };

  const toggleHook = async (hook: EventAutomation) => {
    const { error } = await supabase
      .from("automations")
      .update({ active: !hook.active })
      .eq("id", hook.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setHookEvents((prev) =>
      prev.map((item) => (item.id === hook.id ? { ...item, active: !item.active } : item)),
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Events</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage core event modules and command event hooks</p>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select a bot first.</p>
      ) : (
        <>
          <div className="space-y-3 mt-6">
            {events.map((evt, i) => {
              const enabled = modules[evt.id] || false;
              return (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-lg border bg-card transition-colors",
                    enabled ? "border-primary/20" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-md", enabled ? "bg-primary/10" : "bg-secondary")}>
                      <evt.icon className={cn("w-4 h-4", enabled ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-card-foreground">{evt.name}</h3>
                      <p className="text-xs text-muted-foreground">{evt.description}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleModule(evt.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Toggle event module"
                  >
                    {enabled ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-medium text-foreground mb-3">Command Event Hooks</h2>
            <div className="space-y-3">
              {hookEvents.length === 0 && (
                <p className="text-xs text-muted-foreground">No command hooks yet. Add them in Command Builder → Events tab.</p>
              )}

              {hookEvents.map((hook) => (
                <div key={hook.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-md bg-primary/10">
                      <CalendarClock className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">{hook.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {(hook.trigger_config as { event?: string } | null)?.event || "event"}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleHook(hook)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Toggle command hook"
                  >
                    {hook.active ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
