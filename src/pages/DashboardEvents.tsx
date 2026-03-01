import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { UserPlus, UserMinus, MessageSquare, Heart, Bell } from "lucide-react";

const events = [
  { id: "welcome", name: "Welcome Message", description: "Send a message when a user joins", icon: UserPlus, enabled: true },
  { id: "leave", name: "Leave Message", description: "Send a message when a user leaves", icon: UserMinus, enabled: true },
  { id: "autoreply", name: "Auto Responses", description: "Automatically reply to keywords", icon: MessageSquare, enabled: false },
  { id: "reactionroles", name: "Reaction Roles", description: "Assign roles via reactions", icon: Heart, enabled: true },
  { id: "notifications", name: "Notifications", description: "Send alerts for specific events", icon: Bell, enabled: false },
];

export default function DashboardEvents() {
  const [items, setItems] = useState(events);
  const toggle = (id: string) => setItems((prev) => prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)));

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Events</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure event-based bot actions</p>
      </motion.div>

      <div className="space-y-3 mt-6">
        {items.map((evt, i) => (
          <motion.div
            key={evt.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={cn(
              "flex items-center justify-between p-4 rounded-lg border bg-card transition-colors",
              evt.enabled ? "border-primary/20" : "border-border"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-md", evt.enabled ? "bg-primary/10" : "bg-secondary")}>
                <evt.icon className={cn("w-4 h-4", evt.enabled ? "text-primary" : "text-muted-foreground")} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-card-foreground">{evt.name}</h3>
                <p className="text-xs text-muted-foreground">{evt.description}</p>
              </div>
            </div>
            <button
              onClick={() => toggle(evt.id)}
              className={cn(
                "w-9 h-5 rounded-full flex items-center transition-colors px-0.5",
                evt.enabled ? "bg-primary justify-end" : "bg-secondary justify-start"
              )}
            >
              <div className="w-4 h-4 rounded-full bg-foreground/90 transition-all" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
