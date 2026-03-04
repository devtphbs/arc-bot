import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Save, Loader2, Play, Search, GripVertical, Trash2, Plus, Settings, BookOpen,
  MessageSquare, Code, AlertTriangle, Clock, Zap, AlertCircle, Palette, MousePointerClick,
  ChevronDown, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Json, Tables } from "@/integrations/supabase/types";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent, DragOverlay, type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Command = Tables<"commands">;
type CommandType = "slash" | "prefix" | "context";
type BlockType = "reply" | "embed" | "condition" | "wait" | "run_event" | "log_error";

interface CommandBlock { id: string; type: BlockType; label: string; value: string; variableKey: string; }
interface CommandVariable { id: string; key: string; fallback: string; required: boolean; }
interface ExecutionResult { block_id: string; type: string; status: string; output: string; duration_ms: number; }

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const BLOCK_CATALOG: { category: string; items: { type: BlockType; label: string; description: string; icon: typeof MessageSquare }[] }[] = [
  {
    category: "Messages",
    items: [
      { type: "reply", label: "Send a Message", description: "Send or edit a message with optional formatting", icon: MessageSquare },
      { type: "embed", label: "Embed Reply", description: "Bot replies with a rich embed response", icon: Palette },
    ],
  },
  {
    category: "Logic",
    items: [
      { type: "condition", label: "If Condition", description: "Check a condition before continuing", icon: Code },
      { type: "wait", label: "Wait / Delay", description: "Pause execution for a set time", icon: Clock },
    ],
  },
  {
    category: "Advanced",
    items: [
      { type: "run_event", label: "Trigger Event", description: "Fire a custom event hook", icon: Zap },
      { type: "log_error", label: "Error Handler", description: "Handle errors during command execution", icon: AlertCircle },
    ],
  },
];

const BLOCK_TEMPLATES = [
  { name: "Welcome Reply", blocks: [{ type: "reply" as BlockType, label: "Welcome", value: "Welcome to {server}, {user}!", variableKey: "" }] },
  { name: "Moderation Warning", blocks: [
    { type: "condition" as BlockType, label: "Check role", value: "{user_role}", variableKey: "" },
    { type: "reply" as BlockType, label: "Warn", value: "⚠️ {mention}, you have been warned.", variableKey: "" },
    { type: "log_error" as BlockType, label: "Log", value: "Warning issued to {user}", variableKey: "" },
  ] },
  { name: "Timed Announcement", blocks: [
    { type: "reply" as BlockType, label: "Announce", value: "📢 Announcement: {message}", variableKey: "" },
    { type: "wait" as BlockType, label: "Delay", value: "5", variableKey: "" },
    { type: "reply" as BlockType, label: "Follow up", value: "Don't forget to check the pinned messages!", variableKey: "" },
  ] },
  { name: "Error Handler", blocks: [
    { type: "log_error" as BlockType, label: "Log Error", value: "Command failed: {error_message}", variableKey: "error_logged" },
    { type: "reply" as BlockType, label: "User notice", value: "❌ Something went wrong. Our team has been notified.", variableKey: "" },
    { type: "run_event" as BlockType, label: "Notify admins", value: "error_alert", variableKey: "" },
  ] },
];

const BLOCK_STYLES: Record<BlockType, { border: string; bg: string; text: string; icon: typeof MessageSquare }> = {
  reply: { border: "border-l-primary", bg: "bg-primary/5", text: "text-primary", icon: MessageSquare },
  embed: { border: "border-l-info", bg: "bg-info/5", text: "text-info", icon: Palette },
  condition: { border: "border-l-warning", bg: "bg-warning/5", text: "text-warning", icon: Code },
  wait: { border: "border-l-muted-foreground", bg: "bg-secondary", text: "text-muted-foreground", icon: Clock },
  run_event: { border: "border-l-accent", bg: "bg-accent/10", text: "text-accent-foreground", icon: Zap },
  log_error: { border: "border-l-destructive", bg: "bg-destructive/5", text: "text-destructive", icon: AlertCircle },
};

function CanvasBlock({ block, index, onUpdate, onDelete }: { block: CommandBlock; index: number; onUpdate: (id: string, u: Partial<CommandBlock>) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const s = BLOCK_STYLES[block.type];
  const Icon = s.icon;

  return (
    <div ref={setNodeRef} style={style} className={cn("rounded-lg border border-border bg-card p-4 border-l-4 relative group", s.border)}>
      {/* Connection dot top */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-muted-foreground/30 border-2 border-card" />
      <div className="flex items-start gap-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mt-1 shrink-0">
          <GripVertical className="w-4 h-4" />
        </button>
        <div className={cn("p-2 rounded-md shrink-0", s.bg)}>
          <Icon className={cn("w-4 h-4", s.text)} />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input type="text" value={block.label} onChange={(e) => onUpdate(block.id, { label: e.target.value })} className="text-sm font-medium text-card-foreground bg-transparent border-none outline-none p-0 w-auto" />
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-medium", s.bg, s.text)}>{block.type.replace("_", " ")}</span>
            </div>
            <button onClick={() => onDelete(block.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            value={block.value}
            onChange={(e) => onUpdate(block.id, { value: e.target.value })}
            placeholder={block.type === "wait" ? "Seconds (e.g. 5)" : "Enter content or use {variables}..."}
            rows={2}
            className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          {block.variableKey && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>Output →</span>
              <span className="font-mono text-primary">{`{${block.variableKey}}`}</span>
            </div>
          )}
        </div>
      </div>
      {/* Connection dot bottom */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary/50 border-2 border-card" />
    </div>
  );
}

export default function CommandBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const { selectedBot } = useBot();
  const { user } = useAuth();

  const [type, setType] = useState<CommandType>("slash");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [ephemeral, setEphemeral] = useState(false);
  const [blocks, setBlocks] = useState<CommandBlock[]>([]);
  const [variables, setVariables] = useState<CommandVariable[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<ExecutionResult[] | null>(null);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"actions" | "options" | "conditions">("actions");
  const [blockSearch, setBlockSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load existing command
  useEffect(() => {
    if (!editId || !selectedBot) return;
    supabase.from("commands").select("*").eq("id", editId).single().then(({ data }) => {
      if (!data) return;
      setType(data.type);
      setName(data.name);
      setDescription(data.description || "");
      setPermissions(data.permissions || []);
      setCooldown(data.cooldown || 0);
      setEphemeral(Boolean(data.ephemeral));
      const resp = data.responses;
      if (isRecord(resp) && Array.isArray((resp as any).blocks)) {
        setBlocks((resp as any).blocks.map((b: any) => ({ id: b.id || createId(), type: b.type || "reply", label: b.label || "Block", value: b.value || "", variableKey: b.variableKey || "" })));
        if (Array.isArray((resp as any).variables)) {
          setVariables((resp as any).variables.map((v: any) => ({ id: v.id || createId(), key: v.key || "", fallback: v.fallback || "", required: Boolean(v.required) })));
        }
      }
    });
  }, [editId, selectedBot?.id]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBlocks((items) => {
        const oldIdx = items.findIndex((i) => i.id === active.id);
        const newIdx = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  }, []);

  const addBlock = (type: BlockType, label: string) => {
    setBlocks((p) => [...p, { id: createId(), type, label, value: "", variableKey: "" }]);
  };

  const updateBlock = useCallback((id: string, u: Partial<CommandBlock>) => {
    setBlocks((p) => p.map((b) => (b.id === id ? { ...b, ...u } : b)));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks((p) => p.filter((b) => b.id !== id));
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !selectedBot || !user) return;
    setSaving(true);
    const builderConfig = { mode: "blocks_v1", textResponses: [], blocks, variables, eventHooks: [], timedEvents: [] };
    const payload = {
      bot_id: selectedBot.id, user_id: user.id, name: name.trim(), description: description.trim() || null, type, permissions,
      responses: builderConfig as unknown as Json,
      cooldown, ephemeral,
    };
    try {
      if (editId) {
        const { error } = await supabase.from("commands").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("commands").insert(payload);
        if (error) throw error;
      }
      setLastSaved(new Date());
      toast.success(editId ? "Command updated!" : "Command created!");
      if (!editId) navigate("/dashboard/commands");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResults(null);
    setTestLogs([]);
    setShowTestPanel(true);
    try {
      const { data, error } = await supabase.functions.invoke("execute-blocks", {
        body: { blocks, variables, bot_id: selectedBot?.id, dry_run: true, context: { user: "TestUser#1234", server: "TestServer", channel: "general", mention: "@TestUser" } },
      });
      if (error) throw error;
      setTestResults(data.results || []);
      setTestLogs(data.logs || []);
      toast.success(`Test: ${data.blocks_executed} blocks executed`);
    } catch (err: any) {
      toast.error(err.message || "Test failed");
      setTestLogs([`[error] ${err.message}`]);
    } finally {
      setTesting(false);
    }
  };

  const filteredCatalog = useMemo(() => {
    if (!blockSearch.trim()) return BLOCK_CATALOG;
    const q = blockSearch.toLowerCase();
    return BLOCK_CATALOG.map((cat) => ({
      ...cat,
      items: cat.items.filter((i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)),
    })).filter((cat) => cat.items.length > 0);
  }, [blockSearch]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top Bar */}
      <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard/commands")} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Settings className="w-3.5 h-3.5" /> Settings
            </button>
            <button onClick={() => setShowTestPanel(!showTestPanel)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Play className="w-3.5 h-3.5" /> Test
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastSaved && <span className="text-[10px] text-muted-foreground">Saved {lastSaved.toLocaleTimeString()}</span>}
          <button onClick={handleSave} disabled={saving || !name.trim()} className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Command
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Block Catalog */}
        <div className="w-80 border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-card-foreground">Blocks</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Click <span className="text-primary">Actions</span> and <span className="text-warning">Conditions</span> to add them to your command.
            </p>
          </div>

          <div className="flex border-b border-border">
            {(["options", "actions", "conditions"] as const).map((t) => (
              <button key={t} onClick={() => setSidebarTab(t)} className={cn("flex-1 py-2 text-xs font-medium transition-colors capitalize border-b-2", sidebarTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{t}</button>
            ))}
          </div>

          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input type="text" value={blockSearch} onChange={(e) => setBlockSearch(e.target.value)} placeholder="Search" className="w-full pl-9 pr-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {sidebarTab === "options" && (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Command Type</label>
                  <div className="flex gap-1.5">
                    {(["slash", "prefix", "context"] as CommandType[]).map((t) => (
                      <button key={t} onClick={() => setType(t)} className={cn("flex-1 px-2 py-1.5 rounded-md text-xs capitalize transition-colors", type === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent")}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="/command" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this command do?" rows={2} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Cooldown (seconds)</label>
                  <input type="number" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} min={0} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={ephemeral} onChange={(e) => setEphemeral(e.target.checked)} className="accent-primary" />
                  Ephemeral (only visible to user)
                </label>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Variables</label>
                  {variables.map((v) => (
                    <div key={v.id} className="flex gap-1.5 mb-1.5">
                      <input type="text" value={v.key} onChange={(e) => setVariables((p) => p.map((i) => i.id === v.id ? { ...i, key: e.target.value } : i))} placeholder="key" className="flex-1 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                      <input type="text" value={v.fallback} onChange={(e) => setVariables((p) => p.map((i) => i.id === v.id ? { ...i, fallback: e.target.value } : i))} placeholder="fallback" className="flex-1 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <button onClick={() => setVariables((p) => p.filter((i) => i.id !== v.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <button onClick={() => setVariables((p) => [...p, { id: createId(), key: "", fallback: "", required: false }])} className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 mt-1"><Plus className="w-3 h-3" /> Add Variable</button>
                </div>
              </div>
            )}

            {sidebarTab === "actions" && (
              <div className="space-y-4">
                {filteredCatalog.map((cat) => (
                  <div key={cat.category}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">{cat.category}</p>
                    <div className="space-y-1.5">
                      {cat.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button key={item.type + item.label} onClick={() => addBlock(item.type, item.label)} className="w-full flex items-start gap-3 p-3 rounded-md hover:bg-secondary/80 transition-colors text-left group">
                            <div className="flex items-center gap-2">
                              <GripVertical className="w-3 h-3 text-muted-foreground/40" />
                              <div className={cn("p-1.5 rounded-md", BLOCK_STYLES[item.type].bg)}>
                                <Icon className={cn("w-4 h-4", BLOCK_STYLES[item.type].text)} />
                              </div>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-card-foreground">{item.label}</p>
                              <p className="text-[11px] text-muted-foreground">{item.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Templates</p>
                  <div className="space-y-1">
                    {BLOCK_TEMPLATES.map((t) => (
                      <button key={t.name} onClick={() => { t.blocks.forEach((b) => setBlocks((p) => [...p, { ...b, id: createId() }])); toast.success(`Added "${t.name}"`); }} className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary/80 transition-colors text-xs text-card-foreground">
                        {t.name} <span className="text-muted-foreground">· {t.blocks.length} blocks</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {sidebarTab === "conditions" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Add conditions to control the flow of your command.</p>
                <button onClick={() => addBlock("condition", "If Condition")} className="w-full flex items-center gap-3 p-3 rounded-md hover:bg-secondary/80 transition-colors">
                  <div className="p-1.5 rounded-md bg-warning/10"><Code className="w-4 h-4 text-warning" /></div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-card-foreground">If Condition</p>
                    <p className="text-[11px] text-muted-foreground">Check a value before continuing</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-auto bg-background relative">
          <div className="min-h-full p-8">
            {/* Command trigger node */}
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5">
                <div className="w-6 h-6 rounded bg-gradient-primary flex items-center justify-center">
                  <span className="text-primary-foreground text-xs font-bold">/</span>
                </div>
                <div>
                  <span className="text-sm font-medium text-card-foreground">{name || "command"}</span>
                  {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
                </div>
              </div>
            </div>

            {/* Connection line */}
            {blocks.length > 0 && <div className="w-0.5 h-6 bg-muted-foreground/20 mx-auto" />}

            {/* Blocks */}
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
                  <MousePointerClick className="w-6 h-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Click <span className="text-primary font-medium">Actions</span> and <span className="text-warning font-medium">Conditions</span> from the sidebar to add them to your command.
                </p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="max-w-xl mx-auto space-y-1">
                    {blocks.map((block, i) => (
                      <div key={block.id}>
                        <CanvasBlock block={block} index={i} onUpdate={updateBlock} onDelete={deleteBlock} />
                        {i < blocks.length - 1 && <div className="w-0.5 h-4 bg-muted-foreground/20 mx-auto" />}
                      </div>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Floating test button */}
          <button onClick={runTest} disabled={testing || blocks.length === 0} className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50 shadow-lg z-10">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Test Run
          </button>
        </div>

        {/* Test Results Panel */}
        {showTestPanel && (
          <div className="w-80 border-l border-border bg-card flex flex-col shrink-0">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-card-foreground">Test Results</h3>
              <button onClick={() => setShowTestPanel(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2">
              {testLogs.length === 0 && !testResults && <p className="text-muted-foreground">Run a test to see results here.</p>}
              {testLogs.map((log, i) => (
                <div key={i} className={cn("px-2 py-1 rounded", log.includes("[error]") ? "bg-destructive/10 text-destructive" : "text-muted-foreground")}>{log}</div>
              ))}
              {testResults?.map((r) => (
                <div key={r.block_id} className={cn("px-2 py-1.5 rounded border", r.status === "success" ? "border-success/20 bg-success/5" : r.status === "error" ? "border-destructive/20 bg-destructive/5" : "border-border")}>
                  <div className="flex justify-between"><span className="text-card-foreground">{r.type}</span><span className="text-muted-foreground">{r.duration_ms}ms</span></div>
                  <p className="text-muted-foreground truncate">{r.output}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-md mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-card-foreground">Command Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Permissions</label>
                <div className="flex flex-wrap gap-1.5">
                  {["ADMINISTRATOR", "MANAGE_GUILD", "MANAGE_ROLES", "KICK_MEMBERS", "BAN_MEMBERS", "MANAGE_MESSAGES"].map((p) => (
                    <button key={p} onClick={() => setPermissions((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])} className={cn("px-2 py-1 rounded text-[10px] font-mono transition-colors", permissions.includes(p) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>{p}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
