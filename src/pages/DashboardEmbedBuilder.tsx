import { motion } from "framer-motion";
import { Palette, Plus, Save, Trash2, Loader2, Copy, Eye } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";

interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

interface EmbedData {
  title: string;
  description: string;
  color: string;
  url: string;
  thumbnail: string;
  image: string;
  footer_text: string;
  footer_icon: string;
  author_name: string;
  author_icon: string;
  author_url: string;
  fields: EmbedField[];
  timestamp: boolean;
}

const defaultEmbed: EmbedData = {
  title: "", description: "", color: "#f5a623", url: "", thumbnail: "", image: "",
  footer_text: "", footer_icon: "", author_name: "", author_icon: "", author_url: "",
  fields: [], timestamp: false,
};

export default function DashboardEmbedBuilder() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [embed, setEmbed] = useState<EmbedData>({ ...defaultEmbed });
  const [savedEmbeds, setSavedEmbeds] = useState<any[]>([]);
  const [embedName, setEmbedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "images" | "author" | "footer" | "fields">("general");

  useEffect(() => {
    if (!selectedBot) return;
    supabase.from("saved_embeds").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).then(({ data }) => setSavedEmbeds(data || []));
  }, [selectedBot]);

  const update = (key: keyof EmbedData, value: any) => setEmbed({ ...embed, [key]: value });

  const addField = () => update("fields", [...embed.fields, { name: "Field", value: "Value", inline: false }]);
  const removeField = (i: number) => update("fields", embed.fields.filter((_, idx) => idx !== i));
  const updateField = (i: number, key: keyof EmbedField, val: any) => {
    const fields = [...embed.fields];
    fields[i] = { ...fields[i], [key]: val };
    update("fields", fields);
  };

  const saveEmbed = async () => {
    if (!selectedBot || !user || !embedName.trim()) { toast.error("Enter a name"); return; }
    setSaving(true);
    try {
      await supabase.from("saved_embeds").insert({ bot_id: selectedBot.id, user_id: user.id, name: embedName, embed_data: embed as any });
      toast.success("Embed saved!");
      const { data } = await supabase.from("saved_embeds").select("*").eq("bot_id", selectedBot.id).order("created_at", { ascending: false });
      setSavedEmbeds(data || []);
      setEmbedName("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const loadEmbed = (e: any) => {
    setEmbed(e.embed_data as EmbedData);
    setEmbedName(e.name);
    toast.success("Embed loaded");
  };

  const deleteEmbed = async (id: string) => {
    await supabase.from("saved_embeds").delete().eq("id", id);
    setSavedEmbeds(savedEmbeds.filter((e) => e.id !== id));
    toast.success("Deleted");
  };

  const copyJson = () => {
    const json = {
      title: embed.title || undefined,
      description: embed.description || undefined,
      color: parseInt(embed.color.replace("#", ""), 16),
      url: embed.url || undefined,
      thumbnail: embed.thumbnail ? { url: embed.thumbnail } : undefined,
      image: embed.image ? { url: embed.image } : undefined,
      footer: embed.footer_text ? { text: embed.footer_text, icon_url: embed.footer_icon || undefined } : undefined,
      author: embed.author_name ? { name: embed.author_name, icon_url: embed.author_icon || undefined, url: embed.author_url || undefined } : undefined,
      fields: embed.fields.length > 0 ? embed.fields : undefined,
      timestamp: embed.timestamp ? new Date().toISOString() : undefined,
    };
    navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    toast.success("JSON copied!");
  };

  const tabs = [
    { id: "general" as const, label: "General" },
    { id: "images" as const, label: "Images" },
    { id: "author" as const, label: "Author" },
    { id: "footer" as const, label: "Footer" },
    { id: "fields" as const, label: "Fields" },
  ];

  if (!selectedBot) return <div className="p-6"><p className="text-muted-foreground">Select a bot first.</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Palette className="w-6 h-6 text-primary" /> Embed Builder</h1>
        <p className="text-sm text-muted-foreground mt-1">Design rich Discord embeds with a visual editor</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Editor */}
        <div className="space-y-4">
          <div className="flex gap-1 p-1 rounded-lg bg-secondary">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
            ))}
          </div>

          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            {activeTab === "general" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Title</label>
                  <input type="text" value={embed.title} onChange={(e) => update("title", e.target.value)} placeholder="Embed title" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</label>
                  <textarea value={embed.description} onChange={(e) => update("description", e.target.value)} rows={4} placeholder="Embed description (supports markdown)" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="flex gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={embed.color} onChange={(e) => update("color", e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0" />
                      <input type="text" value={embed.color} onChange={(e) => update("color", e.target.value)} className="w-28 px-3 py-2.5 rounded-md bg-background border border-border text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">URL</label>
                    <input type="text" value={embed.url} onChange={(e) => update("url", e.target.value)} placeholder="https://" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => update("timestamp", !embed.timestamp)} className={`w-10 h-5 rounded-full transition-colors relative ${embed.timestamp ? "bg-primary" : "bg-secondary"}`}>
                    <div className={`w-4 h-4 rounded-full bg-background absolute top-0.5 transition-transform ${embed.timestamp ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                  <span className="text-xs text-muted-foreground">Show timestamp</span>
                </div>
              </>
            )}
            {activeTab === "images" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Thumbnail URL</label>
                  <input type="text" value={embed.thumbnail} onChange={(e) => update("thumbnail", e.target.value)} placeholder="https://..." className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Image URL</label>
                  <input type="text" value={embed.image} onChange={(e) => update("image", e.target.value)} placeholder="https://..." className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </>
            )}
            {activeTab === "author" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Author Name</label>
                  <input type="text" value={embed.author_name} onChange={(e) => update("author_name", e.target.value)} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Author Icon URL</label>
                  <input type="text" value={embed.author_icon} onChange={(e) => update("author_icon", e.target.value)} placeholder="https://..." className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Author URL</label>
                  <input type="text" value={embed.author_url} onChange={(e) => update("author_url", e.target.value)} placeholder="https://..." className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </>
            )}
            {activeTab === "footer" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Footer Text</label>
                  <input type="text" value={embed.footer_text} onChange={(e) => update("footer_text", e.target.value)} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Footer Icon URL</label>
                  <input type="text" value={embed.footer_icon} onChange={(e) => update("footer_icon", e.target.value)} placeholder="https://..." className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </>
            )}
            {activeTab === "fields" && (
              <>
                {embed.fields.map((f, i) => (
                  <div key={i} className="p-3 rounded-md bg-background border border-border space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground uppercase">Field {i + 1}</span>
                      <button onClick={() => removeField(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    <input type="text" value={f.name} onChange={(e) => updateField(i, "name", e.target.value)} placeholder="Field name" className="w-full px-2 py-1.5 rounded bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    <input type="text" value={f.value} onChange={(e) => updateField(i, "value", e.target.value)} placeholder="Field value" className="w-full px-2 py-1.5 rounded bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={f.inline} onChange={(e) => updateField(i, "inline", e.target.checked)} className="rounded" /> Inline
                    </label>
                  </div>
                ))}
                <button onClick={addField} className="w-full py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors flex items-center justify-center gap-2"><Plus className="w-3.5 h-3.5" /> Add Field</button>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <input type="text" value={embedName} onChange={(e) => setEmbedName(e.target.value)} placeholder="Embed name..." className="flex-1 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <button onClick={saveEmbed} disabled={saving} className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
            <button onClick={copyJson} className="px-4 py-2.5 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent flex items-center gap-2"><Copy className="w-4 h-4" /> JSON</button>
          </div>

          {/* Saved Embeds */}
          {savedEmbeds.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs font-medium text-card-foreground mb-2">Saved Embeds</h3>
              <div className="space-y-1">
                {savedEmbeds.map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-secondary/50">
                    <button onClick={() => loadEmbed(e)} className="text-sm text-card-foreground hover:text-primary">{e.name}</button>
                    <button onClick={() => deleteEmbed(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Discord Preview */}
        <div className="lg:sticky lg:top-6">
          <div className="flex items-center gap-2 mb-3"><Eye className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-foreground">Live Preview</h2></div>
          <div className="rounded-lg bg-[#313338] p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-bold">{selectedBot.bot_name[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{selectedBot.bot_name}</span>
                  <span className="text-[10px] bg-[#5865f2] text-white px-1 rounded">BOT</span>
                </div>
                <div className="mt-1 rounded overflow-hidden" style={{ borderLeft: `4px solid ${embed.color}` }}>
                  <div className="bg-[#2b2d31] p-3">
                    {embed.author_name && (
                      <div className="flex items-center gap-2 mb-1">
                        {embed.author_icon && <img src={embed.author_icon} alt="" className="w-5 h-5 rounded-full" />}
                        <span className="text-xs font-medium text-white">{embed.author_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <div className="flex-1">
                        {embed.title && <p className="text-sm font-semibold text-[#00a8fc] mb-1">{embed.title}</p>}
                        {embed.description && <p className="text-sm text-[#dcddde] whitespace-pre-wrap">{embed.description}</p>}
                        {embed.fields.length > 0 && (
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            {embed.fields.map((f, i) => (
                              <div key={i} className={f.inline ? "" : "col-span-3"}>
                                <p className="text-xs font-semibold text-white">{f.name}</p>
                                <p className="text-xs text-[#dcddde]">{f.value}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {embed.thumbnail && <img src={embed.thumbnail} alt="" className="w-16 h-16 rounded ml-3 object-cover" />}
                    </div>
                    {embed.image && <img src={embed.image} alt="" className="w-full rounded mt-2 max-h-48 object-cover" />}
                    {(embed.footer_text || embed.timestamp) && (
                      <div className="flex items-center gap-2 mt-2">
                        {embed.footer_icon && <img src={embed.footer_icon} alt="" className="w-4 h-4 rounded-full" />}
                        <span className="text-[10px] text-[#72767d]">
                          {embed.footer_text}{embed.footer_text && embed.timestamp && " • "}{embed.timestamp && new Date().toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
