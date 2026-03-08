import { motion } from "framer-motion";
import { Download, FileCode, Terminal, Copy, CheckCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { toast } from "sonner";

export default function DashboardExport() {
  const { selectedBot } = useBot();
  const [script, setScript] = useState<string | null>(null);
  const [filename, setFilename] = useState("bot.py");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateScript = async () => {
    if (!selectedBot) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-python", {
        body: { bot_id: selectedBot.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setScript(data.script);
      setFilename(data.filename);
      toast.success("Python script generated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate script");
    } finally {
      setLoading(false);
    }
  };

  const downloadScript = () => {
    if (!script) return;
    const blob = new Blob([script], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyScript = () => {
    if (!script) return;
    navigator.clipboard.writeText(script);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <FileCode className="w-6 h-6 text-primary" /> Export Bot
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Download a Python script of your bot to run locally on your PC</p>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select a bot first.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Info */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-3">How it works</h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>1. Click <strong className="text-foreground">Generate Script</strong> to create a Python bot with all your commands, leveling, moderation, and status settings.</p>
              <p>2. Install Python 3.8+ and run <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">pip install discord.py</code></p>
              <p>3. Set your bot token as an environment variable or paste it in the script.</p>
              <p>4. Run <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">python {filename}</code> — your bot goes online 24/7 on your machine!</p>
            </div>
          </motion.div>

          {/* Generate */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <button
              onClick={generateScript}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
              {loading ? "Generating…" : "Generate Python Script"}
            </button>
          </motion.div>

          {/* Script Preview */}
          {script && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/50">
                <span className="text-xs font-mono text-muted-foreground">{filename}</span>
                <div className="flex items-center gap-2">
                  <button onClick={copyScript} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button onClick={downloadScript} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                    <Download className="w-3 h-3" /> Download
                  </button>
                </div>
              </div>
              <pre className="p-4 text-xs font-mono text-foreground overflow-x-auto max-h-[500px] overflow-y-auto leading-relaxed">
                {script}
              </pre>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
