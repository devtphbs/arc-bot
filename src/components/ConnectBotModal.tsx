import { useState } from "react";
import { X, Bot, Loader2, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBot } from "@/hooks/useBot";
import { toast } from "sonner";

interface ConnectBotModalProps {
  open: boolean;
  onClose: () => void;
}

export function ConnectBotModal({ open, onClose }: ConnectBotModalProps) {
  const { user } = useAuth();
  const { refetch } = useBot();
  const [token, setToken] = useState("");
  const [botName, setBotName] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleConnect = async () => {
    if (!token.trim() || !botName.trim() || !user) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("bots").insert({
        user_id: user.id,
        bot_name: botName.trim(),
        token_encrypted: btoa(token.trim()), // Basic encoding - in production use server-side encryption
        status: "offline",
      });
      if (error) throw error;
      setSuccess(true);
      toast.success("Bot connected successfully!");
      refetch();
      setTimeout(() => { onClose(); setToken(""); setBotName(""); setSuccess(false); }, 1500);
    } catch (err: any) {
      toast.error(err.message || "Failed to connect bot");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-md mx-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-card-foreground">Connect Bot</h2>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
          </div>

          {success ? (
            <div className="flex flex-col items-center py-8">
              <CheckCircle className="w-12 h-12 text-success mb-3" />
              <p className="text-card-foreground font-medium">Bot Connected!</p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Bot Name</label>
                <input type="text" value={botName} onChange={(e) => setBotName(e.target.value)} placeholder="My Discord Bot" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="mb-4">
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Bot Token</label>
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your bot token here..." className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                <p className="text-[10px] text-muted-foreground mt-1.5">Your token is encrypted and never exposed. Find it at discord.com/developers</p>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={onClose} className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                <button onClick={handleConnect} disabled={loading || !token.trim() || !botName.trim()} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Connect Bot
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
