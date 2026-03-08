import { motion } from "framer-motion";
import { Code2, Plus, Search, Trash2, ToggleLeft, ToggleRight, Save, X, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ScriptOption {
  name: string;
  description: string;
  type: string; // "string" | "integer" | "user" | "channel" | "role" | "boolean"
}

interface CustomScript {
  id: string;
  bot_id: string;
  user_id: string;
  name: string;
  description: string | null;
  trigger_command: string | null;
  script_code: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

const OPTION_TYPES: { value: string; label: string; discord_type: number }[] = [
  { value: "string", label: "Text", discord_type: 3 },
  { value: "integer", label: "Number", discord_type: 4 },
  { value: "user", label: "User", discord_type: 6 },
  { value: "channel", label: "Channel", discord_type: 7 },
  { value: "role", label: "Role", discord_type: 8 },
  { value: "boolean", label: "True/False", discord_type: 5 },
];

const SCRIPT_TEMPLATE = `// Custom Script — runs when the trigger command is used
// Available variables:
//   {user} — mention of the user who ran the command
//   {user.id} — the user's Discord ID
//   {user.name} — the user's display name
//   {channel} — mention of the current channel
//   {channel.id} — the channel's ID
//   {server.name} — the server's name
//   {args} — all arguments after the command
//   {args.0}, {args.1}, ... — individual arguments
//   {options.name} — value of the option named "name"
//
// Available actions:
//   reply("message")       — reply to the command
//   send(channelId, "msg") — send a message to a specific channel
//   addRole(userId, roleId)    — add a role to a user
//   removeRole(userId, roleId) — remove a role from a user
//   wait(seconds)          — wait before continuing
//   embed({ title, description, color, fields }) — send an embed
//   scrape("https://example.com", ".css-selector") — fetch text from a website element
//     → result available as {scrape.0}, {scrape.1}, etc. (one per scrape call)
//     → use CSS selectors from the browser inspect element (e.g. ".price", "#title", "h1")
//
// Example:
reply("Hello {user}! You said: {args}");

// Scrape example:
// scrape("https://example.com/api", ".result-text")
// reply("The result is: {scrape.0}");
`;

export default function DashboardCustomCommands() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [scripts, setScripts] = useState<CustomScript[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomScript | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerCommand, setTriggerCommand] = useState("");
  const [scriptCode, setScriptCode] = useState("");
  const [options, setOptions] = useState<ScriptOption[]>([]);

  const fetchScripts = async () => {
    if (!selectedBot) return;
    const { data } = await supabase
      .from("custom_scripts")
      .select("*")
      .eq("bot_id", selectedBot.id)
      .order("created_at");
    if (data) setScripts(data as CustomScript[]);
  };

  useEffect(() => { fetchScripts(); }, [selectedBot]);

  const startNew = () => {
    setIsNew(true);
    setEditing(null);
    setName("");
    setDescription("");
    setTriggerCommand("");
    setScriptCode(SCRIPT_TEMPLATE);
    setOptions([]);
    setExpandedId(null);
  };

  const startEdit = (script: CustomScript) => {
    setIsNew(false);
    setEditing(script);
    setName(script.name);
    setDescription(script.description || "");
    setTriggerCommand(script.trigger_command || "");
    setScriptCode(script.script_code);
    // Parse options from script_code metadata comment or stored in description JSON
    const storedOptions = parseStoredOptions(script);
    setOptions(storedOptions);
    setExpandedId(null);
  };

  const parseStoredOptions = (script: CustomScript): ScriptOption[] => {
    // Options are stored as a JSON comment at the top of the script
    const match = script.script_code.match(/^\/\/ @options (.+)$/m);
    if (match) {
      try { return JSON.parse(match[1]); } catch { return []; }
    }
    return [];
  };

  const injectOptionsComment = (code: string, opts: ScriptOption[]): string => {
    // Remove existing @options line
    const cleaned = code.replace(/^\/\/ @options .+\n?/m, "");
    if (opts.length === 0) return cleaned;
    return `// @options ${JSON.stringify(opts)}\n${cleaned}`;
  };

  const cancelEdit = () => {
    setEditing(null);
    setIsNew(false);
  };

  const addOption = () => {
    setOptions([...options, { name: "", description: "", type: "string" }]);
  };

  const updateOption = (i: number, updates: Partial<ScriptOption>) => {
    setOptions(options.map((o, idx) => idx === i ? { ...o, ...updates } : o));
  };

  const removeOption = (i: number) => {
    setOptions(options.filter((_, idx) => idx !== i));
  };

  const saveScript = async () => {
    if (!selectedBot || !user) return;
    if (!name.trim()) { toast.error("Script name is required"); return; }
    if (!triggerCommand.trim()) { toast.error("Trigger command is required"); return; }

    // Validate options
    const validOptions = options.filter(o => o.name.trim());
    const finalCode = injectOptionsComment(scriptCode, validOptions);

    if (isNew) {
      const { error } = await supabase.from("custom_scripts").insert({
        bot_id: selectedBot.id,
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        trigger_command: triggerCommand.trim().replace(/^\//, ""),
        script_code: finalCode,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Script created!");
    } else if (editing) {
      const { error } = await supabase.from("custom_scripts").update({
        name: name.trim(),
        description: description.trim() || null,
        trigger_command: triggerCommand.trim().replace(/^\//, ""),
        script_code: finalCode,
      }).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Script updated!");
    }

    cancelEdit();
    fetchScripts();
  };

  const toggleScript = async (script: CustomScript) => {
    await supabase.from("custom_scripts").update({ enabled: !script.enabled }).eq("id", script.id);
    fetchScripts();
  };

  const deleteScript = async (id: string) => {
    await supabase.from("custom_scripts").delete().eq("id", id);
    toast.success("Script deleted");
    fetchScripts();
  };

  const filtered = scripts.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.trigger_command || "").toLowerCase().includes(search.toLowerCase())
  );

  const isEditorOpen = isNew || editing !== null;

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Code2 className="w-6 h-6 text-primary" /> Custom Scripts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Write custom scripts that execute when commands are triggered</p>
        </div>
        <button
          onClick={startNew}
          disabled={!selectedBot || isEditorOpen}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> New Script
        </button>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select or add a bot first.</p>
      ) : (
        <>
          {/* Editor Panel */}
          {isEditorOpen && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
                <span className="text-sm font-medium text-card-foreground">{isNew ? "New Script" : `Editing: ${editing?.name}`}</span>
                <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Meta fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Script Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Welcome DM"
                      className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Trigger Command</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">/</span>
                      <input
                        type="text"
                        value={triggerCommand}
                        onChange={(e) => setTriggerCommand(e.target.value)}
                        placeholder="greet"
                        className="w-full pl-7 pr-3 py-2 rounded-md bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What does this script do?"
                      className="w-full px-3 py-2 rounded-md bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                {/* Command Options */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">Command Options <span className="text-muted-foreground/60">(all optional)</span></label>
                    <button onClick={addOption} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-primary hover:bg-primary/10 transition-colors">
                      <Plus className="w-3 h-3" /> Add Option
                    </button>
                  </div>
                  {options.length > 0 && (
                    <div className="space-y-2">
                      {options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-secondary/40 border border-border">
                          <input
                            type="text"
                            value={opt.name}
                            onChange={(e) => updateOption(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                            placeholder="name"
                            className="w-28 px-2 py-1.5 rounded bg-background border border-input text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <input
                            type="text"
                            value={opt.description}
                            onChange={(e) => updateOption(i, { description: e.target.value })}
                            placeholder="Description"
                            className="flex-1 px-2 py-1.5 rounded bg-background border border-input text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <select
                            value={opt.type}
                            onChange={(e) => updateOption(i, { type: e.target.value })}
                            className="px-2 py-1.5 rounded bg-background border border-input text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            {OPTION_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          <button onClick={() => removeOption(i)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Access option values in your script with <code className="font-mono text-primary">{'{options.name}'}</code>
                      </p>
                    </div>
                  )}
                </div>

                {/* Code Editor */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Script Code</label>
                  <textarea
                    value={scriptCode}
                    onChange={(e) => setScriptCode(e.target.value)}
                    spellCheck={false}
                    className="w-full h-80 px-4 py-3 rounded-md bg-[hsl(var(--secondary))] border border-input text-sm text-foreground font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2">
                  <button onClick={cancelEdit} className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveScript} className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                    <Save className="w-4 h-4" /> Save Script
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Search */}
          {!isEditorOpen && (
            <div className="mt-6 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search scripts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
          )}

          {/* Scripts List */}
          {!isEditorOpen && (
            <div className="mt-4 space-y-2">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No custom scripts yet. Click <strong>New Script</strong> to get started!
                </p>
              )}
              {filtered.map((script, i) => {
                const scriptOpts = parseStoredOptions(script);
                return (
                  <motion.div
                    key={script.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-lg border border-border bg-card hover:border-primary/20 transition-colors"
                  >
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => startEdit(script)}>
                        <div className="p-2 rounded-md bg-primary/10">
                          <Code2 className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-card-foreground">{script.name}</span>
                            {script.trigger_command && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">/{script.trigger_command}</span>
                            )}
                            {scriptOpts.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{scriptOpts.length} option{scriptOpts.length > 1 ? "s" : ""}</span>
                            )}
                          </div>
                          {script.description && <p className="text-xs text-muted-foreground mt-0.5">{script.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setExpandedId(expandedId === script.id ? null : script.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Preview code"
                        >
                          {expandedId === script.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button onClick={() => toggleScript(script)} className="text-muted-foreground hover:text-foreground transition-colors">
                          {script.enabled ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6" />}
                        </button>
                        <button onClick={() => deleteScript(script.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable code preview */}
                    {expandedId === script.id && (
                      <div className="border-t border-border">
                        <pre className="p-4 text-xs font-mono text-foreground overflow-x-auto max-h-60 overflow-y-auto leading-relaxed bg-secondary/30">
                          {script.script_code}
                        </pre>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
