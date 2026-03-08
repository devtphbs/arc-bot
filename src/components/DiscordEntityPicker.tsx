import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { Hash, Shield, FolderOpen, ChevronDown, RefreshCw, Keyboard, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type EntityType = "channel" | "role" | "category";

interface DiscordChannel {
  id: string;
  name: string;
  type: number; // 0=text, 2=voice, 4=category, 5=announcement, 13=stage, 15=forum
}

interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

interface DiscordEntityPickerProps {
  type: EntityType;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  multiple?: boolean;
  values?: string[];
  onChangeMultiple?: (values: string[]) => void;
}

const CHANNEL_TYPE_NAMES: Record<number, string> = {
  0: "Text", 2: "Voice", 4: "Category", 5: "Announcement", 13: "Stage", 15: "Forum",
};

export function DiscordEntityPicker({ type, value, onChange, placeholder, label, multiple, values, onChangeMultiple }: DiscordEntityPickerProps) {
  const { selectedBot } = useBot();
  const [mode, setMode] = useState<"dropdown" | "manual">("dropdown");
  const [items, setItems] = useState<(DiscordChannel | DiscordRole)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const hasGuild = !!selectedBot?.guild_id;

  const fetchItems = useCallback(async () => {
    if (!selectedBot?.guild_id) return;
    setLoading(true);
    setError(null);
    try {
      const action = type === "role" ? "fetch_roles" : "fetch_channels";
      const { data, error: fnErr } = await supabase.functions.invoke("manage-bot", {
        body: { bot_id: selectedBot.id, action },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      if (type === "role") {
        const roles = (data.roles as DiscordRole[])
          .filter((r) => r.name !== "@everyone")
          .sort((a, b) => b.position - a.position);
        setItems(roles);
      } else if (type === "category") {
        const categories = (data.channels as DiscordChannel[]).filter((c) => c.type === 4);
        setItems(categories);
      } else {
        const channels = (data.channels as DiscordChannel[]).filter((c) => c.type !== 4);
        setItems(channels);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch");
      setMode("manual");
    } finally {
      setLoading(false);
    }
  }, [selectedBot?.id, selectedBot?.guild_id, type]);

  useEffect(() => {
    if (hasGuild && mode === "dropdown") fetchItems();
  }, [hasGuild, mode, fetchItems]);

  const getIcon = () => {
    if (type === "role") return <Shield className="w-3.5 h-3.5 text-muted-foreground" />;
    if (type === "category") return <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />;
    return <Hash className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const getItemName = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return id;
    return "name" in item ? item.name : id;
  };

  const roleColor = (item: DiscordRole) => {
    if (!item.color) return undefined;
    return `#${item.color.toString(16).padStart(6, "0")}`;
  };

  const handleSelect = (id: string) => {
    if (multiple && onChangeMultiple && values) {
      if (values.includes(id)) {
        onChangeMultiple(values.filter((v) => v !== id));
      } else {
        onChangeMultiple([...values, id]);
      }
    } else {
      onChange(id);
      setOpen(false);
    }
  };

  const displayValue = multiple && values
    ? values.length > 0 ? values.map((v) => getItemName(v)).join(", ") : ""
    : value ? getItemName(value) : "";

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</label>
          <div className="flex items-center gap-1">
            {hasGuild && (
              <button
                type="button"
                onClick={() => setMode(mode === "dropdown" ? "manual" : "dropdown")}
                className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
              >
                {mode === "dropdown" ? <><Keyboard className="w-3 h-3" /> Manual ID</> : <><ChevronDown className="w-3 h-3" /> Dropdown</>}
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "manual" || !hasGuild ? (
        <div className="flex items-center gap-2">
          {getIcon()}
          <input
            type="text"
            value={multiple ? (values || []).join(", ") : value}
            onChange={(e) => {
              if (multiple && onChangeMultiple) {
                onChangeMultiple(e.target.value.split(",").map((s) => s.trim()).filter(Boolean));
              } else {
                onChange(e.target.value);
              }
            }}
            placeholder={placeholder || `Enter ${type} ID${multiple ? "s (comma-separated)" : ""}`}
            className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground hover:border-ring transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <div className="flex items-center gap-2 min-w-0">
              {getIcon()}
              <span className={cn("truncate", !displayValue && "text-muted-foreground")}>
                {displayValue || placeholder || `Select ${type}...`}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
            </div>
          </button>

          {open && (
            <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              <div className="p-1.5 border-b border-border flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider px-1">{items.length} {type}s</span>
                <button type="button" onClick={fetchItems} className="text-muted-foreground hover:text-primary"><RefreshCw className="w-3 h-3" /></button>
              </div>
              {items.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground p-3 text-center">No {type}s found</p>
              )}
              {items.map((item) => {
                const isSelected = multiple ? values?.includes(item.id) : value === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
                      isSelected && "bg-primary/10 text-primary"
                    )}
                  >
                    {type === "role" && (
                      <div
                        className="w-3 h-3 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: roleColor(item as DiscordRole) || "transparent" }}
                      />
                    )}
                    {type !== "role" && getIcon()}
                    <span className="truncate">{(item as any).name}</span>
                    {"type" in item && type === "channel" && (
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{CHANNEL_TYPE_NAMES[(item as DiscordChannel).type] || ""}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto shrink-0">{item.id}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
      {!hasGuild && <p className="text-[10px] text-muted-foreground mt-1">Set a main server in Settings to use dropdowns</p>}
    </div>
  );
}
