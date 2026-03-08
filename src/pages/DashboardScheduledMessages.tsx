import { motion } from "framer-motion";
import { Plus, Clock, Trash2, ToggleLeft, ToggleRight, Send, Repeat, CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DiscordEntityPicker } from "@/components/DiscordEntityPicker";
interface ScheduledMessage {
  id: string;
  bot_id: string;
  user_id: string;
  channel_id: string;
  message_content: string;
  embed_data: any;
  send_at: string;
  recurring: string | null;
  enabled: boolean;
  last_sent_at: string | null;
  created_at: string;
}

const RECURRING_OPTIONS = [
  { value: "", label: "One-time" },
  { value: "every_hour", label: "Every Hour" },
  { value: "every_6h", label: "Every 6 Hours" },
  { value: "every_12h", label: "Every 12 Hours" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export default function DashboardScheduledMessages() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [channelId, setChannelId] = useState("");
  const [content, setContent] = useState("");
  const [sendAt, setSendAt] = useState("");
  const [recurring, setRecurring] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchMessages = async () => {
    if (!selectedBot) return;
    const { data } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("bot_id", selectedBot.id)
      .order("send_at", { ascending: true });
    if (data) setMessages(data as ScheduledMessage[]);
  };

  useEffect(() => { fetchMessages(); }, [selectedBot?.id]);

  const createMessage = async () => {
    if (!selectedBot || !user || !channelId.trim() || !content.trim() || !sendAt) return;
    setLoading(true);
    const { error } = await supabase.from("scheduled_messages").insert({
      bot_id: selectedBot.id,
      user_id: user.id,
      channel_id: channelId.trim(),
      message_content: content.trim(),
      send_at: new Date(sendAt).toISOString(),
      recurring: recurring || null,
      enabled: true,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Scheduled message created");
    setChannelId("");
    setContent("");
    setSendAt("");
    setRecurring("");
    fetchMessages();
  };

  const toggleEnabled = async (msg: ScheduledMessage) => {
    await supabase.from("scheduled_messages").update({ enabled: !msg.enabled }).eq("id", msg.id);
    setMessages((p) => p.map((m) => m.id === msg.id ? { ...m, enabled: !m.enabled } : m));
  };

  const deleteMessage = async (id: string) => {
    await supabase.from("scheduled_messages").delete().eq("id", id);
    setMessages((p) => p.filter((m) => m.id !== id));
    toast.success("Scheduled message deleted");
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleString();
  };

  const isPast = (d: string) => new Date(d) < new Date();

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground">Scheduled Messages</h1>
        <p className="text-sm text-muted-foreground mt-1">Schedule messages to be sent to channels at specific times</p>
      </motion.div>

      {!selectedBot ? <p className="text-muted-foreground mt-8">Select a bot first.</p> : (
        <>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-medium text-card-foreground">New Scheduled Message</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <DiscordEntityPicker type="channel" value={channelId} onChange={setChannelId} label="Channel" placeholder="Select channel" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Send At</label>
                <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Message Content</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Hello! This is a scheduled message." rows={3} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Recurring</label>
                <select value={recurring} onChange={(e) => setRecurring(e.target.value)} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  {RECURRING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button onClick={createMessage} disabled={loading || !channelId.trim() || !content.trim() || !sendAt} className="h-10 px-5 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 shrink-0">
                <Plus className="w-4 h-4" /> Schedule
              </button>
            </div>
          </motion.div>

          <div className="space-y-3 mt-6">
            {messages.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No scheduled messages yet.</p>}
            {messages.map((msg, i) => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className={cn("flex items-center justify-between p-4 rounded-lg border bg-card", msg.enabled ? "border-border" : "border-border/50 opacity-60")}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={cn("p-2 rounded-md", msg.recurring ? "bg-accent/10" : "bg-primary/10")}>
                    {msg.recurring ? <Repeat className="w-4 h-4 text-accent-foreground" /> : <Send className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-card-foreground truncate">{msg.message_content}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-muted-foreground font-mono">Channel: {msg.channel_id}</span>
                      <span className={cn("text-[10px] font-mono", isPast(msg.send_at) && !msg.recurring ? "text-destructive" : "text-muted-foreground")}>
                        <CalendarClock className="w-3 h-3 inline mr-1" />
                        {formatDate(msg.send_at)}
                      </span>
                      {msg.recurring && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-foreground">{RECURRING_OPTIONS.find((o) => o.value === msg.recurring)?.label || msg.recurring}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <button onClick={() => toggleEnabled(msg)} className="text-muted-foreground hover:text-foreground transition-colors">
                    {msg.enabled ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button onClick={() => deleteMessage(msg.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
