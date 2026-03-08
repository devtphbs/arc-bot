import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Save, Loader2, Play, Search, GripVertical, Trash2, Plus, Settings, BookOpen,
  MessageSquare, Code, AlertTriangle, Clock, Zap, AlertCircle, Palette, MousePointerClick,
  ChevronDown, X, UserMinus, UserPlus, Hash, AtSign, ShieldCheck, Volume2, Repeat, Send,
  Eye, EyeOff, GitBranch, Timer, Database, Globe, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Json, Tables } from "@/integrations/supabase/types";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Command = Tables<"commands">;
type CommandType = "slash" | "prefix" | "context";
type BlockType = "reply" | "embed" | "condition" | "wait" | "run_event" | "log_error" | "dm_user" | "add_role" | "remove_role" | "kick_user" | "ban_user" | "create_thread" | "send_to_channel" | "toggle_role" | "set_nickname" | "purge_messages" | "loop" | "random_choice" | "check_role" | "check_permission" | "check_channel" | "cooldown_check";

interface CommandBlock { id: string; type: BlockType; label: string; value: string; variableKey: string; }
interface CommandVariable { id: string; key: string; fallback: string; required: boolean; }
interface ExecutionResult { block_id: string; type: string; status: string; output: string; duration_ms: number; }

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const BLOCK_CATALOG: { category: string; items: { type: BlockType; label: string; description: string; icon: typeof MessageSquare }[] }[] = [
  {
    category: "Messages",
    items: [
      { type: "reply", label: "Send Reply", description: "Reply to the user with a text message", icon: MessageSquare },
      { type: "embed", label: "Send Embed", description: "Reply with a rich embed (title, color, fields)", icon: Palette },
      { type: "dm_user", label: "DM User", description: "Send a direct message to the user", icon: Send },
      { type: "send_to_channel", label: "Send to Channel", description: "Send a message to a specific channel", icon: Hash },
    ],
  },
  {
    category: "Moderation",
    items: [
      { type: "kick_user", label: "Kick User", description: "Kick a user from the server", icon: UserMinus },
      { type: "ban_user", label: "Ban User", description: "Ban a user from the server", icon: ShieldCheck },
      { type: "set_nickname", label: "Set Nickname", description: "Change a user's nickname", icon: AtSign },
      { type: "purge_messages", label: "Purge Messages", description: "Delete multiple messages from a channel", icon: Trash2 },
    ],
  },
  {
    category: "Roles",
    items: [
      { type: "add_role", label: "Add Role", description: "Give a role to the user", icon: UserPlus },
      { type: "remove_role", label: "Remove Role", description: "Remove a role from the user", icon: UserMinus },
      { type: "toggle_role", label: "Toggle Role", description: "Add role if missing, remove if present", icon: Repeat },
    ],
  },
  {
    category: "Flow Control",
    items: [
      { type: "condition", label: "If / Else", description: "Branch logic based on a condition", icon: GitBranch },
      { type: "wait", label: "Wait / Delay", description: "Pause execution for a set duration", icon: Timer },
      { type: "loop", label: "Loop", description: "Repeat a block multiple times", icon: Repeat },
      { type: "random_choice", label: "Random Choice", description: "Pick a random option from a list", icon: Database },
    ],
  },
  {
    category: "Conditions",
    items: [
      { type: "check_role", label: "Has Role?", description: "Check if user has a specific role", icon: ShieldCheck },
      { type: "check_permission", label: "Has Permission?", description: "Check if user has a permission", icon: Lock },
      { type: "check_channel", label: "In Channel?", description: "Check if command was used in a specific channel", icon: Hash },
      { type: "cooldown_check", label: "Cooldown Active?", description: "Check if user is on cooldown", icon: Clock },
    ],
  },
  {
    category: "Advanced",
    items: [
      { type: "run_event", label: "Trigger Event", description: "Fire a custom event hook", icon: Zap },
      { type: "log_error", label: "Error Handler", description: "Log an error and optionally notify", icon: AlertCircle },
      { type: "create_thread", label: "Create Thread", description: "Create a new thread in a channel", icon: Globe },
    ],
  },
];

const BLOCK_TEMPLATES = [
  { name: "Welcome Reply", blocks: [{ type: "reply" as BlockType, label: "Welcome", value: "Welcome to {server}, {user}!", variableKey: "" }] },
  { name: "Moderation Warn", blocks: [
    { type: "check_permission" as BlockType, label: "Check mod", value: "MANAGE_MESSAGES", variableKey: "" },
    { type: "reply" as BlockType, label: "Warn", value: "⚠️ {mention}, you have been warned.", variableKey: "" },
    { type: "dm_user" as BlockType, label: "DM warn", value: "You received a warning in {server}.", variableKey: "" },
    { type: "log_error" as BlockType, label: "Log", value: "Warning issued to {user}", variableKey: "" },
  ] },
  { name: "Auto Role", blocks: [
    { type: "add_role" as BlockType, label: "Give role", value: "{role_id}", variableKey: "" },
    { type: "reply" as BlockType, label: "Confirm", value: "✅ Role added, {mention}!", variableKey: "" },
  ] },
  { name: "Timed Announcement", blocks: [
    { type: "send_to_channel" as BlockType, label: "Announce", value: "📢 {message}", variableKey: "" },
    { type: "wait" as BlockType, label: "Delay", value: "5", variableKey: "" },
    { type: "send_to_channel" as BlockType, label: "Follow up", value: "Don't forget to check the pinned messages!", variableKey: "" },
  ] },
  { name: "Mute User", blocks: [
    { type: "check_permission" as BlockType, label: "Check perms", value: "MANAGE_ROLES", variableKey: "" },
    { type: "add_role" as BlockType, label: "Add muted role", value: "{muted_role_id}", variableKey: "" },
    { type: "reply" as BlockType, label: "Confirm", value: "🔇 {mention} has been muted.", variableKey: "" },
    { type: "wait" as BlockType, label: "Duration", value: "300", variableKey: "" },
    { type: "remove_role" as BlockType, label: "Remove muted", value: "{muted_role_id}", variableKey: "" },
  ] },
];

const BLOCK_STYLES: Record<BlockType, { border: string; bg: string; text: string; icon: typeof MessageSquare }> = {
  reply: { border: "border-l-primary", bg: "bg-primary/5", text: "text-primary", icon: MessageSquare },
  embed: { border: "border-l-info", bg: "bg-info/5", text: "text-info", icon: Palette },
  dm_user: { border: "border-l-info", bg: "bg-info/5", text: "text-info", icon: Send },
  send_to_channel: { border: "border-l-info", bg: "bg-info/5", text: "text-info", icon: Hash },
  condition: { border: "border-l-warning", bg: "bg-warning/5", text: "text-warning", icon: GitBranch },
  wait: { border: "border-l-muted-foreground", bg: "bg-secondary", text: "text-muted-foreground", icon: Timer },
  loop: { border: "border-l-accent", bg: "bg-accent/10", text: "text-accent-foreground", icon: Repeat },
  random_choice: { border: "border-l-accent", bg: "bg-accent/10", text: "text-accent-foreground", icon: Database },
  run_event: { border: "border-l-accent", bg: "bg-accent/10", text: "text-accent-foreground", icon: Zap },
  log_error: { border: "border-l-destructive", bg: "bg-destructive/5", text: "text-destructive", icon: AlertCircle },
  add_role: { border: "border-l-success", bg: "bg-success/5", text: "text-success", icon: UserPlus },
  remove_role: { border: "border-l-destructive", bg: "bg-destructive/5", text: "text-destructive", icon: UserMinus },
  toggle_role: { border: "border-l-warning", bg: "bg-warning/5", text: "text-warning", icon: Repeat },
  kick_user: { border: "border-l-destructive", bg: "bg-destructive/5", text: "text-destructive", icon: UserMinus },
  ban_user: { border: "border-l-destructive", bg: "bg-destructive/5", text: "text-destructive", icon: ShieldCheck },
  set_nickname: { border: "border-l-primary", bg: "bg-primary/5", text: "text-primary", icon: AtSign },
  purge_messages: { border: "border-l-destructive", bg: "bg-destructive/5", text: "text-destructive", icon: Trash2 },
  create_thread: { border: "border-l-info", bg: "bg-info/5", text: "text-info", icon: Globe },
  check_role: { border: "border-l-warning", bg: "bg-warning/5", text: "text-warning", icon: ShieldCheck },
  check_permission: { border: "border-l-warning", bg: "bg-warning/5", text: "text-warning", icon: Lock },
  check_channel: { border: "border-l-warning", bg: "bg-warning/5", text: "text-warning", icon: Hash },
  cooldown_check: { border: "border-l-warning", bg: "bg-warning/5", text: "text-warning", icon: Clock },
};

function CanvasBlock({ block, onUpdate, onDelete }: { block: CommandBlock; onUpdate: (id: string, u: Partial<CommandBlock>) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const s = BLOCK_STYLES[block.type] || BLOCK_STYLES.reply;
  const Icon = s.icon;

  const placeholders: Record<string, string> = {
    reply: "Hello {user}, welcome!",
    embed: '{"title": "Title", "color": "#FFD700", "description": "Content"}',
    dm_user: "You have a new notification from {server}",
    send_to_channel: "channel_id | Message content here",
    condition: "{user_role} == admin",
    wait: "5",
    loop: "3",
    random_choice: "Option 1\nOption 2\nOption 3",
    add_role: "Role ID to add",
    remove_role: "Role ID to remove",
    toggle_role: "Role ID to toggle",
    kick_user: "Reason for kick",
    ban_user: "Reason for ban",
    set_nickname: "New nickname for {user}",
    purge_messages: "10",
    check_role: "Role ID to check",
    check_permission: "MANAGE_MESSAGES",
    check_channel: "Channel ID",
    cooldown_check: "30",
    run_event: "event_name",
    log_error: "Error: {error_message}",
    create_thread: "Thread name | Initial message",
  };

  return (
    <div ref={setNodeRef} style={style} className={cn("rounded-lg border border-border bg-card p-4 border-l-4 relative group", s.border)}>
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
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-medium", s.bg, s.text)}>{block.type.replace(/_/g, " ")}</span>
            </div>
            <button onClick={() => onDelete(block.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            value={block.value}
            onChange={(e) => onUpdate(block.id, { value: e.target.value })}
            placeholder={placeholders[block.type] || "Enter value..."}
            rows={block.type === "random_choice" || block.type === "embed" ? 4 : 2}
            className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none font-mono"
          />
          <div className="flex items-center gap-2">
            <input type="text" value={block.variableKey} onChange={(e) => onUpdate(block.id, { variableKey: e.target.value })} placeholder="Save output as variable (optional)" className="flex-1 px-2 py-1 rounded-md bg-background border border-border text-[11px] text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>
      </div>
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary/50 border-2 border-card" />
    </div>
  );
}

export default function CommandBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const { selectedBot, bots } = useBot();
  const { user } = useAuth();
  // Capture the bot at mount time so switching bots doesn't change the target
  const [targetBot, setTargetBot] = useState<typeof selectedBot>(null);
  useEffect(() => {
    if (selectedBot && !targetBot) setTargetBot(selectedBot);
  }, [selectedBot]);

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

  // Command options (slash command parameters)
  interface CommandOption {
    id: string;
    name: string;
    description: string;
    type: "STRING" | "INTEGER" | "NUMBER" | "BOOLEAN" | "USER" | "CHANNEL" | "ROLE" | "MENTIONABLE";
    required: boolean;
    choices?: { name: string; value: string }[];
  }
  const [commandOptions, setCommandOptions] = useState<CommandOption[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!editId || !targetBot) return;
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
        if (Array.isArray((resp as any).commandOptions)) {
          setCommandOptions((resp as any).commandOptions);
        }
      }
    });
  }, [editId, targetBot?.id]);

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
    if (!name.trim() || !targetBot || !user) return;
    setSaving(true);
    const builderConfig = { mode: "blocks_v1", textResponses: [], blocks, variables, commandOptions, eventHooks: [], timedEvents: [] };
    const payload = {
      bot_id: targetBot.id, user_id: user.id, name: name.trim(), description: description.trim() || null, type, permissions,
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
        body: { blocks, variables, bot_id: targetBot?.id, dry_run: true, context: { user: "TestUser#1234", server: "TestServer", channel: "general", mention: "@TestUser" } },
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
    const q = blockSearch.toLowerCase();
    const conditionTypes: BlockType[] = ["condition", "check_role", "check_permission", "check_channel", "cooldown_check"];
    
    let cats = BLOCK_CATALOG;
    if (sidebarTab === "conditions") {
      cats = cats.map(c => ({ ...c, items: c.items.filter(i => conditionTypes.includes(i.type)) })).filter(c => c.items.length > 0);
    } else if (sidebarTab === "actions") {
      cats = cats.map(c => ({ ...c, items: c.items.filter(i => !conditionTypes.includes(i.type)) })).filter(c => c.items.length > 0);
    }

    if (!q) return cats;
    return cats.map((cat) => ({
      ...cat,
      items: cat.items.filter((i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)),
    })).filter((cat) => cat.items.length > 0);
  }, [blockSearch, sidebarTab]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top Bar */}
      <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard/commands")} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-card-foreground">{editId ? "Edit Command" : "New Command"}</span>
          {bots.length > 1 ? (
            <select
              value={targetBot?.id || ""}
              onChange={(e) => { const b = bots.find((b) => b.id === e.target.value); if (b) setTargetBot(b); }}
              className="text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary font-medium border border-primary/20 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {bots.map((b) => <option key={b.id} value={b.id}>{b.bot_name}</option>)}
            </select>
          ) : targetBot && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">Saving to: {targetBot.bot_name}</span>
          )}
          <div className="flex items-center gap-1 ml-2">
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
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-72 border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-card-foreground">Blocks</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">Click to add blocks to your command flow</p>
          </div>

          <div className="flex border-b border-border">
            {(["options", "actions", "conditions"] as const).map((t) => (
              <button key={t} onClick={() => setSidebarTab(t)} className={cn("flex-1 py-2 text-xs font-medium transition-colors capitalize border-b-2", sidebarTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{t}</button>
            ))}
          </div>

          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input type="text" value={blockSearch} onChange={(e) => setBlockSearch(e.target.value)} placeholder="Search blocks..." className="w-full pl-8 pr-3 py-1.5 rounded-md bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {sidebarTab === "options" && (
              <div className="space-y-3 p-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Type</label>
                  <div className="flex gap-1">
                    {(["slash", "prefix", "context"] as CommandType[]).map((t) => (
                      <button key={t} onClick={() => setType(t)} className={cn("flex-1 px-2 py-1.5 rounded-md text-[11px] capitalize transition-colors", type === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent")}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="/command" className="w-full px-2.5 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this command do?" rows={2} className="w-full px-2.5 py-1.5 rounded-md bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Cooldown (s)</label>
                  <input type="number" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} min={0} className="w-full px-2.5 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={ephemeral} onChange={(e) => setEphemeral(e.target.checked)} className="accent-primary" />
                  Ephemeral (only visible to user)
                </label>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Variables</label>
                  {variables.map((v) => (
                    <div key={v.id} className="flex gap-1 mb-1">
                      <input type="text" value={v.key} onChange={(e) => setVariables((p) => p.map((i) => i.id === v.id ? { ...i, key: e.target.value } : i))} placeholder="key" className="flex-1 px-2 py-1 rounded-md bg-background border border-border text-[11px] text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                      <input type="text" value={v.fallback} onChange={(e) => setVariables((p) => p.map((i) => i.id === v.id ? { ...i, fallback: e.target.value } : i))} placeholder="default" className="flex-1 px-2 py-1 rounded-md bg-background border border-border text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <button onClick={() => setVariables((p) => p.filter((i) => i.id !== v.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <button onClick={() => setVariables((p) => [...p, { id: createId(), key: "", fallback: "", required: false }])} className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 mt-1"><Plus className="w-3 h-3" /> Add Variable</button>
                </div>

                {/* Command Options (slash command parameters) */}
                {type === "slash" && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Command Options</label>
                    <p className="text-[10px] text-muted-foreground mb-2">Add parameters users fill in when using the command (e.g. amount for /purge)</p>
                    {commandOptions.map((opt) => (
                      <div key={opt.id} className="mb-2 p-2 rounded-md bg-background border border-border space-y-1.5">
                        <div className="flex items-center justify-between">
                          <select value={opt.type} onChange={(e) => setCommandOptions((p) => p.map((o) => o.id === opt.id ? { ...o, type: e.target.value as any } : o))} className="px-1.5 py-1 rounded bg-card border border-border text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                            {["STRING", "INTEGER", "NUMBER", "BOOLEAN", "USER", "CHANNEL", "ROLE", "MENTIONABLE"].map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <div className="flex items-center gap-1">
                            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                              <input type="checkbox" checked={opt.required} onChange={(e) => setCommandOptions((p) => p.map((o) => o.id === opt.id ? { ...o, required: e.target.checked } : o))} className="accent-primary w-3 h-3" />
                              Required
                            </label>
                            <button onClick={() => setCommandOptions((p) => p.filter((o) => o.id !== opt.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                        <input type="text" value={opt.name} onChange={(e) => setCommandOptions((p) => p.map((o) => o.id === opt.id ? { ...o, name: e.target.value.toLowerCase().replace(/\s/g, "_") } : o))} placeholder="option_name" className="w-full px-2 py-1 rounded bg-card border border-border text-[11px] text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                        <input type="text" value={opt.description} onChange={(e) => setCommandOptions((p) => p.map((o) => o.id === opt.id ? { ...o, description: e.target.value } : o))} placeholder="Description" className="w-full px-2 py-1 rounded bg-card border border-border text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                        {(opt.type === "STRING" || opt.type === "INTEGER" || opt.type === "NUMBER") && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">Choices (optional, one per line: name=value)</p>
                            <textarea
                              value={(opt.choices || []).map((c) => `${c.name}=${c.value}`).join("\n")}
                              onChange={(e) => {
                                const choices = e.target.value.split("\n").filter(Boolean).map((l) => {
                                  const [name, ...rest] = l.split("=");
                                  return { name: name.trim(), value: rest.join("=").trim() || name.trim() };
                                });
                                setCommandOptions((p) => p.map((o) => o.id === opt.id ? { ...o, choices: choices.length > 0 ? choices : undefined } : o));
                              }}
                              rows={2}
                              placeholder="Small=5&#10;Medium=10&#10;Large=25"
                              className="w-full px-2 py-1 rounded bg-card border border-border text-[10px] text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setCommandOptions((p) => [...p, { id: createId(), name: "", description: "", type: "STRING", required: false }])} className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 mt-1"><Plus className="w-3 h-3" /> Add Option</button>
                  </div>
                )}
              </div>
            )}

            {(sidebarTab === "actions" || sidebarTab === "conditions") && (
              <div className="space-y-3">
                {filteredCatalog.map((cat) => (
                  <div key={cat.category}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold px-1">{cat.category}</p>
                    <div className="space-y-0.5">
                      {cat.items.map((item) => {
                        const Icon = item.icon;
                        const bs = BLOCK_STYLES[item.type] || BLOCK_STYLES.reply;
                        return (
                          <button key={item.type + item.label} onClick={() => addBlock(item.type, item.label)} className="w-full flex items-center gap-2.5 p-2 rounded-md hover:bg-secondary/80 transition-colors text-left group">
                            <div className={cn("p-1.5 rounded-md shrink-0", bs.bg)}>
                              <Icon className={cn("w-3.5 h-3.5", bs.text)} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-card-foreground">{item.label}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {sidebarTab === "actions" && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold px-1">Templates</p>
                    <div className="space-y-0.5">
                      {BLOCK_TEMPLATES.map((t) => (
                        <button key={t.name} onClick={() => { t.blocks.forEach((b) => setBlocks((p) => [...p, { ...b, id: createId() }])); toast.success(`Added "${t.name}"`); }} className="w-full text-left px-2 py-1.5 rounded-md hover:bg-secondary/80 transition-colors text-[11px] text-card-foreground">
                          {t.name} <span className="text-muted-foreground">· {t.blocks.length} blocks</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-background relative">
          <div className="min-h-full p-8">
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5">
                <div className="w-6 h-6 rounded bg-gradient-primary flex items-center justify-center">
                  <span className="text-primary-foreground text-xs font-bold">{type === "slash" ? "/" : type === "prefix" ? "!" : "⋮"}</span>
                </div>
                <div>
                  <span className="text-sm font-medium text-card-foreground">{name || "command"}</span>
                  {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
                </div>
              </div>
            </div>

            {blocks.length > 0 && <div className="w-0.5 h-6 bg-muted-foreground/20 mx-auto" />}

            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
                  <MousePointerClick className="w-6 h-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">Click blocks from the sidebar to build your command flow.</p>
                <p className="text-xs text-muted-foreground mt-1">Or use a <span className="text-primary">template</span> to get started quickly.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="max-w-xl mx-auto space-y-1">
                    {blocks.map((block, i) => (
                      <div key={block.id}>
                        <CanvasBlock block={block} onUpdate={updateBlock} onDelete={deleteBlock} />
                        {i < blocks.length - 1 && <div className="w-0.5 h-4 bg-muted-foreground/20 mx-auto" />}
                      </div>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <button onClick={runTest} disabled={testing || blocks.length === 0} className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50 shadow-lg z-10">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Test Run
          </button>
        </div>

        {/* Test Panel */}
        {showTestPanel && (
          <div className="w-72 border-l border-border bg-card flex flex-col shrink-0">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-card-foreground">Test Output</h3>
              <button onClick={() => setShowTestPanel(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1.5">
              {testLogs.length === 0 && !testResults && <p className="text-muted-foreground">Click "Test Run" to see output.</p>}
              {testLogs.map((log, i) => (
                <div key={i} className={cn("px-2 py-1 rounded text-[11px]", log.includes("[error]") ? "bg-destructive/10 text-destructive" : "text-muted-foreground")}>{log}</div>
              ))}
              {testResults?.map((r) => (
                <div key={r.block_id} className={cn("px-2 py-1.5 rounded border text-[11px]", r.status === "success" ? "border-success/20 bg-success/5" : r.status === "error" ? "border-destructive/20 bg-destructive/5" : "border-border")}>
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
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Required Role IDs</label>
                <p className="text-[10px] text-muted-foreground mb-2">Paste Discord Role IDs (comma-separated). Only members with at least one of these roles can use this command. Leave empty for everyone.</p>
                <input
                  type="text"
                  value={permissions.filter(p => /^\d+$/.test(p)).join(", ")}
                  onChange={(e) => {
                    const ids = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                    setPermissions(ids);
                  }}
                  placeholder="e.g. 123456789012345678, 987654321098765432"
                  className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {permissions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {permissions.map((p) => (
                      <span key={p} className="px-2 py-1 rounded text-[10px] font-mono bg-primary text-primary-foreground flex items-center gap-1">
                        {p}
                        <button onClick={() => setPermissions(prev => prev.filter(x => x !== p))} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Discord Permissions (optional)</label>
                <p className="text-[10px] text-muted-foreground mb-2">Additionally require these Discord permissions.</p>
                <div className="flex flex-wrap gap-1.5">
                  {["ADMINISTRATOR", "MANAGE_GUILD", "MANAGE_ROLES", "KICK_MEMBERS", "BAN_MEMBERS", "MANAGE_MESSAGES", "MANAGE_CHANNELS", "MODERATE_MEMBERS"].map((p) => (
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
