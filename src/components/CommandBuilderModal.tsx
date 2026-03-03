import { X, Plus, Trash2, Loader2, Clock, Copy, Save, GripVertical, Play, AlertCircle } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Command = Tables<"commands">;
type Automation = Tables<"automations">;
type CommandType = "slash" | "prefix" | "context";
type BuilderTab = "general" | "blocks" | "variables" | "responses" | "events" | "timed" | "templates" | "embed" | "buttons" | "conditions" | "advanced" | "test";
type BlockType = "reply" | "embed" | "condition" | "wait" | "run_event" | "log_error";

interface EmbedData { title: string; description: string; color: string; footer: string; thumbnail: string; image: string; }
interface ButtonData { label: string; style: "primary" | "secondary" | "danger" | "link"; url?: string; response?: string; }
interface ConditionData { type: "has_role" | "in_channel" | "has_permission"; value: string; action: "allow" | "deny"; }
interface CommandBlock { id: string; type: BlockType; label: string; value: string; variableKey: string; }
interface CommandVariable { id: string; key: string; fallback: string; required: boolean; }
interface EventHook { id: string; event: "command_success" | "command_error" | "permission_denied" | "button_click"; action: "send_message" | "run_blocks" | "create_log"; payload: string; enabled: boolean; }
interface TimedEventConfig { id: string; name: string; cron: string; timezone: string; active: boolean; }
interface BuilderConfig { mode: "blocks_v1"; textResponses: string[]; blocks: CommandBlock[]; variables: CommandVariable[]; eventHooks: EventHook[]; timedEvents: TimedEventConfig[]; }

interface CommandBuilderModalProps { open: boolean; onClose: () => void; onSaved?: () => void; editCommand?: Command | null; }
interface ExecutionResult { block_id: string; type: string; status: string; output: string; duration_ms: number; }

const DISCORD_PERMISSIONS = ["ADMINISTRATOR", "MANAGE_GUILD", "MANAGE_ROLES", "MANAGE_CHANNELS", "KICK_MEMBERS", "BAN_MEMBERS", "MANAGE_MESSAGES", "MODERATE_MEMBERS"];
const DEFAULT_EMBED: EmbedData = { title: "", description: "", color: "#FFD700", footer: "", thumbnail: "", image: "" };

const BLOCK_TEMPLATES: { name: string; blocks: Omit<CommandBlock, "id">[] }[] = [
  { name: "Welcome Reply", blocks: [{ type: "reply", label: "Welcome", value: "Welcome to {server}, {user}!", variableKey: "" }] },
  { name: "Moderation Warning", blocks: [
    { type: "condition", label: "Check role", value: "{user_role}", variableKey: "" },
    { type: "reply", label: "Warn", value: "⚠️ {mention}, you have been warned.", variableKey: "" },
    { type: "log_error", label: "Log", value: "Warning issued to {user}", variableKey: "" },
  ]},
  { name: "Timed Announcement", blocks: [
    { type: "reply", label: "Announce", value: "📢 Announcement: {message}", variableKey: "" },
    { type: "wait", label: "Delay", value: "5", variableKey: "" },
    { type: "reply", label: "Follow up", value: "Don't forget to check the pinned messages!", variableKey: "" },
  ]},
  { name: "Error Handler", blocks: [
    { type: "log_error", label: "Log Error", value: "Command failed: {error_message}", variableKey: "error_logged" },
    { type: "reply", label: "User notice", value: "❌ Something went wrong. Our team has been notified.", variableKey: "" },
    { type: "run_event", label: "Notify admins", value: "error_alert", variableKey: "" },
  ]},
];

const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const parseBuilderConfig = (value: Json | null): BuilderConfig => {
  const fallback: BuilderConfig = { mode: "blocks_v1", textResponses: [""], blocks: [{ id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }], variables: [], eventHooks: [], timedEvents: [] };
  if (Array.isArray(value)) {
    const sr = value.filter((i): i is string => typeof i === "string");
    return { ...fallback, textResponses: sr.length > 0 ? sr : [""], blocks: sr.length > 0 ? sr.map((t) => ({ id: createId(), type: "reply" as BlockType, label: "Send reply", value: t, variableKey: "" })) : fallback.blocks };
  }
  if (!isRecord(value)) return fallback;
  const tr = Array.isArray(value.textResponses) ? value.textResponses.filter((i): i is string => typeof i === "string") : [];
  const bl = Array.isArray(value.blocks) ? value.blocks.map((i) => { if (!isRecord(i)) return null; return { id: typeof i.id === "string" ? i.id : createId(), type: (typeof i.type === "string" ? i.type : "reply") as BlockType, label: typeof i.label === "string" ? i.label : "Block", value: typeof i.value === "string" ? i.value : "", variableKey: typeof i.variableKey === "string" ? i.variableKey : "" }; }).filter(Boolean) as CommandBlock[] : [];
  const vr = Array.isArray(value.variables) ? value.variables.map((i) => { if (!isRecord(i)) return null; return { id: typeof i.id === "string" ? i.id : createId(), key: typeof i.key === "string" ? i.key : "", fallback: typeof i.fallback === "string" ? i.fallback : "", required: typeof i.required === "boolean" ? i.required : false }; }).filter(Boolean) as CommandVariable[] : [];
  const eh = Array.isArray(value.eventHooks) ? value.eventHooks.map((i) => { if (!isRecord(i)) return null; return { id: typeof i.id === "string" ? i.id : createId(), event: (typeof i.event === "string" ? i.event : "command_success") as EventHook["event"], action: (typeof i.action === "string" ? i.action : "send_message") as EventHook["action"], payload: typeof i.payload === "string" ? i.payload : "", enabled: typeof i.enabled === "boolean" ? i.enabled : true }; }).filter(Boolean) as EventHook[] : [];
  const te = Array.isArray(value.timedEvents) ? value.timedEvents.map((i) => { if (!isRecord(i)) return null; return { id: typeof i.id === "string" ? i.id : createId(), name: typeof i.name === "string" ? i.name : "", cron: typeof i.cron === "string" ? i.cron : "", timezone: typeof i.timezone === "string" ? i.timezone : "UTC", active: typeof i.active === "boolean" ? i.active : true }; }).filter(Boolean) as TimedEventConfig[] : [];
  return { mode: "blocks_v1", textResponses: tr.length > 0 ? tr : [""], blocks: bl.length > 0 ? bl : fallback.blocks, variables: vr, eventHooks: eh, timedEvents: te };
};

const parseEmbed = (value: Json | null): EmbedData => { if (!isRecord(value)) return DEFAULT_EMBED; return { title: typeof value.title === "string" ? value.title : "", description: typeof value.description === "string" ? value.description : "", color: typeof value.color === "string" ? value.color : "#FFD700", footer: typeof value.footer === "string" ? value.footer : "", thumbnail: typeof value.thumbnail === "string" ? value.thumbnail : "", image: typeof value.image === "string" ? value.image : "" }; };
const parseButtons = (value: Json | null): ButtonData[] => { if (!Array.isArray(value)) return []; return value.map((i) => { if (!isRecord(i)) return null; return { label: typeof i.label === "string" ? i.label : "", style: (typeof i.style === "string" ? i.style : "primary") as ButtonData["style"], url: typeof i.url === "string" ? i.url : "", response: typeof i.response === "string" ? i.response : "" }; }).filter(Boolean) as ButtonData[]; };
const parseConditions = (value: Json | null): ConditionData[] => { if (!Array.isArray(value)) return []; return value.map((i) => { if (!isRecord(i)) return null; return { type: (typeof i.type === "string" ? i.type : "has_role") as ConditionData["type"], value: typeof i.value === "string" ? i.value : "", action: (typeof i.action === "string" ? i.action : "allow") as ConditionData["action"] }; }).filter(Boolean) as ConditionData[]; };

const BLOCK_COLORS: Record<BlockType, string> = {
  reply: "border-l-primary",
  embed: "border-l-info",
  condition: "border-l-warning",
  wait: "border-l-muted-foreground",
  run_event: "border-l-accent",
  log_error: "border-l-destructive",
};

function SortableBlock({ block, index, onUpdate, onDelete }: { block: CommandBlock; index: number; onUpdate: (id: string, updates: Partial<CommandBlock>) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : undefined };

  return (
    <div ref={setNodeRef} style={style} className={cn("p-3 rounded-md bg-background border border-border border-l-4 space-y-2", BLOCK_COLORS[block.type])}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4" /></button>
          <span className="text-[10px] text-muted-foreground font-mono">#{index + 1}</span>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-medium",
            block.type === "reply" ? "bg-primary/10 text-primary" :
            block.type === "embed" ? "bg-info/10 text-info" :
            block.type === "condition" ? "bg-warning/10 text-warning" :
            block.type === "wait" ? "bg-secondary text-muted-foreground" :
            block.type === "run_event" ? "bg-accent/20 text-accent-foreground" :
            "bg-destructive/10 text-destructive"
          )}>{block.type}</span>
        </div>
        <button onClick={() => onDelete(block.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input type="text" value={block.label} onChange={(e) => onUpdate(block.id, { label: e.target.value })} placeholder="Block label" className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        <select value={block.type} onChange={(e) => onUpdate(block.id, { type: e.target.value as BlockType })} className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="reply">Reply</option>
          <option value="embed">Send Embed</option>
          <option value="condition">If Condition</option>
          <option value="wait">Wait</option>
          <option value="run_event">Run Event Hook</option>
          <option value="log_error">Create Error Log</option>
        </select>
        <input type="text" value={block.variableKey} onChange={(e) => onUpdate(block.id, { variableKey: e.target.value })} placeholder="Output variable (optional)" className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
      </div>
      <textarea value={block.value} onChange={(e) => onUpdate(block.id, { value: e.target.value })} placeholder={block.type === "wait" ? "Seconds to wait (e.g. 5)" : "Block payload / text / instruction"} rows={2} className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
    </div>
  );
}

export function CommandBuilderModal({ open, onClose, onSaved, editCommand }: CommandBuilderModalProps) {
  const { selectedBot } = useBot();
  const { user } = useAuth();

  const [tab, setTab] = useState<BuilderTab>("general");
  const [type, setType] = useState<CommandType>("slash");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [responses, setResponses] = useState([""]);
  const [embed, setEmbed] = useState<EmbedData>(DEFAULT_EMBED);
  const [buttons, setButtons] = useState<ButtonData[]>([]);
  const [conditions, setConditions] = useState<ConditionData[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [ephemeral, setEphemeral] = useState(false);
  const [blocks, setBlocks] = useState<CommandBlock[]>([{ id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }]);
  const [variables, setVariables] = useState<CommandVariable[]>([]);
  const [eventHooks, setEventHooks] = useState<EventHook[]>([]);
  const [timedEvents, setTimedEvents] = useState<TimedEventConfig[]>([]);
  const [templates, setTemplates] = useState<Automation[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState<ExecutionResult[] | null>(null);
  const [testLogs, setTestLogs] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const availableVariableTokens = useMemo(() => {
    const custom = variables.filter((v) => v.key.trim()).map((v) => `{${v.key.trim()}}`);
    return Array.from(new Set(["{user}", "{server}", "{channel}", "{mention}", ...custom]));
  }, [variables]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const updateBlock = useCallback((id: string, updates: Partial<CommandBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const addBlockFromTemplate = (template: typeof BLOCK_TEMPLATES[0]) => {
    const newBlocks = template.blocks.map((b) => ({ ...b, id: createId() }));
    setBlocks((prev) => [...prev, ...newBlocks]);
    toast.success(`Added "${template.name}" template blocks`);
  };

  const runTest = async () => {
    setTestRunning(true);
    setTestResults(null);
    setTestLogs([]);
    try {
      const { data, error } = await supabase.functions.invoke("execute-blocks", {
        body: {
          blocks,
          variables,
          bot_id: selectedBot?.id,
          dry_run: true,
          context: { user: "TestUser#1234", server: "TestServer", channel: "general", mention: "@TestUser" },
        },
      });
      if (error) throw error;
      setTestResults(data.results || []);
      setTestLogs(data.logs || []);
      toast.success(`Test completed: ${data.blocks_executed} blocks executed`);
    } catch (err: any) {
      toast.error(err.message || "Test failed");
      setTestLogs([`[error] ${err.message}`]);
    } finally {
      setTestRunning(false);
    }
  };

  const loadTemplates = async (botId: string) => {
    setTemplateLoading(true);
    const { data } = await supabase.from("automations").select("*").eq("bot_id", botId).eq("trigger_type", "template").filter("trigger_config->>source", "eq", "command_builder_template").order("created_at", { ascending: false });
    setTemplateLoading(false);
    setTemplates(data || []);
  };

  useEffect(() => {
    if (!open) return;
    if (editCommand) {
      const builder = parseBuilderConfig(editCommand.responses as Json | null);
      setType(editCommand.type); setName(editCommand.name); setDescription(editCommand.description || "");
      setPermissions(editCommand.permissions || []); setResponses(builder.textResponses.length > 0 ? builder.textResponses : [""]);
      setBlocks(builder.blocks.length > 0 ? builder.blocks : [{ id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }]);
      setVariables(builder.variables); setEventHooks(builder.eventHooks); setTimedEvents(builder.timedEvents);
      setEmbed(parseEmbed(editCommand.embed as Json | null)); setButtons(parseButtons(editCommand.buttons as Json | null));
      setConditions(parseConditions(editCommand.conditions as Json | null)); setCooldown(editCommand.cooldown || 0); setEphemeral(Boolean(editCommand.ephemeral));
    } else {
      setType("slash"); setName(""); setDescription("");
      setPermissions([]); setResponses([""]);
      setBlocks([{ id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }]);
      setVariables([]); setEventHooks([]); setTimedEvents([]); setEmbed(DEFAULT_EMBED); setButtons([]);
      setConditions([]); setCooldown(0); setEphemeral(false); setTemplateName("");
    }
    setTab("general"); setTestResults(null); setTestLogs([]);
  }, [editCommand, open]);

  useEffect(() => { if (open && selectedBot) loadTemplates(selectedBot.id); }, [open, selectedBot?.id]);

  const persistLinkedAutomations = async (commandId: string, builderConfig: BuilderConfig) => {
    if (!selectedBot || !user) return;
    const [existingTimed, existingEventHooks] = await Promise.all([
      supabase.from("automations").select("id").eq("bot_id", selectedBot.id).eq("trigger_type", "schedule").filter("trigger_config->>source", "eq", "command_builder_timer").filter("trigger_config->>command_id", "eq", commandId),
      supabase.from("automations").select("id").eq("bot_id", selectedBot.id).eq("trigger_type", "event").filter("trigger_config->>source", "eq", "command_builder_event").filter("trigger_config->>command_id", "eq", commandId),
    ]);
    const idsToDelete = [...(existingTimed.data || []).map((r) => r.id), ...(existingEventHooks.data || []).map((r) => r.id)];
    if (idsToDelete.length > 0) await supabase.from("automations").delete().in("id", idsToDelete);
    const rows = [
      ...builderConfig.timedEvents.filter((t) => t.name.trim() && t.cron.trim()).map((t) => ({ bot_id: selectedBot.id, user_id: user.id, name: `${t.name.trim()} • ${name.trim()}`, trigger_type: "schedule", active: t.active, trigger_config: { source: "command_builder_timer", command_id: commandId, cron: t.cron.trim(), timezone: t.timezone.trim() || "UTC" } as unknown as Json, actions: { action: "run_command_blocks", command_id: commandId, blocks: builderConfig.blocks, variables: builderConfig.variables } as unknown as Json })),
      ...builderConfig.eventHooks.filter((h) => h.enabled && h.payload.trim()).map((h) => ({ bot_id: selectedBot.id, user_id: user.id, name: `${name.trim()} • ${h.event}`, trigger_type: "event", active: true, trigger_config: { source: "command_builder_event", command_id: commandId, event: h.event } as unknown as Json, actions: { action: h.action, payload: h.payload, blocks: builderConfig.blocks } as unknown as Json })),
    ];
    if (rows.length > 0) { const { error } = await supabase.from("automations").insert(rows as never); if (error) throw error; }
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedBot || !user) return;
    setSaving(true);
    const builderConfig: BuilderConfig = { mode: "blocks_v1", textResponses: responses.filter((r) => r.trim()), blocks, variables, eventHooks, timedEvents };
    const payload = {
      bot_id: selectedBot.id, user_id: user.id, name: name.trim(), description: description.trim() || null, type, permissions,
      responses: builderConfig as unknown as Json,
      embed: (embed.title || embed.description ? embed : null) as unknown as Json,
      buttons: buttons.map((b) => ({ label: b.label, style: b.style, url: b.url || "", response: b.response || "" })) as unknown as Json,
      conditions: conditions as unknown as Json, cooldown, ephemeral,
    };
    try {
      let commandId = editCommand?.id || "";
      if (editCommand) { const { error } = await supabase.from("commands").update(payload).eq("id", editCommand.id); if (error) throw error; }
      else { const { data, error } = await supabase.from("commands").insert(payload).select("id").single(); if (error) throw error; commandId = data.id; }
      await persistLinkedAutomations(commandId, builderConfig);
      toast.success(editCommand ? "Command updated!" : "Command created!");
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save command";
      toast.error(msg);
      if (selectedBot && user) await supabase.from("bot_logs").insert({ bot_id: selectedBot.id, user_id: user.id, level: "error", source: "command-builder", message: `Command save failed: ${msg}` });
    } finally { setSaving(false); }
  };

  const saveTemplate = async () => {
    if (!templateName.trim() || !selectedBot || !user) return;
    setTemplateSaving(true);
    const { error } = await supabase.from("automations").insert({ bot_id: selectedBot.id, user_id: user.id, name: templateName.trim(), trigger_type: "template", active: true, trigger_config: { source: "command_builder_template" }, actions: { mode: "blocks_v1", textResponses: responses, blocks, variables, eventHooks, timedEvents } as unknown as Json });
    setTemplateSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Template saved");
    setTemplateName("");
    loadTemplates(selectedBot.id);
  };

  const deleteTemplate = async (id: string) => { await supabase.from("automations").delete().eq("id", id); setTemplates((p) => p.filter((t) => t.id !== id)); };
  const applyTemplate = (template: Automation) => {
    const parsed = parseBuilderConfig(template.actions as Json | null);
    setResponses(parsed.textResponses.length > 0 ? parsed.textResponses : [""]); setBlocks(parsed.blocks.length > 0 ? parsed.blocks : [{ id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }]);
    setVariables(parsed.variables); setEventHooks(parsed.eventHooks); setTimedEvents(parsed.timedEvents); toast.success(`Template applied: ${template.name}`);
  };

  if (!open) return null;

  const tabs: { id: BuilderTab; label: string }[] = [
    { id: "general", label: "General" }, { id: "blocks", label: "Blocks" }, { id: "variables", label: "Variables" },
    { id: "responses", label: "Responses" }, { id: "events", label: "Events" }, { id: "timed", label: "Timed" },
    { id: "templates", label: "Templates" }, { id: "embed", label: "Embed" }, { id: "buttons", label: "Buttons" },
    { id: "conditions", label: "Conditions" }, { id: "advanced", label: "Advanced" }, { id: "test", label: "🧪 Test" },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative w-full max-w-5xl mx-4 rounded-xl border border-border bg-card shadow-2xl max-h-[92vh] flex flex-col">
          <div className="flex items-center justify-between p-6 pb-0">
            <div><h2 className="text-lg font-semibold text-card-foreground">{editCommand ? "Edit Command" : "New Command"}</h2><p className="text-xs text-muted-foreground mt-0.5">Drag-and-drop blocks, variables, events, timers, templates & testing</p></div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex gap-1 px-6 mt-4 overflow-x-auto pb-1">
            {tabs.map((item) => (
              <button key={item.id} onClick={() => setTab(item.id)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap", tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}>{item.label}</button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {tab === "general" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Type</label>
                  <div className="flex gap-2">
                    {(["slash", "prefix", "context"] as CommandType[]).map((item) => (
                      <button key={item} onClick={() => setType(item)} className={cn("px-3 py-1.5 rounded-md text-sm capitalize transition-colors", type === item ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent")}>{item}</button>
                    ))}
                  </div>
                </div>
                <div><label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "slash" ? "/command-name" : type === "prefix" ? "!command" : "Menu Label"} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" /></div>
                <div><label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Description</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this command do?" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" /></div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Required Permissions</label>
                  <div className="flex flex-wrap gap-2">{DISCORD_PERMISSIONS.map((perm) => (<button key={perm} onClick={() => setPermissions((p) => p.includes(perm) ? p.filter((x) => x !== perm) : [...p, perm])} className={cn("px-2 py-1 rounded text-[10px] font-mono transition-colors", permissions.includes(perm) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>{perm}</button>))}</div>
                </div>
              </>
            )}

            {tab === "blocks" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Drag & Drop Command Blocks</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setBlocks((p) => [...p, { id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Block</button>
                  </div>
                </div>

                {/* Block Templates */}
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Quick Templates</p>
                  <div className="flex flex-wrap gap-2">
                    {BLOCK_TEMPLATES.map((t) => (
                      <button key={t.name} onClick={() => addBlockFromTemplate(t)} className="px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground text-[11px] hover:bg-accent transition-colors">{t.name}</button>
                    ))}
                  </div>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {blocks.map((block, i) => (
                        <SortableBlock key={block.id} block={block} index={i} onUpdate={updateBlock} onDelete={deleteBlock} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {blocks.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Add blocks above or use a quick template to get started</p>}
              </div>
            )}

            {tab === "variables" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Variables</label>
                  <button onClick={() => setVariables((p) => [...p, { id: createId(), key: "", fallback: "", required: false }])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Variable</button>
                </div>
                {variables.length === 0 && <p className="text-xs text-muted-foreground mb-3">No custom variables yet. Use built-ins or add your own.</p>}
                <div className="space-y-2">
                  {variables.map((v) => (
                    <div key={v.id} className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto_auto] gap-2 items-center">
                      <input type="text" value={v.key} onChange={(e) => setVariables((p) => p.map((i) => (i.id === v.id ? { ...i, key: e.target.value } : i)))} placeholder="ticket_id" className="px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <input type="text" value={v.fallback} onChange={(e) => setVariables((p) => p.map((i) => (i.id === v.id ? { ...i, fallback: e.target.value } : i)))} placeholder="fallback value" className="px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <label className="text-xs text-muted-foreground inline-flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={v.required} onChange={(e) => setVariables((p) => p.map((i) => (i.id === v.id ? { ...i, required: e.target.checked } : i)))} className="accent-primary" />Required</label>
                      <button onClick={() => setVariables((p) => p.filter((i) => i.id !== v.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Quick Insert Tokens</p>
                  <div className="flex flex-wrap gap-2">{availableVariableTokens.map((token) => (<button key={token} onClick={() => setResponses((p) => { const n = [...p]; n[0] = `${n[0] || ""} ${token}`.trim(); return n; })} className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-[11px] font-mono hover:bg-accent">{token}</button>))}</div>
                </div>
              </div>
            )}

            {tab === "responses" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Text Responses</label>
                  <button onClick={() => setResponses((p) => [...p, ""])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
                </div>
                <div className="space-y-2">{responses.map((r, i) => (<div key={i} className="flex gap-2"><textarea value={r} onChange={(e) => { const n = [...responses]; n[i] = e.target.value; setResponses(n); }} placeholder="Bot response message..." rows={2} className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />{responses.length > 1 && (<button onClick={() => setResponses((p) => p.filter((_, idx) => idx !== i))} className="self-start p-2 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>)}</div>))}</div>
                <p className="text-[10px] text-muted-foreground mt-2">Use variables like {"{user}"}, {"{server}"}, or your custom tokens.</p>
              </div>
            )}

            {tab === "events" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Command Event Hooks</label>
                  <button onClick={() => setEventHooks((p) => [...p, { id: createId(), event: "command_success", action: "send_message", payload: "Command completed", enabled: true }])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Hook</button>
                </div>
                {eventHooks.length === 0 && <p className="text-xs text-muted-foreground">No hooks yet. Add success/error hooks for logging and event actions.</p>}
                <div className="space-y-3">{eventHooks.map((hook) => (
                  <div key={hook.id} className="p-3 rounded-md bg-background border border-border space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                      <select value={hook.event} onChange={(e) => setEventHooks((p) => p.map((i) => (i.id === hook.id ? { ...i, event: e.target.value as EventHook["event"] } : i)))} className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"><option value="command_success">command_success</option><option value="command_error">command_error</option><option value="permission_denied">permission_denied</option><option value="button_click">button_click</option></select>
                      <select value={hook.action} onChange={(e) => setEventHooks((p) => p.map((i) => (i.id === hook.id ? { ...i, action: e.target.value as EventHook["action"] } : i)))} className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"><option value="send_message">send_message</option><option value="run_blocks">run_blocks</option><option value="create_log">create_log</option></select>
                      <label className="text-xs text-muted-foreground inline-flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={hook.enabled} onChange={(e) => setEventHooks((p) => p.map((i) => (i.id === hook.id ? { ...i, enabled: e.target.checked } : i)))} className="accent-primary" />Enabled</label>
                      <button onClick={() => setEventHooks((p) => p.filter((i) => i.id !== hook.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <textarea value={hook.payload} onChange={(e) => setEventHooks((p) => p.map((i) => (i.id === hook.id ? { ...i, payload: e.target.value } : i)))} placeholder="Hook payload / message" rows={2} className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                  </div>
                ))}</div>
              </div>
            )}

            {tab === "timed" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Timed Events</label>
                  <button onClick={() => setTimedEvents((p) => [...p, { id: createId(), name: "Scheduled run", cron: "0 9 * * *", timezone: "UTC", active: true }])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Timer</button>
                </div>
                {timedEvents.length === 0 && <p className="text-xs text-muted-foreground">No timers yet. Add one to run command blocks automatically.</p>}
                <div className="space-y-3">{timedEvents.map((timer) => (
                  <div key={timer.id} className="p-3 rounded-md bg-background border border-border space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_120px_auto_auto] gap-2 items-center">
                      <input type="text" value={timer.name} onChange={(e) => setTimedEvents((p) => p.map((i) => (i.id === timer.id ? { ...i, name: e.target.value } : i)))} placeholder="Daily cleanup" className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <input type="text" value={timer.cron} onChange={(e) => setTimedEvents((p) => p.map((i) => (i.id === timer.id ? { ...i, cron: e.target.value } : i)))} placeholder="0 9 * * *" className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                      <input type="text" value={timer.timezone} onChange={(e) => setTimedEvents((p) => p.map((i) => (i.id === timer.id ? { ...i, timezone: e.target.value } : i)))} placeholder="UTC" className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <label className="text-xs text-muted-foreground inline-flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={timer.active} onChange={(e) => setTimedEvents((p) => p.map((i) => (i.id === timer.id ? { ...i, active: e.target.checked } : i)))} className="accent-primary" />Active</label>
                      <button onClick={() => setTimedEvents((p) => p.filter((i) => i.id !== timer.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}</div>
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Cron format: minute hour day month weekday</p>
              </div>
            )}

            {tab === "templates" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-background p-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Save Current Builder as Template</label>
                  <div className="flex gap-2">
                    <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Moderation Starter" className="flex-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button onClick={saveTemplate} disabled={templateSaving || !templateName.trim()} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"><Save className="w-4 h-4" /> Save</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Saved Templates</p>
                  {templateLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : templates.length === 0 ? <p className="text-xs text-muted-foreground">No templates saved yet.</p> : (
                    <div className="space-y-2">{templates.map((t) => (
                      <div key={t.id} className="p-3 rounded-md border border-border bg-background flex items-center justify-between gap-3">
                        <div className="min-w-0"><p className="text-sm text-card-foreground truncate">{t.name}</p><p className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p></div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => applyTemplate(t)} className="px-2.5 py-1.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Apply</button>
                          <button onClick={() => deleteTemplate(t.id)} className="px-2.5 py-1.5 rounded bg-secondary text-muted-foreground text-xs hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}</div>
                  )}
                </div>
              </div>
            )}

            {tab === "embed" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Create a rich embed response</p>
                <div><label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Title</label><input type="text" value={embed.title} onChange={(e) => setEmbed({ ...embed, title: e.target.value })} placeholder="Embed Title" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" /></div>
                <div><label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Description</label><textarea value={embed.description} onChange={(e) => setEmbed({ ...embed, description: e.target.value })} placeholder="Embed description" rows={3} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Color</label><div className="flex gap-2 items-center"><input type="color" value={embed.color} onChange={(e) => setEmbed({ ...embed, color: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent" /><input type="text" value={embed.color} onChange={(e) => setEmbed({ ...embed, color: e.target.value })} className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" /></div></div>
                  <div><label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Footer</label><input type="text" value={embed.footer} onChange={(e) => setEmbed({ ...embed, footer: e.target.value })} placeholder="Footer text" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" /></div>
                </div>
                {(embed.title || embed.description) && (
                  <div className="mt-4 rounded-md border-l-4 p-4 bg-background" style={{ borderLeftColor: embed.color }}>
                    {embed.title && <p className="font-semibold text-sm text-foreground">{embed.title}</p>}
                    {embed.description && <p className="text-xs text-muted-foreground mt-1">{embed.description}</p>}
                    {embed.footer && <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border">{embed.footer}</p>}
                  </div>
                )}
              </div>
            )}

            {tab === "buttons" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Buttons</label>
                  <button onClick={() => setButtons((p) => [...p, { label: "", style: "primary", response: "" }])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Button</button>
                </div>
                {buttons.length === 0 && <p className="text-xs text-muted-foreground">No buttons. Add one to create interactive responses.</p>}
                <div className="space-y-3">{buttons.map((btn, i) => (
                  <div key={i} className="p-3 rounded-md bg-background border border-border space-y-2">
                    <div className="flex justify-between items-center"><span className="text-[10px] text-muted-foreground">Button {i + 1}</span><button onClick={() => setButtons((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button></div>
                    <input type="text" value={btn.label} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], label: e.target.value }; setButtons(n); }} placeholder="Button label" className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    <div className="flex gap-2">{(["primary", "secondary", "danger", "link"] as const).map((s) => (<button key={s} onClick={() => { const n = [...buttons]; n[i] = { ...n[i], style: s }; setButtons(n); }} className={cn("px-2 py-1 rounded text-[10px] capitalize", btn.style === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{s}</button>))}</div>
                    {btn.style === "link" ? (
                      <input type="text" value={btn.url || ""} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], url: e.target.value }; setButtons(n); }} placeholder="https://link-url" className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    ) : (
                      <input type="text" value={btn.response || ""} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], response: e.target.value }; setButtons(n); }} placeholder="Response when clicked" className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    )}
                  </div>
                ))}</div>
              </div>
            )}

            {tab === "conditions" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Conditional Logic</label>
                  <button onClick={() => setConditions((p) => [...p, { type: "has_role", value: "", action: "allow" }])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Condition</button>
                </div>
                {conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions. Command is available to all users with required permissions.</p>}
                <div className="space-y-3">{conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={c.type} onChange={(e) => { const n = [...conditions]; n[i] = { ...n[i], type: e.target.value as ConditionData["type"] }; setConditions(n); }} className="px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"><option value="has_role">Has Role</option><option value="in_channel">In Channel</option><option value="has_permission">Has Permission</option></select>
                    <input type="text" value={c.value} onChange={(e) => { const n = [...conditions]; n[i] = { ...n[i], value: e.target.value }; setConditions(n); }} placeholder="Role/Channel/Permission" className="flex-1 px-3 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                    <select value={c.action} onChange={(e) => { const n = [...conditions]; n[i] = { ...n[i], action: e.target.value as ConditionData["action"] }; setConditions(n); }} className="px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"><option value="allow">Allow</option><option value="deny">Deny</option></select>
                    <button onClick={() => setConditions((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}</div>
              </div>
            )}

            {tab === "advanced" && (
              <div className="space-y-4">
                <div><label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Cooldown (seconds)</label><input type="number" min={0} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className="w-32 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" /></div>
                <label className="flex items-center gap-3 text-sm text-card-foreground cursor-pointer"><input type="checkbox" checked={ephemeral} onChange={(e) => setEphemeral(e.target.checked)} className="rounded border-border accent-primary" />Ephemeral response (only visible to command user)</label>
              </div>
            )}

            {tab === "test" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Runtime Test Engine</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Dry-run your blocks with test context variables</p>
                  </div>
                  <button onClick={runTest} disabled={testRunning || blocks.length === 0} className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {testRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Run Test
                  </button>
                </div>

                {testLogs.length > 0 && (
                  <div className="rounded-md border border-border bg-background p-4 font-mono text-xs space-y-1 max-h-60 overflow-y-auto">
                    <p className="text-muted-foreground uppercase tracking-wider text-[10px] mb-2">Execution Log</p>
                    {testLogs.map((log, i) => (
                      <div key={i} className={cn("py-0.5", log.includes("[error]") ? "text-destructive" : log.includes("[warning]") ? "text-warning" : "text-muted-foreground")}>
                        {log}
                      </div>
                    ))}
                  </div>
                )}

                {testResults && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Block Results</p>
                    {testResults.map((r, i) => (
                      <div key={i} className={cn("p-3 rounded-md border text-xs flex items-start gap-3",
                        r.status === "success" ? "border-success/20 bg-success/5" : r.status === "error" ? "border-destructive/20 bg-destructive/5" : "border-border bg-background"
                      )}>
                        <div className={cn("w-2 h-2 rounded-full mt-1 shrink-0", r.status === "success" ? "bg-success" : r.status === "error" ? "bg-destructive" : "bg-muted-foreground")} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{r.type}</span>
                            <span className="text-muted-foreground">{r.duration_ms}ms</span>
                          </div>
                          <p className="text-muted-foreground mt-0.5 break-all">{r.output}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!testResults && !testRunning && (
                  <div className="py-12 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Click "Run Test" to execute your blocks in dry-run mode</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 p-6 pt-4 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving || !name.trim()} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editCommand ? "Save Changes" : "Create Command"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
