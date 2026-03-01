import { motion } from "framer-motion";
import { Shield, AlertTriangle, Ban, Clock, MessageSquareOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const modules = [
  { id: "automod", name: "Auto Moderation", description: "Automatically filter spam, links, and bad words", icon: Shield, enabled: true },
  { id: "wordfilter", name: "Word Filter", description: "Block specific words and phrases", icon: MessageSquareOff, enabled: true },
  { id: "antispam", name: "Anti-Spam", description: "Detect and prevent message spam", icon: AlertTriangle, enabled: false },
  { id: "raidprotect", name: "Raid Protection", description: "Protect against mass join raids", icon: Ban, enabled: true },
  { id: "slowmode", name: "Smart Slowmode", description: "Auto-adjust slowmode based on activity", icon: Clock, enabled: false },
];

export default function DashboardModeration() {
  const [mods, setMods] = useState(modules);

  const toggle = (id: string) =>
    setMods((prev) => prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Moderation</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure auto-moderation and safety features</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {mods.map((mod, i) => (
          <motion.div
            key={mod.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              "rounded-lg border p-5 transition-colors cursor-pointer",
              mod.enabled
                ? "border-primary/30 bg-card hover:border-primary/50"
                : "border-border bg-card hover:border-border/80"
            )}
            onClick={() => toggle(mod.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-md", mod.enabled ? "bg-primary/10" : "bg-secondary")}>
                  <mod.icon className={cn("w-5 h-5", mod.enabled ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-card-foreground">{mod.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                </div>
              </div>
              <div
                className={cn(
                  "w-9 h-5 rounded-full flex items-center transition-colors px-0.5",
                  mod.enabled ? "bg-primary justify-end" : "bg-secondary justify-start"
                )}
              >
                <div className="w-4 h-4 rounded-full bg-foreground/90 transition-all" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
