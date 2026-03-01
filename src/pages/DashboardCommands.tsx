import { motion } from "framer-motion";
import { Plus, Search, MoreHorizontal, Slash, MessageSquare, MousePointerClick, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CommandBuilderModal } from "@/components/CommandBuilderModal";

interface Command {
  id: string;
  name: string;
  description: string;
  type: "slash" | "prefix" | "context";
  enabled: boolean;
  uses: number;
}

const mockCommands: Command[] = [
  { id: "1", name: "/ban", description: "Ban a user from the server", type: "slash", enabled: true, uses: 142 },
  { id: "2", name: "/kick", description: "Kick a user from the server", type: "slash", enabled: true, uses: 89 },
  { id: "3", name: "/warn", description: "Warn a user", type: "slash", enabled: true, uses: 234 },
  { id: "4", name: "!help", description: "Show help menu", type: "prefix", enabled: false, uses: 567 },
  { id: "5", name: "/poll", description: "Create a poll", type: "slash", enabled: true, uses: 45 },
  { id: "6", name: "Report User", description: "Context menu to report", type: "context", enabled: true, uses: 12 },
];

const typeIcon = {
  slash: Slash,
  prefix: MessageSquare,
  context: MousePointerClick,
};

const typeLabel = {
  slash: "Slash",
  prefix: "Prefix",
  context: "Context",
};

export default function DashboardCommands() {
  const [commands, setCommands] = useState(mockCommands);
  const [search, setSearch] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);

  const filtered = commands.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase())
  );

  const toggleCommand = (id: string) => {
    setCommands((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Commands</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage your bot commands</p>
        </div>
        <button
          onClick={() => setBuilderOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary"
        >
          <Plus className="w-4 h-4" />
          New Command
        </button>
      </motion.div>

      {/* Search */}
      <div className="mt-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search commands..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
        />
      </div>

      {/* Commands List */}
      <div className="mt-4 space-y-2">
        {filtered.map((cmd, i) => {
          const TypeIcon = typeIcon[cmd.type];
          return (
            <motion.div
              key={cmd.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-md bg-primary/10">
                  <TypeIcon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-card-foreground">{cmd.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground uppercase tracking-wider">
                      {typeLabel[cmd.type]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{cmd.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground font-mono">{cmd.uses} uses</span>
                <button onClick={() => toggleCommand(cmd.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {cmd.enabled ? (
                    <ToggleRight className="w-6 h-6 text-primary" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                </button>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <CommandBuilderModal open={builderOpen} onClose={() => setBuilderOpen(false)} />
    </div>
  );
}
