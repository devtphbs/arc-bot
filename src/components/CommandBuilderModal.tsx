import { X, Plus, Trash2, Loader2, Clock, Copy, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Command = Tables<"commands">;
type Automation = Tables<"automations">;
type CommandType = "slash" | "prefix" | "context";
type BuilderTab =
  | "general"
  | "blocks"
  | "variables"
  | "responses"
  | "events"
  | "timed"
  | "templates"
  | "embed"
  | "buttons"
  | "conditions"
  | "advanced";

type BlockType = "reply" | "embed" | "condition" | "wait" | "run_event" | "log_error";

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

interface CommandBlock {
  id: string;
  type: BlockType;
  label: string;
  value: string;
  variableKey: string;
}

interface CommandVariable {
  id: string;
  key: string;
  fallback: string;
  required: boolean;
}

interface EventHook {
  id: string;
  event: "command_success" | "command_error" | "permission_denied" | "button_click";
  action: "send_message" | "run_blocks" | "create_log";
  payload: string;
  enabled: boolean;
}

interface TimedEventConfig {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  active: boolean;
}

interface BuilderConfig {
  mode: "blocks_v1";
  textResponses: string[];
  blocks: CommandBlock[];
  variables: CommandVariable[];
  eventHooks: EventHook[];
  timedEvents: TimedEventConfig[];
}

interface CommandBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  editCommand?: Command | null;
}

const DISCORD_PERMISSIONS = [
  "ADMINISTRATOR", "MANAGE_GUILD", "MANAGE_ROLES", "MANAGE_CHANNELS",
  "KICK_MEMBERS", "BAN_MEMBERS", "MANAGE_MESSAGES", "MODERATE_MEMBERS",
];

const DEFAULT_EMBED: EmbedData = {
  title: "",
  description: "",
  color: "#FFD700",
  footer: "",
  thumbnail: "",
  image: "",
};

const createId = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseBuilderConfig = (value: Json | null): BuilderConfig => {
  const fallback: BuilderConfig = {
    mode: "blocks_v1",
    textResponses: [""],
    blocks: [{ id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }],
    variables: [],
    eventHooks: [],
    timedEvents: [],
  };

  if (Array.isArray(value)) {
    const stringResponses = value.filter((item): item is string => typeof item === "string");
    return {
      ...fallback,
      textResponses: stringResponses.length > 0 ? stringResponses : [""],
      blocks: stringResponses.length > 0
        ? stringResponses.map((text) => ({
            id: createId(),
            type: "reply",
            label: "Send reply",
            value: text,
            variableKey: "",
          }))
        : fallback.blocks,
    };
  }

  if (!isRecord(value)) return fallback;

  const textResponsesRaw = Array.isArray(value.textResponses)
    ? value.textResponses.filter((item): item is string => typeof item === "string")
    : [];

  const blocksRaw = Array.isArray(value.blocks)
    ? value.blocks
        .map((item) => {
          if (!isRecord(item)) return null;
          return {
            id: typeof item.id === "string" ? item.id : createId(),
            type: (typeof item.type === "string" ? item.type : "reply") as BlockType,
            label: typeof item.label === "string" ? item.label : "Block",
            value: typeof item.value === "string" ? item.value : "",
            variableKey: typeof item.variableKey === "string" ? item.variableKey : "",
          } satisfies CommandBlock;
        })
        .filter((item): item is CommandBlock => Boolean(item))
    : [];

  const variablesRaw = Array.isArray(value.variables)
    ? value.variables
        .map((item) => {
          if (!isRecord(item)) return null;
          return {
            id: typeof item.id === "string" ? item.id : createId(),
            key: typeof item.key === "string" ? item.key : "",
            fallback: typeof item.fallback === "string" ? item.fallback : "",
            required: typeof item.required === "boolean" ? item.required : false,
          } satisfies CommandVariable;
        })
        .filter((item): item is CommandVariable => Boolean(item))
    : [];

  const eventHooksRaw = Array.isArray(value.eventHooks)
    ? value.eventHooks
        .map((item) => {
          if (!isRecord(item)) return null;
          return {
            id: typeof item.id === "string" ? item.id : createId(),
            event: (typeof item.event === "string" ? item.event : "command_success") as EventHook["event"],
            action: (typeof item.action === "string" ? item.action : "send_message") as EventHook["action"],
            payload: typeof item.payload === "string" ? item.payload : "",
            enabled: typeof item.enabled === "boolean" ? item.enabled : true,
          } satisfies EventHook;
        })
        .filter((item): item is EventHook => Boolean(item))
    : [];

  const timedEventsRaw = Array.isArray(value.timedEvents)
    ? value.timedEvents
        .map((item) => {
          if (!isRecord(item)) return null;
          return {
            id: typeof item.id === "string" ? item.id : createId(),
            name: typeof item.name === "string" ? item.name : "",
            cron: typeof item.cron === "string" ? item.cron : "",
            timezone: typeof item.timezone === "string" ? item.timezone : "UTC",
            active: typeof item.active === "boolean" ? item.active : true,
          } satisfies TimedEventConfig;
        })
        .filter((item): item is TimedEventConfig => Boolean(item))
    : [];

  return {
    mode: "blocks_v1",
    textResponses: textResponsesRaw.length > 0 ? textResponsesRaw : [""],
    blocks: blocksRaw.length > 0 ? blocksRaw : fallback.blocks,
    variables: variablesRaw,
    eventHooks: eventHooksRaw,
    timedEvents: timedEventsRaw,
  };
};

const parseEmbed = (value: Json | null): EmbedData => {
  if (!isRecord(value)) return DEFAULT_EMBED;
  return {
    title: typeof value.title === "string" ? value.title : "",
    description: typeof value.description === "string" ? value.description : "",
    color: typeof value.color === "string" ? value.color : "#FFD700",
    footer: typeof value.footer === "string" ? value.footer : "",
    thumbnail: typeof value.thumbnail === "string" ? value.thumbnail : "",
    image: typeof value.image === "string" ? value.image : "",
  };
};

const parseButtons = (value: Json | null): ButtonData[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      return {
        label: typeof item.label === "string" ? item.label : "",
        style: (typeof item.style === "string" ? item.style : "primary") as ButtonData["style"],
        url: typeof item.url === "string" ? item.url : "",
        response: typeof item.response === "string" ? item.response : "",
      } satisfies ButtonData;
    })
    .filter((item): item is ButtonData => Boolean(item));
};

const parseConditions = (value: Json | null): ConditionData[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      return {
        type: (typeof item.type === "string" ? item.type : "has_role") as ConditionData["type"],
        value: typeof item.value === "string" ? item.value : "",
        action: (typeof item.action === "string" ? item.action : "allow") as ConditionData["action"],
      } satisfies ConditionData;
    })
    .filter((item): item is ConditionData => Boolean(item));
};

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

  const [blocks, setBlocks] = useState<CommandBlock[]>([
    { id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" },
  ]);
  const [variables, setVariables] = useState<CommandVariable[]>([]);
  const [eventHooks, setEventHooks] = useState<EventHook[]>([]);
  const [timedEvents, setTimedEvents] = useState<TimedEventConfig[]>([]);

  const [templates, setTemplates] = useState<Automation[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const availableVariableTokens = useMemo(() => {
    const custom = variables.filter((v) => v.key.trim()).map((v) => `{${v.key.trim()}}`);
    return Array.from(new Set(["{user}", "{server}", "{channel}", "{mention}", ...custom]));
  }, [variables]);

  const loadTemplates = async (botId: string) => {
    setTemplateLoading(true);
    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("bot_id", botId)
      .eq("trigger_type", "template")
      .filter("trigger_config->>source", "eq", "command_builder_template")
      .order("created_at", { ascending: false });

    setTemplateLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setTemplates(data || []);
  };

  useEffect(() => {
    if (!open) return;

    if (editCommand) {
      const builder = parseBuilderConfig(editCommand.responses as Json | null);
      setType(editCommand.type);
      setName(editCommand.name);
      setDescription(editCommand.description || "");
      setPermissions(editCommand.permissions || []);
      setResponses(builder.textResponses.length > 0 ? builder.textResponses : [""]);
      setBlocks(builder.blocks.length > 0 ? builder.blocks : [{ id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }]);
      setVariables(builder.variables);
      setEventHooks(builder.eventHooks);
      setTimedEvents(builder.timedEvents);
      setEmbed(parseEmbed(editCommand.embed as Json | null));
      setButtons(parseButtons(editCommand.buttons as Json | null));
      setConditions(parseConditions(editCommand.conditions as Json | null));
      setCooldown(editCommand.cooldown || 0);
      setEphemeral(Boolean(editCommand.ephemeral));
    } else {
      setType("slash");
      setName("");
      setDescription("");
      setPermissions([]);
      setResponses([""]);
      setBlocks([{ id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }]);
      setVariables([]);
      setEventHooks([]);
      setTimedEvents([]);
      setEmbed(DEFAULT_EMBED);
      setButtons([]);
      setConditions([]);
      setCooldown(0);
      setEphemeral(false);
      setTemplateName("");
    }

    setTab("general");
  }, [editCommand, open]);

  useEffect(() => {
    if (!open || !selectedBot) return;
    loadTemplates(selectedBot.id);
  }, [open, selectedBot?.id]);

  const persistLinkedAutomations = async (commandId: string, builderConfig: BuilderConfig) => {
    if (!selectedBot || !user) return;

    const [existingTimed, existingEventHooks] = await Promise.all([
      supabase
        .from("automations")
        .select("id")
        .eq("bot_id", selectedBot.id)
        .eq("trigger_type", "schedule")
        .filter("trigger_config->>source", "eq", "command_builder_timer")
        .filter("trigger_config->>command_id", "eq", commandId),
      supabase
        .from("automations")
        .select("id")
        .eq("bot_id", selectedBot.id)
        .eq("trigger_type", "event")
        .filter("trigger_config->>source", "eq", "command_builder_event")
        .filter("trigger_config->>command_id", "eq", commandId),
    ]);

    const idsToDelete = [
      ...(existingTimed.data || []).map((row) => row.id),
      ...(existingEventHooks.data || []).map((row) => row.id),
    ];

    if (idsToDelete.length > 0) {
      await supabase.from("automations").delete().in("id", idsToDelete);
    }

    const validTimers = builderConfig.timedEvents.filter((timer) => timer.name.trim() && timer.cron.trim());
    const validHooks = builderConfig.eventHooks.filter((hook) => hook.enabled && hook.payload.trim());

    const automationRows = [
      ...validTimers.map((timer) => ({
        bot_id: selectedBot.id,
        user_id: user.id,
        name: `${timer.name.trim()} • ${name.trim()}`,
        trigger_type: "schedule",
        active: timer.active,
        trigger_config: {
          source: "command_builder_timer",
          command_id: commandId,
          cron: timer.cron.trim(),
          timezone: timer.timezone.trim() || "UTC",
        },
        actions: {
          action: "run_command_blocks",
          command_id: commandId,
          blocks: builderConfig.blocks,
          variables: builderConfig.variables,
        },
      })),
      ...validHooks.map((hook) => ({
        bot_id: selectedBot.id,
        user_id: user.id,
        name: `${name.trim()} • ${hook.event}`,
        trigger_type: "event",
        active: true,
        trigger_config: {
          source: "command_builder_event",
          command_id: commandId,
          event: hook.event,
        },
        actions: {
          action: hook.action,
          payload: hook.payload,
          blocks: builderConfig.blocks,
        },
      })),
    ];

    if (automationRows.length > 0) {
      const { error } = await supabase.from("automations").insert(automationRows);
      if (error) throw error;
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedBot || !user) return;
    setSaving(true);

    const builderConfig: BuilderConfig = {
      mode: "blocks_v1",
      textResponses: responses.filter((response) => response.trim().length > 0),
      blocks,
      variables,
      eventHooks,
      timedEvents,
    };

    const payload = {
      bot_id: selectedBot.id,
      user_id: user.id,
      name: name.trim(),
      description: description.trim() || null,
      type,
      permissions,
      responses: builderConfig as unknown as Json,
      embed: (embed.title || embed.description ? embed : null) as unknown as Json,
      buttons: buttons.map((button) => ({
        label: button.label,
        style: button.style,
        url: button.url || "",
        response: button.response || "",
      })) as unknown as Json,
      conditions: conditions as unknown as Json,
      cooldown,
      ephemeral,
    };

    try {
      let commandId = editCommand?.id || "";

      if (editCommand) {
        const { error } = await supabase.from("commands").update(payload).eq("id", editCommand.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("commands").insert(payload).select("id").single();
        if (error) throw error;
        commandId = data.id;
      }

      await persistLinkedAutomations(commandId, builderConfig);

      toast.success(editCommand ? "Command updated!" : "Command created!");
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save command";
      toast.error(errorMessage);

      if (selectedBot && user) {
        await supabase.from("bot_logs").insert({
          bot_id: selectedBot.id,
          user_id: user.id,
          level: "error",
          source: "command-builder",
          message: `Command save failed: ${errorMessage}`,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim() || !selectedBot || !user) return;
    setTemplateSaving(true);

    const templateConfig: BuilderConfig = {
      mode: "blocks_v1",
      textResponses: responses,
      blocks,
      variables,
      eventHooks,
      timedEvents,
    };

    const { error } = await supabase.from("automations").insert({
      bot_id: selectedBot.id,
      user_id: user.id,
      name: templateName.trim(),
      trigger_type: "template",
      active: true,
      trigger_config: { source: "command_builder_template" },
      actions: templateConfig as unknown as Json,
    });

    setTemplateSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Template saved");
    setTemplateName("");
    loadTemplates(selectedBot.id);
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("automations").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTemplates((prev) => prev.filter((template) => template.id !== id));
  };

  const applyTemplate = (template: Automation) => {
    const parsed = parseBuilderConfig(template.actions as Json | null);
    setResponses(parsed.textResponses.length > 0 ? parsed.textResponses : [""]);
    setBlocks(parsed.blocks.length > 0 ? parsed.blocks : [{ id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }]);
    setVariables(parsed.variables);
    setEventHooks(parsed.eventHooks);
    setTimedEvents(parsed.timedEvents);
    toast.success(`Template applied: ${template.name}`);
  };

  if (!open) return null;

  const tabs = [
    { id: "general" as const, label: "General" },
    { id: "blocks" as const, label: "Blocks" },
    { id: "variables" as const, label: "Variables" },
    { id: "responses" as const, label: "Responses" },
    { id: "events" as const, label: "Events" },
    { id: "timed" as const, label: "Timed" },
    { id: "templates" as const, label: "Templates" },
    { id: "embed" as const, label: "Embed" },
    { id: "buttons" as const, label: "Buttons" },
    { id: "conditions" as const, label: "Conditions" },
    { id: "advanced" as const, label: "Advanced" },
  ];

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
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="relative w-full max-w-5xl mx-4 rounded-xl border border-border bg-card shadow-2xl max-h-[92vh] flex flex-col"
        >
          <div className="flex items-center justify-between p-6 pb-0">
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">{editCommand ? "Edit Command" : "New Command"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Block builder, variables, events, timers, and templates</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex gap-1 px-6 mt-4 overflow-x-auto pb-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                  tab === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {tab === "general" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Type</label>
                  <div className="flex gap-2">
                    {(["slash", "prefix", "context"] as CommandType[]).map((item) => (
                      <button
                        key={item}
                        onClick={() => setType(item)}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-sm capitalize transition-colors",
                          type === item ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent",
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={type === "slash" ? "/command-name" : type === "prefix" ? "!command" : "Menu Label"}
                    className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this command do?"
                    className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Required Permissions</label>
                  <div className="flex flex-wrap gap-2">
                    {DISCORD_PERMISSIONS.map((perm) => (
                      <button
                        key={perm}
                        onClick={() =>
                          setPermissions((prev) =>
                            prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
                          )
                        }
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-mono transition-colors",
                          permissions.includes(perm)
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {perm}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "blocks" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Command Blocks</label>
                  <button
                    onClick={() =>
                      setBlocks((prev) => [...prev, { id: createId(), type: "reply", label: "Send reply", value: "", variableKey: "" }])
                    }
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Block
                  </button>
                </div>

                <div className="space-y-3">
                  {blocks.map((block, i) => (
                    <div key={block.id} className="p-3 rounded-md bg-background border border-border space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground">Step {i + 1}</span>
                        <button
                          onClick={() => setBlocks((prev) => prev.filter((item) => item.id !== block.id))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={block.label}
                          onChange={(e) =>
                            setBlocks((prev) => prev.map((item) => (item.id === block.id ? { ...item, label: e.target.value } : item)))
                          }
                          placeholder="Block label"
                          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />

                        <select
                          value={block.type}
                          onChange={(e) =>
                            setBlocks((prev) =>
                              prev.map((item) =>
                                item.id === block.id ? { ...item, type: e.target.value as BlockType } : item,
                              ),
                            )
                          }
                          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="reply">Reply</option>
                          <option value="embed">Send Embed</option>
                          <option value="condition">If Condition</option>
                          <option value="wait">Wait</option>
                          <option value="run_event">Run Event Hook</option>
                          <option value="log_error">Create Error Log</option>
                        </select>

                        <input
                          type="text"
                          value={block.variableKey}
                          onChange={(e) =>
                            setBlocks((prev) =>
                              prev.map((item) =>
                                item.id === block.id ? { ...item, variableKey: e.target.value } : item,
                              ),
                            )
                          }
                          placeholder="Variable key (optional)"
                          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>

                      <textarea
                        value={block.value}
                        onChange={(e) =>
                          setBlocks((prev) =>
                            prev.map((item) => (item.id === block.id ? { ...item, value: e.target.value } : item)),
                          )
                        }
                        placeholder={block.type === "wait" ? "Seconds to wait (e.g. 5)" : "Block payload / text / instruction"}
                        rows={2}
                        className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "variables" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Variables</label>
                  <button
                    onClick={() =>
                      setVariables((prev) => [...prev, { id: createId(), key: "", fallback: "", required: false }])
                    }
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Variable
                  </button>
                </div>

                {variables.length === 0 && (
                  <p className="text-xs text-muted-foreground mb-3">No custom variables yet. Use built-ins or add your own.</p>
                )}

                <div className="space-y-2">
                  {variables.map((variable) => (
                    <div key={variable.id} className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto_auto] gap-2 items-center">
                      <input
                        type="text"
                        value={variable.key}
                        onChange={(e) =>
                          setVariables((prev) =>
                            prev.map((item) => (item.id === variable.id ? { ...item, key: e.target.value } : item)),
                          )
                        }
                        placeholder="ticket_id"
                        className="px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <input
                        type="text"
                        value={variable.fallback}
                        onChange={(e) =>
                          setVariables((prev) =>
                            prev.map((item) => (item.id === variable.id ? { ...item, fallback: e.target.value } : item)),
                          )
                        }
                        placeholder="fallback value"
                        className="px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <label className="text-xs text-muted-foreground inline-flex items-center gap-2 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={variable.required}
                          onChange={(e) =>
                            setVariables((prev) =>
                              prev.map((item) => (item.id === variable.id ? { ...item, required: e.target.checked } : item)),
                            )
                          }
                          className="accent-primary"
                        />
                        Required
                      </label>
                      <button
                        onClick={() => setVariables((prev) => prev.filter((item) => item.id !== variable.id))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Quick Insert Tokens</p>
                  <div className="flex flex-wrap gap-2">
                    {availableVariableTokens.map((token) => (
                      <button
                        key={token}
                        onClick={() =>
                          setResponses((prev) => {
                            const next = [...prev];
                            next[0] = `${next[0] || ""} ${token}`.trim();
                            return next;
                          })
                        }
                        className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-[11px] font-mono hover:bg-accent"
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "responses" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Text Responses</label>
                  <button
                    onClick={() => setResponses((prev) => [...prev, ""])}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>

                <div className="space-y-2">
                  {responses.map((response, i) => (
                    <div key={i} className="flex gap-2">
                      <textarea
                        value={response}
                        onChange={(e) => {
                          const next = [...responses];
                          next[i] = e.target.value;
                          setResponses(next);
                        }}
                        placeholder="Bot response message..."
                        rows={2}
                        className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                      {responses.length > 1 && (
                        <button onClick={() => setResponses((prev) => prev.filter((_, idx) => idx !== i))} className="self-start p-2 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Use variables like {"{user}"}, {"{server}"}, or your custom tokens.</p>
              </div>
            )}

            {tab === "events" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Command Event Hooks</label>
                  <button
                    onClick={() =>
                      setEventHooks((prev) => [
                        ...prev,
                        {
                          id: createId(),
                          event: "command_success",
                          action: "send_message",
                          payload: "Command completed",
                          enabled: true,
                        },
                      ])
                    }
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Hook
                  </button>
                </div>

                {eventHooks.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hooks yet. Add success/error hooks for logging and event actions.</p>
                )}

                <div className="space-y-3">
                  {eventHooks.map((hook) => (
                    <div key={hook.id} className="p-3 rounded-md bg-background border border-border space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                        <select
                          value={hook.event}
                          onChange={(e) =>
                            setEventHooks((prev) =>
                              prev.map((item) =>
                                item.id === hook.id
                                  ? { ...item, event: e.target.value as EventHook["event"] }
                                  : item,
                              ),
                            )
                          }
                          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="command_success">command_success</option>
                          <option value="command_error">command_error</option>
                          <option value="permission_denied">permission_denied</option>
                          <option value="button_click">button_click</option>
                        </select>

                        <select
                          value={hook.action}
                          onChange={(e) =>
                            setEventHooks((prev) =>
                              prev.map((item) =>
                                item.id === hook.id
                                  ? { ...item, action: e.target.value as EventHook["action"] }
                                  : item,
                              ),
                            )
                          }
                          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="send_message">send_message</option>
                          <option value="run_blocks">run_blocks</option>
                          <option value="create_log">create_log</option>
                        </select>

                        <label className="text-xs text-muted-foreground inline-flex items-center gap-2 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={hook.enabled}
                            onChange={(e) =>
                              setEventHooks((prev) =>
                                prev.map((item) => (item.id === hook.id ? { ...item, enabled: e.target.checked } : item)),
                              )
                            }
                            className="accent-primary"
                          />
                          Enabled
                        </label>

                        <button
                          onClick={() => setEventHooks((prev) => prev.filter((item) => item.id !== hook.id))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <textarea
                        value={hook.payload}
                        onChange={(e) =>
                          setEventHooks((prev) =>
                            prev.map((item) => (item.id === hook.id ? { ...item, payload: e.target.value } : item)),
                          )
                        }
                        placeholder="Hook payload / message"
                        rows={2}
                        className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "timed" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Timed Events</label>
                  <button
                    onClick={() =>
                      setTimedEvents((prev) => [
                        ...prev,
                        {
                          id: createId(),
                          name: "Scheduled run",
                          cron: "0 9 * * *",
                          timezone: "UTC",
                          active: true,
                        },
                      ])
                    }
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Timer
                  </button>
                </div>

                {timedEvents.length === 0 && (
                  <p className="text-xs text-muted-foreground">No timers yet. Add one to run command blocks automatically.</p>
                )}

                <div className="space-y-3">
                  {timedEvents.map((timer) => (
                    <div key={timer.id} className="p-3 rounded-md bg-background border border-border space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_120px_auto_auto] gap-2 items-center">
                        <input
                          type="text"
                          value={timer.name}
                          onChange={(e) =>
                            setTimedEvents((prev) =>
                              prev.map((item) => (item.id === timer.id ? { ...item, name: e.target.value } : item)),
                            )
                          }
                          placeholder="Daily cleanup"
                          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <input
                          type="text"
                          value={timer.cron}
                          onChange={(e) =>
                            setTimedEvents((prev) =>
                              prev.map((item) => (item.id === timer.id ? { ...item, cron: e.target.value } : item)),
                            )
                          }
                          placeholder="0 9 * * *"
                          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                        />
                        <input
                          type="text"
                          value={timer.timezone}
                          onChange={(e) =>
                            setTimedEvents((prev) =>
                              prev.map((item) =>
                                item.id === timer.id ? { ...item, timezone: e.target.value } : item,
                              ),
                            )
                          }
                          placeholder="UTC"
                          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />

                        <label className="text-xs text-muted-foreground inline-flex items-center gap-2 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={timer.active}
                            onChange={(e) =>
                              setTimedEvents((prev) =>
                                prev.map((item) =>
                                  item.id === timer.id ? { ...item, active: e.target.checked } : item,
                                ),
                              )
                            }
                            className="accent-primary"
                          />
                          Active
                        </label>

                        <button
                          onClick={() => setTimedEvents((prev) => prev.filter((item) => item.id !== timer.id))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Cron format: minute hour day month weekday (example: 0 9 * * *)
                </p>
              </div>
            )}

            {tab === "templates" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-background p-3">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Save Current Builder as Template</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Moderation Starter"
                      className="flex-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      onClick={saveTemplate}
                      disabled={templateSaving || !templateName.trim()}
                      className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Save className="w-4 h-4" /> Save
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Block Templates</p>
                  {templateLoading ? (
                    <p className="text-xs text-muted-foreground">Loading templates…</p>
                  ) : templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No templates saved yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {templates.map((template) => (
                        <div key={template.id} className="p-3 rounded-md border border-border bg-background flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-card-foreground truncate">{template.name}</p>
                            <p className="text-[11px] text-muted-foreground">{new Date(template.created_at).toLocaleString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => applyTemplate(template)}
                              className="px-2.5 py-1.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent inline-flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> Apply
                            </button>
                            <button
                              onClick={() => deleteTemplate(template.id)}
                              className="px-2.5 py-1.5 rounded bg-secondary text-muted-foreground text-xs hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "embed" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Create a rich embed response</p>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Title</label>
                  <input
                    type="text"
                    value={embed.title}
                    onChange={(e) => setEmbed({ ...embed, title: e.target.value })}
                    placeholder="Embed Title"
                    className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Description</label>
                  <textarea
                    value={embed.description}
                    onChange={(e) => setEmbed({ ...embed, description: e.target.value })}
                    placeholder="Embed description"
                    rows={3}
                    className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Color</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={embed.color}
                        onChange={(e) => setEmbed({ ...embed, color: e.target.value })}
                        className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={embed.color}
                        onChange={(e) => setEmbed({ ...embed, color: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Footer</label>
                    <input
                      type="text"
                      value={embed.footer}
                      onChange={(e) => setEmbed({ ...embed, footer: e.target.value })}
                      placeholder="Footer text"
                      className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
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
                  <button
                    onClick={() => setButtons((prev) => [...prev, { label: "", style: "primary", response: "" }])}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Button
                  </button>
                </div>
                {buttons.length === 0 && <p className="text-xs text-muted-foreground">No buttons. Add one to create interactive responses.</p>}

                <div className="space-y-3">
                  {buttons.map((button, i) => (
                    <div key={i} className="p-3 rounded-md bg-background border border-border space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground">Button {i + 1}</span>
                        <button onClick={() => setButtons((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                      </div>

                      <input
                        type="text"
                        value={button.label}
                        onChange={(e) => {
                          const next = [...buttons];
                          next[i] = { ...next[i], label: e.target.value };
                          setButtons(next);
                        }}
                        placeholder="Button label"
                        className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />

                      <div className="flex gap-2">
                        {(["primary", "secondary", "danger", "link"] as const).map((style) => (
                          <button
                            key={style}
                            onClick={() => {
                              const next = [...buttons];
                              next[i] = { ...next[i], style };
                              setButtons(next);
                            }}
                            className={cn("px-2 py-1 rounded text-[10px] capitalize", button.style === style ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
                          >
                            {style}
                          </button>
                        ))}
                      </div>

                      {button.style === "link" ? (
                        <input
                          type="text"
                          value={button.url || ""}
                          onChange={(e) => {
                            const next = [...buttons];
                            next[i] = { ...next[i], url: e.target.value };
                            setButtons(next);
                          }}
                          placeholder="https://link-url"
                          className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : (
                        <input
                          type="text"
                          value={button.response || ""}
                          onChange={(e) => {
                            const next = [...buttons];
                            next[i] = { ...next[i], response: e.target.value };
                            setButtons(next);
                          }}
                          placeholder="Response when clicked"
                          className="w-full px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
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
                  <button
                    onClick={() => setConditions((prev) => [...prev, { type: "has_role", value: "", action: "allow" }])}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Condition
                  </button>
                </div>

                {conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions. Command is available to all users with required permissions.</p>}

                <div className="space-y-3">
                  {conditions.map((condition, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={condition.type}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[i] = { ...next[i], type: e.target.value as ConditionData["type"] };
                          setConditions(next);
                        }}
                        className="px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="has_role">Has Role</option>
                        <option value="in_channel">In Channel</option>
                        <option value="has_permission">Has Permission</option>
                      </select>

                      <input
                        type="text"
                        value={condition.value}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[i] = { ...next[i], value: e.target.value };
                          setConditions(next);
                        }}
                        placeholder="Role/Channel/Permission"
                        className="flex-1 px-3 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                      />

                      <select
                        value={condition.action}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[i] = { ...next[i], action: e.target.value as ConditionData["action"] };
                          setConditions(next);
                        }}
                        className="px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>

                      <button onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "advanced" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Cooldown (seconds)</label>
                  <input
                    type="number"
                    min={0}
                    value={cooldown}
                    onChange={(e) => setCooldown(Number(e.target.value))}
                    className="w-32 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <label className="flex items-center gap-3 text-sm text-card-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ephemeral}
                    onChange={(e) => setEphemeral(e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  Ephemeral response (only visible to command user)
                </label>
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
