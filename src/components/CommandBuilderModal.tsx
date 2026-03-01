import { X, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface CommandBuilderModalProps {
  open: boolean;
  onClose: () => void;
}

type CommandType = "slash" | "prefix" | "context";

export function CommandBuilderModal({ open, onClose }: CommandBuilderModalProps) {
  const [type, setType] = useState<CommandType>("slash");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [responses, setResponses] = useState([""]);

  const addResponse = () => setResponses((prev) => [...prev, ""]);
  const removeResponse = (i: number) => setResponses((prev) => prev.filter((_, idx) => idx !== i));
  const updateResponse = (i: number, val: string) =>
    setResponses((prev) => prev.map((r, idx) => (idx === i ? val : r)));

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-card-foreground">New Command</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Type selector */}
          <div className="mb-5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Type</label>
            <div className="flex gap-2">
              {(["slash", "prefix", "context"] as CommandType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm capitalize transition-colors",
                    type === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="mb-4">
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "slash" ? "/command-name" : type === "prefix" ? "!command" : "Menu Label"}
              className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this command do?"
              className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Responses */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Responses</label>
              <button onClick={addResponse} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {responses.map((resp, i) => (
                <div key={i} className="flex gap-2">
                  <textarea
                    value={resp}
                    onChange={(e) => updateResponse(i, e.target.value)}
                    placeholder="Bot response message..."
                    rows={2}
                    className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                  {responses.length > 1 && (
                    <button
                      onClick={() => removeResponse(i)}
                      className="self-start p-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button className="px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary">
              Create Command
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
