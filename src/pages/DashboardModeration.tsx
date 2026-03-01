import { motion } from "framer-motion";
import { Shield, AlertTriangle, Ban, Clock, MessageSquareOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

const defaultModules = [
  { module_name: "automod", label: "Auto Moderation", description: "Automatically filter spam, links, and bad words", icon: Shield },
  { module_name: "wordfilter", label: "Word Filter", description: "Block specific words and phrases", icon: MessageSquareOff },
  { module_name: "antispam", label: "Anti-Spam", description: "Detect and prevent message spam", icon: AlertTriangle },
  { module_name: "raidprotect", label: "Raid Protection", description: "Protect against mass join raids", icon: Ban },
  { module_name: "slowmode", label: "Smart Slowmode", description: "Auto-adjust slowmode based on activity", icon: Clock },
];

export default function DashboardModeration() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [modules, setModules] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id).then(({ data }) => {
      const map: Record<string, boolean> = {};
      data?.forEach((m) => { map[m.module_name] = m.enabled; });
      setModules(map);
    });
  }, [selectedBot]);

  const toggle = async (moduleName: string) => {
    if (!selectedBot || !user) return;
    const current = modules[moduleName] || false;
    const { data: existing } = await supabase.from("bot_modules").select("id").eq("bot_id", selectedBot.id).eq("module_name", moduleName).maybeSingle();
    if (existing) {
      await supabase.from("bot_modules").update({ enabled: !current }).eq("id", existing.id);
    } else {
      await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: moduleName, enabled: true });
    }
    setModules((p) => ({ ...p, [moduleName]: !current }));
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Moderation</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure auto-moderation and safety features</p>
      </motion.div>
      {!selectedBot ? <p className="text-muted-foreground mt-8">Select a bot first.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {defaultModules.map((mod, i) => {
            const enabled = modules[mod.module_name] || false;
            return (
              <motion.div key={mod.module_name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cn("rounded-lg border p-5 transition-colors cursor-pointer", enabled ? "border-primary/30 bg-card hover:border-primary/50" : "border-border bg-card hover:border-border/80")} onClick={() => toggle(mod.module_name)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={cn("p-2 rounded-md", enabled ? "bg-primary/10" : "bg-secondary")}><mod.icon className={cn("w-5 h-5", enabled ? "text-primary" : "text-muted-foreground")} /></div>
                    <div><h3 className="text-sm font-medium text-card-foreground">{mod.label}</h3><p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p></div>
                  </div>
                  <div className={cn("w-9 h-5 rounded-full flex items-center transition-colors px-0.5", enabled ? "bg-primary justify-end" : "bg-secondary justify-start")}><div className="w-4 h-4 rounded-full bg-foreground/90" /></div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
