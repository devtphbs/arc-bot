import { motion } from "framer-motion";
import { Ticket, Plus, Trash2, Loader2, MessageSquarePlus } from "lucide-react";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";

interface TicketCategory {
  name: string;
  emoji: string;
  description: string;
}

export default function DashboardTickets() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState("Thank you for creating a ticket! Support will be with you shortly.");
  const [maxTickets, setMaxTickets] = useState(3);
  const [supportRoleId, setSupportRoleId] = useState("");
  const [logChannelId, setLogChannelId] = useState("");
  const [categories, setCategories] = useState<TicketCategory[]>([
    { name: "General Support", emoji: "🎫", description: "General questions and help" },
    { name: "Bug Report", emoji: "🐛", description: "Report a bug" },
    { name: "Feature Request", emoji: "💡", description: "Suggest a feature" },
  ]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("📩");
  const [newCatDesc, setNewCatDesc] = useState("");

  useEffect(() => {
    if (!selectedBot) return;
    setLoading(true);
    supabase
      .from("ticket_config")
      .select("*")
      .eq("bot_id", selectedBot.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEnabled(data.enabled);
          setWelcomeMessage(data.welcome_message || "");
          setMaxTickets(data.max_tickets_per_user);
          setSupportRoleId(data.support_role_id || "");
          setLogChannelId(data.log_channel_id || "");
          setCategories((data.ticket_categories as unknown as TicketCategory[]) || []);
        }
        setLoading(false);
      });
  }, [selectedBot]);

  const save = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      const payload = {
        bot_id: selectedBot.id,
        user_id: user.id,
        enabled,
        welcome_message: welcomeMessage,
        max_tickets_per_user: maxTickets,
        support_role_id: supportRoleId || null,
        log_channel_id: logChannelId || null,
        ticket_categories: categories as any,
      };
      const { data: existing } = await supabase.from("ticket_config").select("id").eq("bot_id", selectedBot.id).maybeSingle();
      if (existing) {
        await supabase.from("ticket_config").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("ticket_config").insert(payload);
      }
      toast.success("Ticket config saved!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    setCategories([...categories, { name: newCatName, emoji: newCatEmoji, description: newCatDesc }]);
    setNewCatName("");
    setNewCatEmoji("📩");
    setNewCatDesc("");
  };

  if (!selectedBot) return <div className="p-6"><p className="text-muted-foreground">Select a bot first.</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Ticket className="w-6 h-6 text-primary" /> Ticket System</h1>
        <p className="text-sm text-muted-foreground mt-1">Let members create support tickets managed by your bot</p>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6 mt-8">
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-card-foreground">Enable Ticket System</h2>
                <p className="text-xs text-muted-foreground mt-1">Members can create tickets via a panel or slash command</p>
              </div>
              <button onClick={() => setEnabled(!enabled)} className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? "bg-primary" : "bg-secondary"}`}>
                <div className={`w-5 h-5 rounded-full bg-background absolute top-0.5 transition-transform ${enabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
          </motion.div>

          {/* Settings */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-4"><MessageSquarePlus className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Ticket Settings</h2></div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Welcome Message</label>
                <textarea value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                <p className="text-[10px] text-muted-foreground mt-1">Variables: <code className="font-mono text-primary">{'{user}'}</code> <code className="font-mono text-primary">{'{ticket_id}'}</code> <code className="font-mono text-primary">{'{category}'}</code></p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Support Role ID</label>
                  <input type="text" value={supportRoleId} onChange={(e) => setSupportRoleId(e.target.value)} placeholder="Role ID that can see tickets" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Log Channel ID</label>
                  <input type="text" value={logChannelId} onChange={(e) => setLogChannelId(e.target.value)} placeholder="Channel for ticket transcripts" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Max Tickets Per User</label>
                <input type="number" value={maxTickets} onChange={(e) => setMaxTickets(parseInt(e.target.value) || 1)} min={1} max={10} className="w-24 px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
          </motion.div>

          {/* Categories */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-4">Ticket Categories</h2>
            <div className="space-y-2 mb-4">
              {categories.map((cat, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-md bg-background border border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{cat.name}</p>
                      <p className="text-[10px] text-muted-foreground">{cat.description}</p>
                    </div>
                  </div>
                  <button onClick={() => setCategories(categories.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="w-16">
                <label className="text-[10px] text-muted-foreground block mb-1">Emoji</label>
                <input type="text" value={newCatEmoji} onChange={(e) => setNewCatEmoji(e.target.value)} className="w-full px-2 py-2 rounded-md bg-background border border-border text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground block mb-1">Name</label>
                <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" className="w-full px-2 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground block mb-1">Description</label>
                <input type="text" value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} placeholder="Short description" className="w-full px-2 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <button onClick={addCategory} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90"><Plus className="w-4 h-4" /></button>
            </div>
          </motion.div>

          {/* Discord Preview */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-3">Ticket Panel Preview</h2>
            <div className="rounded-md bg-[#2b2d31] p-4 border border-[#1e1f22]">
              <div className="border-l-4 border-primary rounded p-3 bg-[#2b2d31]">
                <p className="text-sm font-semibold text-white mb-1">🎫 Create a Ticket</p>
                <p className="text-xs text-[#b5bac1]">Select a category below to create a support ticket.</p>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {categories.map((cat, i) => (
                  <button key={i} className="px-3 py-1.5 rounded bg-[#4e5058] text-white text-xs hover:bg-[#6d6f78] transition-colors">
                    {cat.emoji} {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          <button onClick={save} disabled={saving} className="w-full py-3 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Ticket Config"}
          </button>
        </div>
      )}
    </div>
  );
}
