import { motion } from "framer-motion";
import { Code2, Plus, Search, Trash2, ToggleLeft, ToggleRight, Save, X, ChevronDown, ChevronUp, Globe, BookOpen, Copy, Check, Play, Loader2 } from "lucide-react";
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
//
// ── Variables ──
//   {user}          — mention the user       {user.id}       — user's Discord ID
//   {user.name}     — display name           {channel}       — mention channel
//   {channel.id}    — channel ID             {server.name}   — server name
//   {options.name}  — value of option "name"
//
// ── Actions ──
//   reply("message")                — reply to the command
//   send(channelId, "msg")          — send to a specific channel
//   addRole(userId, roleId)         — add role to user
//   removeRole(userId, roleId)      — remove role from user
//   wait(seconds)                   — pause before continuing
//   embed({ title, description, color, fields }) — send an embed
//
// ── String Utilities ──
//   cutAfter("text", "delimiter")         — text before the delimiter
//   cutBefore("text", "delimiter")        — text after the delimiter
//   replace("text", "find", "replacement") — replace all occurrences
//   upper("text")                         — UPPERCASE
//   lower("text")                         — lowercase
//   trim("text")                          — remove leading/trailing spaces
//   length("text")                        — character count
//
//   Use with variables:
//     cutAfter("{scrape.0}", " - ")  → gets text before " - "
//     upper("{user.name}")           → uppercased username
//     replace("{scrape.0}", "$", "") → remove dollar signs
//
//   Store results in variables with => varName:
//     cutAfter("{scrape.0}", " - ") => price
//     reply("Price is: {price}")
//
// ── Web Scraping ──
//   scrape("url", "selector")       — get text from a CSS selector
//   scrapeAll("url", "selector")    — get ALL matching texts
//   scrapeImage("url", "selector")  — get the image URL (src) from inside a selector
//   scrapeAttr("url", "selector", "attribute") — get any HTML attribute value
//
//   Selectors you can use:
//     ".price"         → class selector (elements with class="price")
//     "#title"         → id selector (element with id="title")
//     "h1"             → tag selector (first <h1> element)
//     "div.product"    → tag + class (a <div> with class="product")
//     ".card .name"    → nested (find .name inside .card)
//     "[data-value]"   → attribute selector
//
//   Results are available as:
//     {scrape.0}, {scrape.1}            — text results (in order of scrape() calls)
//     {scrapeImage.0}                   — image URL results
//     {scrapeAll.0.0}, {scrapeAll.0.1}  — individual items from scrapeAll
//     {scrapeAll.0.join(", ")}          — join all items with a separator
//     {scrapeAttr.0}                    — attribute value results
//
// ── Example: Get a product price & image ──
// scrape("https://example.com/product", ".price")
// scrapeImage("https://example.com/product", ".product-image")
// reply("Price: {scrape.0}\\nImage: {scrapeImage.0}")
//
// ── Example: List top 5 headlines ──
// scrapeAll("https://news.example.com", "h2.headline")
// reply("Headlines:\\n{scrapeAll.0.join('\\n')}")

reply("Hello {user}! Script is working.");
`;

const SCRAPE_EXAMPLES = [
  {
    title: "Get text from a class",
    code: 'scrape("https://example.com", ".product-title")\nreply("Product: {scrape.0}")',
    desc: "Finds the first element with class=\"product-title\" and returns its text content.",
  },
  {
    title: "Get an image URL",
    code: 'scrapeImage("https://example.com", ".hero-banner")\nreply("Banner image: {scrapeImage.0}")',
    desc: "Finds the first <img> tag inside an element with class=\"hero-banner\" and returns its src URL.",
  },
  {
    title: "Get multiple items",
    code: 'scrapeAll("https://example.com/blog", "h2.post-title")\nreply("Posts:\\n{scrapeAll.0.join(\'\\n\')}")',
    desc: "Finds ALL <h2> elements with class=\"post-title\" and joins them with newlines.",
  },
  {
    title: "Get an attribute value",
    code: 'scrapeAttr("https://example.com", ".download-btn", "href")\nreply("Download link: {scrapeAttr.0}")',
    desc: "Gets the href attribute from the element with class=\"download-btn\".",
  },
  {
    title: "Get by ID",
    code: 'scrape("https://example.com", "#main-heading")\nreply("Heading: {scrape.0}")',
    desc: "Finds the element with id=\"main-heading\" and returns its text.",
  },
  {
    title: "Nested selectors",
    code: 'scrape("https://example.com", ".card .price")\nscrape("https://example.com", ".card .name")\nreply("{scrape.1} costs {scrape.0}")',
    desc: "Finds .price inside .card, then .name inside .card. Each scrape() call gets its own index.",
  },
  {
    title: "Combine text + image",
    code: 'scrape("https://store.com/item", ".item-name")\nscrape("https://store.com/item", ".item-price")\nscrapeImage("https://store.com/item", ".item-image")\nembed({ title: "{scrape.0}", description: "Price: {scrape.1}", image: "{scrapeImage.0}" })',
    desc: "Scrape a product name, price, and image — then show them all in a Discord embed.",
  },
];


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
  const [showScrapeRef, setShowScrapeRef] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);

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

  const testScript = async () => {
    setTestRunning(true);
    setTestOutput(null);
    try {
      // Parse the script to simulate output
      let code = scriptCode.replace(/^\/\/.*/gm, "").trim();
      
      // Simulate variable replacements
      const simVars: Record<string, string> = {
        "{user}": "@TestUser",
        "{user.id}": "123456789",
        "{user.name}": "TestUser",
        "{channel}": "#test-channel",
        "{channel.id}": "987654321",
        "{server.name}": "Test Server",
      };
      // Replace {options.x} with placeholder
      options.forEach(opt => {
        if (opt.name) simVars[`{options.${opt.name}}`] = `<${opt.name}>`;
      });

      // Process string utilities and store results
      const stringVars: Record<string, string> = {};
      const stringUtilLines = code.split("\n").filter(l => /^(cutAfter|cutBefore|replace|upper|lower|trim|length)\(/.test(l.trim()));
      for (const line of stringUtilLines) {
        const storageMatch = line.match(/=>\s*(\w+)\s*$/);
        const varName = storageMatch?.[1];
        let result = "(simulated)";

        const cutAfterM = line.match(/cutAfter\(["'`](.*?)["'`]\s*,\s*["'`](.*?)["'`]\)/);
        const cutBeforeM = line.match(/cutBefore\(["'`](.*?)["'`]\s*,\s*["'`](.*?)["'`]\)/);
        const replaceM = line.match(/replace\(["'`](.*?)["'`]\s*,\s*["'`](.*?)["'`]\s*,\s*["'`](.*?)["'`]\)/);
        const upperM = line.match(/upper\(["'`](.*?)["'`]\)/);
        const lowerM = line.match(/lower\(["'`](.*?)["'`]\)/);
        const trimM = line.match(/trim\(["'`](.*?)["'`]\)/);
        const lengthM = line.match(/length\(["'`](.*?)["'`]\)/);

        const rAll = (s: string, f: string, r: string) => s.split(f).join(r);
        const resolveV = (txt: string) => { Object.entries(simVars).forEach(([k, v]) => { txt = rAll(txt, k, v); }); return txt; };

        if (cutAfterM) {
          const txt = resolveV(cutAfterM[1]);
          const idx = txt.indexOf(cutAfterM[2]);
          result = idx >= 0 ? txt.substring(0, idx) : txt;
        } else if (cutBeforeM) {
          const txt = resolveV(cutBeforeM[1]);
          const idx = txt.indexOf(cutBeforeM[2]);
          result = idx >= 0 ? txt.substring(idx + cutBeforeM[2].length) : txt;
        } else if (replaceM) {
          result = rAll(resolveV(replaceM[1]), replaceM[2], replaceM[3]);
        } else if (upperM) {
          result = resolveV(upperM[1]).toUpperCase();
        } else if (lowerM) {
          result = resolveV(lowerM[1]).toLowerCase();
        } else if (trimM) {
          result = resolveV(trimM[1]).trim();
        } else if (lengthM) {
          result = String(resolveV(lengthM[1]).length);
        }

        if (varName) {
          stringVars[varName] = result;
          simVars[`{${varName}}`] = result;
        }
      }

      // Extract reply() calls
      const replies: string[] = [];
      const replyRegex = /reply\(["'`]([\s\S]*?)["'`]\)/g;
      let m;
      while ((m = replyRegex.exec(code)) !== null) {
        let text = m[1];
        Object.entries(simVars).forEach(([k, v]) => { text = text.split(k).join(v); });
        // Replace scrape results with placeholders
        text = text.replace(/\{scrape\.\d+\}/g, "(scraped text)");
        text = text.replace(/\{scrapeImage\.\d+\}/g, "(image url)");
        text = text.replace(/\{scrapeAll\.\d+\.join\(.+?\)\}/g, "(scraped list)");
        text = text.replace(/\{scrapeAll\.\d+\.\d+\}/g, "(scraped item)");
        text = text.replace(/\{scrapeAttr\.\d+\}/g, "(attribute value)");
        replies.push(text);
      }

      // Extract embed() calls
      const embedRegex = /embed\(\s*\{([\s\S]*?)\}\s*\)/g;
      const embeds: string[] = [];
      while ((m = embedRegex.exec(code)) !== null) {
        embeds.push(`[Embed: {${m[1]}}]`);
      }

      // Extract scrape calls for summary
      const scrapes: string[] = [];
      const scrapeCallRegex = /scrape(?:All|Image|Attr)?\(["'`](.+?)["'`]/g;
      while ((m = scrapeCallRegex.exec(code)) !== null) {
        scrapes.push(`🌐 Scraping: ${m[1]}`);
      }

      // Extract other actions
      const actions: string[] = [];
      if (/addRole\(/.test(code)) actions.push("➕ Add role");
      if (/removeRole\(/.test(code)) actions.push("➖ Remove role");
      if (/send\(/.test(code)) actions.push("📤 Send to channel");
      if (/wait\(/.test(code)) actions.push("⏱️ Wait/delay");

      const output = [
        "── Test Output ──",
        ...scrapes,
        ...actions,
        ...replies.map((r, i) => `💬 Reply${replies.length > 1 ? ` #${i+1}` : ""}: ${r}`),
        ...embeds,
        replies.length === 0 && embeds.length === 0 ? "⚠️ No reply() or embed() found — bot won't respond" : "",
      ].filter(Boolean).join("\n");

      setTestOutput(output);
      toast.success("Test completed!");
    } catch (err: any) {
      setTestOutput(`❌ Error: ${err.message}`);
    } finally {
      setTestRunning(false);
    }
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-muted-foreground">Script Code</label>
                    <button
                      onClick={() => setShowScrapeRef(!showScrapeRef)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-primary hover:bg-primary/10 transition-colors"
                    >
                      <BookOpen className="w-3 h-3" /> {showScrapeRef ? "Hide" : "Show"} Scraping Reference
                    </button>
                  </div>
                  <textarea
                    value={scriptCode}
                    onChange={(e) => setScriptCode(e.target.value)}
                    spellCheck={false}
                    className="w-full h-80 px-4 py-3 rounded-md bg-secondary border border-input text-sm text-foreground font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {/* Scraping Reference Panel */}
                {showScrapeRef && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-primary/10 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Web Scraping Reference</span>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Quick reference */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-md bg-background border border-border p-3">
                          <h4 className="text-xs font-semibold text-foreground mb-2">🔧 Scrape Functions</h4>
                          <div className="space-y-1.5 text-[11px] font-mono">
                            <div><span className="text-primary">scrape</span><span className="text-muted-foreground">("url", "selector")</span> <span className="text-muted-foreground ml-2">→ text</span></div>
                            <div><span className="text-primary">scrapeAll</span><span className="text-muted-foreground">("url", "selector")</span> <span className="text-muted-foreground ml-2">→ all texts</span></div>
                            <div><span className="text-primary">scrapeImage</span><span className="text-muted-foreground">("url", "selector")</span> <span className="text-muted-foreground ml-2">→ image URL</span></div>
                            <div><span className="text-primary">scrapeAttr</span><span className="text-muted-foreground">("url", "selector", "attr")</span> <span className="text-muted-foreground ml-2">→ attribute</span></div>
                          </div>
                        </div>
                        <div className="rounded-md bg-background border border-border p-3">
                          <h4 className="text-xs font-semibold text-foreground mb-2">🎯 CSS Selectors</h4>
                          <div className="space-y-1.5 text-[11px] font-mono">
                            <div><span className="text-primary">.classname</span> <span className="text-muted-foreground ml-2">→ by class</span></div>
                            <div><span className="text-primary">#myid</span> <span className="text-muted-foreground ml-2">→ by id</span></div>
                            <div><span className="text-primary">h1</span>, <span className="text-primary">p</span>, <span className="text-primary">span</span> <span className="text-muted-foreground ml-2">→ by tag</span></div>
                            <div><span className="text-primary">div.card</span> <span className="text-muted-foreground ml-2">→ tag + class</span></div>
                            <div><span className="text-primary">.parent .child</span> <span className="text-muted-foreground ml-2">→ nested</span></div>
                            <div><span className="text-primary">[data-price]</span> <span className="text-muted-foreground ml-2">→ by attribute</span></div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-md bg-background border border-border p-3">
                        <h4 className="text-xs font-semibold text-foreground mb-2">📦 Using Results in reply()</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[11px] font-mono">
                          <div><span className="text-primary">{'{scrape.0}'}</span> <span className="text-muted-foreground">→ 1st scrape() result</span></div>
                          <div><span className="text-primary">{'{scrape.1}'}</span> <span className="text-muted-foreground">→ 2nd scrape() result</span></div>
                          <div><span className="text-primary">{'{scrapeImage.0}'}</span> <span className="text-muted-foreground">→ 1st image URL</span></div>
                          <div><span className="text-primary">{'{scrapeAttr.0}'}</span> <span className="text-muted-foreground">→ 1st attribute value</span></div>
                          <div><span className="text-primary">{'{scrapeAll.0.0}'}</span> <span className="text-muted-foreground">→ 1st item of 1st scrapeAll</span></div>
                          <div><span className="text-primary">{'{scrapeAll.0.join(", ")}'}</span> <span className="text-muted-foreground">→ all items joined</span></div>
                        </div>
                      </div>

                      {/* Examples */}
                      <div>
                        <h4 className="text-xs font-semibold text-foreground mb-2">💡 Examples — click to insert</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {SCRAPE_EXAMPLES.map((ex, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setScriptCode(ex.code);
                                toast.success(`Inserted example: ${ex.title}`);
                              }}
                              className="text-left rounded-md bg-secondary/50 border border-border p-3 hover:border-primary/30 hover:bg-secondary transition-colors group"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-foreground">{ex.title}</span>
                                <Copy className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                              </div>
                              <pre className="text-[11px] font-mono text-primary/80 mb-1 whitespace-pre-wrap">{ex.code}</pre>
                              <p className="text-[10px] text-muted-foreground">{ex.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-md bg-accent/30 border border-accent/20 p-3">
                        <p className="text-[11px] text-muted-foreground">
                          <strong className="text-foreground">💡 Tip:</strong> To find the right CSS selector, right-click any element on a website → <strong>Inspect</strong> → look at the <code className="text-primary">class=""</code> or <code className="text-primary">id=""</code> attribute. Use that as your selector with a dot (.) for classes or hash (#) for IDs.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Test Output */}
                {testOutput && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-primary/20 bg-secondary/50 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-primary/10 flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">📋 Test Results</span>
                      <button onClick={() => setTestOutput(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <pre className="p-4 text-xs font-mono text-foreground whitespace-pre-wrap leading-relaxed">{testOutput}</pre>
                  </motion.div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2">
                  <button onClick={cancelEdit} className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={testScript}
                    disabled={testRunning}
                    className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    {testRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Test
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
