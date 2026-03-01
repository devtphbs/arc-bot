import { motion } from "framer-motion";
import { Plus, Clock, Repeat, Zap } from "lucide-react";

const automations = [
  { id: "1", name: "Daily Announcement", trigger: "Schedule", interval: "Every day at 9:00 AM", active: true },
  { id: "2", name: "Role Assignment", trigger: "On Join", interval: "When user joins server", active: true },
  { id: "3", name: "Inactive Cleanup", trigger: "Schedule", interval: "Every Sunday at midnight", active: false },
];

export default function DashboardAutomations() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">Set up automated workflows and scheduled tasks</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary">
          <Plus className="w-4 h-4" />
          New Automation
        </button>
      </motion.div>

      <div className="space-y-3 mt-6">
        {automations.map((auto, i) => (
          <motion.div
            key={auto.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center justify-between p-4 rounded-lg border border-border bg-card"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-md bg-primary/10">
                {auto.trigger === "Schedule" ? <Clock className="w-4 h-4 text-primary" /> : <Zap className="w-4 h-4 text-primary" />}
              </div>
              <div>
                <h3 className="text-sm font-medium text-card-foreground">{auto.name}</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Repeat className="w-3 h-3" /> {auto.interval}
                </p>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${auto.active ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
              {auto.active ? "Active" : "Paused"}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
