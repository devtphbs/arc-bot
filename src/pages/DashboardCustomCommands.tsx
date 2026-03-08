import { motion } from "framer-motion";
import { Code2, Info } from "lucide-react";

export default function DashboardCustomCommands() {
  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Code2 className="w-6 h-6 text-primary" /> Custom Scripts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Advanced scripting for power users. Write custom JavaScript-like scripts that run when commands are triggered.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-info/20 bg-info/5 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-card-foreground font-medium">Coming Soon</p>
          <p className="text-xs text-muted-foreground mt-1">
            Custom Scripts will let you write advanced logic for your bot commands using a safe, sandboxed scripting environment. You'll be able to:
          </p>
          <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
            <li>Access command arguments and user data</li>
            <li>Make API calls to external services</li>
            <li>Use conditional logic, loops, and variables</li>
            <li>Store and retrieve persistent data</li>
            <li>Create complex response flows</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">For now, use the <strong className="text-foreground">Command Builder</strong> for visual command creation or <strong className="text-foreground">Export Bot</strong> to download a Python script you can customize.</p>
        </div>
      </motion.div>
    </div>
  );
}
