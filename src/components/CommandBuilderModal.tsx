import { X, Plus, Trash2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Command = Tables<"commands">;
type CommandType = "slash" | "prefix" | "context";

interface EmbedData {
  title: string;
  description: string;
  color: string;
  footer: string;
  thumbnail: string;
  image: string;
}

interface ButtonData {
  label: string;
  style: "primary" | "secondary" | "danger" | "link";
  url?: string;
  response?: string;
}

interface ConditionData {
  type: "has_role" | "in_channel" | "has_permission";
  value: string;
  action: "allow" | "deny";
}

const DISCORD_PERMISSIONS = [
  "ADMINISTRATOR", "MANAGE_GUILD", "MANAGE_ROLES", "MANAGE_CHANNELS",
  "KICK_MEMBERS", "BAN_MEMBERS", "MANAGE_MESSAGES", "MODERATE_MEMBERS",
];

interface CommandBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  editCommand?: Command | null;
}

export function CommandBuilderModal({ open, onClose, onSaved, editCommand }: CommandBuilderModalProps) {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [tab, setTab] = useState<"general" | "responses" | "embed" | "buttons" | "conditions" | "advanced">("general");
  const [type, setType] = useState<CommandType>("slash");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [responses, setResponses] = useState([""]);
  const [embed, setEmbed] = useState<EmbedData>({ title: "", description: "", color: "#FFD700", footer: "", thumbnail: "", image: "" });
  const [buttons, setButtons] = useState<ButtonData[]>([]);
  const [conditions, setConditions] = useState<ConditionData[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [ephemeral, setEphemeral] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editCommand) {
      setType(editCommand.type);
      setName(editCommand.name);
      setDescription(editCommand.description || "");
      setPermissions(editCommand.permissions || []);
      setResponses(Array.isArray(editCommand.responses) ? (editCommand.responses as string[]) : [""]);
      setEmbed((editCommand.embed as unknown as EmbedData) || { title: "", description: "", color: "#FFD700", footer: "", thumbnail: "", image: "" });
      setButtons(Array.isArray(editCommand.buttons) ? (editCommand.buttons as unknown as ButtonData[]) : []);
      setConditions(Array.isArray(editCommand.conditions) ? (editCommand.conditions as unknown as ConditionData[]) : []);
      setCooldown(editCommand.cooldown || 0);
      setEphemeral(editCommand.ephemeral || false);
    } else {
      setType("slash"); setName(""); setDescription(""); setPermissions([]); setResponses([""]); 
      setEmbed({ title: "", description: "", color: "#FFD700", footer: "", thumbnail: "", image: "" });
      setButtons([]); setConditions([]); setCooldown(0); setEphemeral(false);
    }
    setTab("general");
  }, [editCommand, open]);

  const handleSave = async () => {
    if (!name.trim() || !selectedBot || !user) return;
    setSaving(true);
    const payload = {
      bot_id: selectedBot.id,
      user_id: user.id,
      name: name.trim(),
      description: description.trim(),
      type,
      permissions,
      responses: responses.filter(Boolean) as unknown as Json[],
      embed: (embed.title || embed.description ? embed : null) as unknown as Json,
      buttons: buttons as unknown as Json[],
      conditions: conditions as unknown as Json[],
      cooldown,
      ephemeral,
    };
    try {
      if (editCommand) {
        const { error } = await supabase.from("commands").update(payload).eq("id", editCommand.id);
        if (error) throw error;
        toast.success("Command updated!");
      } else {
        const { error } = await supabase.from("commands").insert(payload);
        if (error) throw error;
        toast.success("Command created!");
      }
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const tabs = [
    { id: "general" as const, label: "General" },
    { id: "responses" as const, label: "Responses" },
    { id: "embed" as const, label: "Embed" },
    { id: "buttons" as const, label: "Buttons" },
    { id: "conditions" as const, label: "Conditions" },
    { id: "advanced" as const, label: "Advanced" },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-2xl mx-4 rounded-xl border border-border bg-card shadow-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-0">
            <h2 className="text-lg font-semibold text-card-foreground">{editCommand ? "Edit Command" : "New Command"}</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-6 mt-4 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap", tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {tab === "general" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Type</label>
                  <div className="flex gap-2">
                    {(["slash", "prefix", "context"] as CommandType[]).map((t) => (
                      <button key={t} onClick={() => setType(t)} className={cn("px-3 py-1.5 rounded-md text-sm capitalize transition-colors", type === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent")}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "slash" ? "/command-name" : type === "prefix" ? "!command" : "Menu Label"} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Description</label>
                  <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this command do?" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Required Permissions</label>
                  <div className="flex flex-wrap gap-2">
                    {DISCORD_PERMISSIONS.map((perm) => (
                      <button key={perm} onClick={() => setPermissions((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm])} className={cn("px-2 py-1 rounded text-[10px] font-mono transition-colors", permissions.includes(perm) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                        {perm}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "responses" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Text Responses</label>
                  <button onClick={() => setResponses((p) => [...p, ""])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
                </div>
                <div className="space-y-2">
                  {responses.map((resp, i) => (
                    <div key={i} className="flex gap-2">
                      <textarea value={resp} onChange={(e) => { const n = [...responses]; n[i] = e.target.value; setResponses(n); }} placeholder="Bot response message... Use {user} for mention, {server} for server name" rows={2} className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                      {responses.length > 1 && <button onClick={() => setResponses((p) => p.filter((_, idx) => idx !== i))} className="self-start p-2 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Multiple responses = random selection. Variables: {"{user}"}, {"{server}"}, {"{channel}"}</p>
              </div>
            )}

            {tab === "embed" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Create a rich embed response</p>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Title</label>
                  <input type="text" value={embed.title} onChange={(e) => setEmbed({ ...embed, title: e.target.value })} placeholder="Embed Title" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Description</label>
                  <textarea value={embed.description} onChange={(e) => setEmbed({ ...embed, description: e.target.value })} placeholder="Embed description (supports markdown)" rows={3} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Color</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={embed.color} onChange={(e) => setEmbed({ ...embed, color: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent" />
                      <input type="text" value={embed.color} onChange={(e) => setEmbed({ ...embed, color: e.target.value })} className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Footer</label>
                    <input type="text" value={embed.footer} onChange={(e) => setEmbed({ ...embed, footer: e.target.value })} placeholder="Footer text" className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Thumbnail URL</label>
                    <input type="text" value={embed.thumbnail} onChange={(e) => setEmbed({ ...embed, thumbnail: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Image URL</label>
                    <input type="text" value={embed.image} onChange={(e) => setEmbed({ ...embed, image: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                {/* Live Preview */}
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
                <div className="space-y-3">
                  {buttons.map((btn, i) => (
                    <div key={i} className="p-3 rounded-md bg-background border border-border space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground">Button {i + 1}</span>
                        <button onClick={() => setButtons((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <input type="text" value={btn.label} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], label: e.target.value }; setButtons(n); }} placeholder="Button label" className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <div className="flex gap-2">
                        {(["primary", "secondary", "danger", "link"] as const).map((s) => (
                          <button key={s} onClick={() => { const n = [...buttons]; n[i] = { ...n[i], style: s }; setButtons(n); }} className={cn("px-2 py-1 rounded text-[10px] capitalize", btn.style === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{s}</button>
                        ))}
                      </div>
                      {btn.style === "link" ? (
                        <input type="text" value={btn.url || ""} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], url: e.target.value }; setButtons(n); }} placeholder="https://link-url" className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      ) : (
                        <input type="text" value={btn.response || ""} onChange={(e) => { const n = [...buttons]; n[i] = { ...n[i], response: e.target.value }; setButtons(n); }} placeholder="Response when clicked" className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "conditions" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Conditional Logic</label>
                  <button onClick={() => setConditions((p) => [...p, { type: "has_role", value: "", action: "allow" }])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Condition</button>
                </div>
                {conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions. Command is available to all users with the required permissions.</p>}
                <div className="space-y-3">
                  {conditions.map((cond, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select value={cond.type} onChange={(e) => { const n = [...conditions]; n[i] = { ...n[i], type: e.target.value as ConditionData["type"] }; setConditions(n); }} className="px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="has_role">Has Role</option>
                        <option value="in_channel">In Channel</option>
                        <option value="has_permission">Has Permission</option>
                      </select>
                      <input type="text" value={cond.value} onChange={(e) => { const n = [...conditions]; n[i] = { ...n[i], value: e.target.value }; setConditions(n); }} placeholder="Role/Channel ID" className="flex-1 px-3 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                      <select value={cond.action} onChange={(e) => { const n = [...conditions]; n[i] = { ...n[i], action: e.target.value as "allow" | "deny" }; setConditions(n); }} className="px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                      <button onClick={() => setConditions((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "advanced" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Cooldown (seconds)</label>
                  <input type="number" min={0} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className="w-32 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <label className="flex items-center gap-3 text-sm text-card-foreground cursor-pointer">
                  <input type="checkbox" checked={ephemeral} onChange={(e) => setEphemeral(e.target.checked)} className="rounded border-border accent-primary" />
                  Ephemeral response (only visible to command user)
                </label>
              </div>
            )}
          </div>

          {/* Footer */}
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

interface ConditionData {
  type: "has_role" | "in_channel" | "has_permission";
  value: string;
  action: "allow" | "deny";
}
