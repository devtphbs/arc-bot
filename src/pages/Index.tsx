import { motion } from "framer-motion";
import { Bot, ArrowRight, Terminal, Shield, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const features = [
  { icon: Terminal, title: "Visual Command Builder", desc: "Create slash, prefix, and context menu commands with embeds, buttons, and conditions" },
  { icon: Shield, title: "Auto Moderation", desc: "Spam filters, word filters, and raid protection out of the box" },
  { icon: Zap, title: "Automations", desc: "Schedule messages, auto-assign roles, and trigger workflows" },
];

export default function Index() {
  const navigate = useNavigate();
  const { user, signInWithDiscord, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-lg tracking-tight">ArcBot</span>
        </div>
        {user ? (
          <button onClick={() => navigate("/dashboard")} className="px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary">
            Open Dashboard
          </button>
        ) : (
          <button onClick={signInWithDiscord} disabled={loading} className="px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50">
            Login with Discord
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-gradient-glow absolute inset-0 pointer-events-none" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
            <Zap className="w-3 h-3" /> No coding required
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
            Build your Discord bot <span className="text-gradient-primary">visually</span>
          </h1>
          <p className="text-muted-foreground mt-4 text-lg max-w-md mx-auto">
            Connect your bot, create commands, and deploy features — all from a beautiful dashboard.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            {user ? (
              <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 px-6 py-3 rounded-md bg-gradient-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity glow-primary">
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={signInWithDiscord} disabled={loading} className="flex items-center gap-2 px-6 py-3 rounded-md bg-gradient-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50">
                Get Started with Discord <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-4xl w-full">
          {features.map((f, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-6 text-left hover:border-primary/30 transition-colors">
              <div className="p-2 rounded-md bg-primary/10 w-fit mb-3"><f.icon className="w-5 h-5 text-primary" /></div>
              <h3 className="text-sm font-medium text-card-foreground">{f.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>

      <footer className="text-center py-6 text-xs text-muted-foreground border-t border-border">
        ArcBot — Built for Discord communities
      </footer>
    </div>
  );
}
