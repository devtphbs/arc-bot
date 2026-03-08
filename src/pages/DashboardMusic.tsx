import { motion } from "framer-motion";
import { Music, Volume2, ListMusic, Shield, Save, Loader2, Info } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";

interface MusicConfig {
  enabled: boolean;
  djRoleId: string;
  djOnly: boolean;
  defaultVolume: number;
  maxQueueSize: number;
  allowDuplicates: boolean;
  autoplay: boolean;
  announceNowPlaying: boolean;
  nowPlayingChannel: string;
  maxSongDuration: number;
  voteSkipPercentage: number;
  disconnectOnEmpty: boolean;
  disconnectTimeout: number;
}

const DEFAULT_CONFIG: MusicConfig = {
  enabled: false,
  djRoleId: "",
  djOnly: false,
  defaultVolume: 50,
  maxQueueSize: 100,
  allowDuplicates: false,
  autoplay: false,
  announceNowPlaying: true,
  nowPlayingChannel: "",
  maxSongDuration: 600,
  voteSkipPercentage: 50,
  disconnectOnEmpty: true,
  disconnectTimeout: 300,
};

export default function DashboardMusic() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [config, setConfig] = useState<MusicConfig>({ ...DEFAULT_CONFIG });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBot) return;
    supabase
      .from("bot_modules")
      .select("*")
      .eq("bot_id", selectedBot.id)
      .eq("module_name", "music")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.config) {
          const c = data.config as Record<string, unknown>;
          setConfig({ ...DEFAULT_CONFIG, ...c, enabled: data.enabled });
        }
      });
  }, [selectedBot?.id]);

  const update = <K extends keyof MusicConfig>(key: K, value: MusicConfig[K]) =>
    setConfig((p) => ({ ...p, [key]: value }));

  const save = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      const { enabled, ...rest } = config;
      const { data: existing } = await supabase
        .from("bot_modules")
        .select("id")
        .eq("bot_id", selectedBot.id)
        .eq("module_name", "music")
        .maybeSingle();

      if (existing) {
        await supabase.from("bot_modules").update({ enabled, config: rest as unknown as Json }).eq("id", existing.id);
      } else {
        await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: "music", enabled, config: rest as unknown as Json });
      }
      toast.success("Music config saved!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!selectedBot) return <div className="p-6"><p className="text-muted-foreground">Select a bot first.</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Music className="w-6 h-6 text-primary" /> Music Module
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure music playback for your bot</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-info/20 bg-info/5 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-card-foreground font-medium">Music in your exported Python bot</p>
          <p className="text-xs text-muted-foreground mt-1">
            Music playback requires a persistent connection. Configure settings here, then export your bot via <strong className="text-foreground">Export Bot</strong> to run locally with full music support using <code className="font-mono text-primary">wavelink</code> or <code className="font-mono text-primary">discord.py[voice]</code>.
          </p>
        </div>
      </motion.div>

      <div className="space-y-6 mt-6">
        {/* Enable Toggle */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div><h2 className="text-sm font-medium text-card-foreground">Enable Music Module</h2><p className="text-xs text-muted-foreground mt-1">Adds music commands: /play, /skip, /queue, /pause, /stop, /volume, /nowplaying</p></div>
            <button onClick={() => update("enabled", !config.enabled)} className={cn("w-12 h-6 rounded-full transition-colors relative", config.enabled ? "bg-primary" : "bg-secondary")}>
              <div className={cn("w-5 h-5 rounded-full bg-background absolute top-0.5 transition-transform", config.enabled ? "translate-x-6" : "translate-x-0.5")} />
            </button>
          </div>
        </motion.div>

        {/* Playback Settings */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-4"><Volume2 className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Playback Settings</h2></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Default Volume (%)</label>
              <input type="number" value={config.defaultVolume} onChange={(e) => update("defaultVolume", parseInt(e.target.value) || 50)} min={1} max={100} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Max Song Duration (sec)</label>
              <input type="number" value={config.maxSongDuration} onChange={(e) => update("maxSongDuration", parseInt(e.target.value) || 600)} min={30} max={7200} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Vote Skip (%)</label>
              <input type="number" value={config.voteSkipPercentage} onChange={(e) => update("voteSkipPercentage", parseInt(e.target.value) || 50)} min={1} max={100} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Disconnect Timeout (sec)</label>
              <input type="number" value={config.disconnectTimeout} onChange={(e) => update("disconnectTimeout", parseInt(e.target.value) || 300)} min={10} max={3600} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {([
              ["announceNowPlaying", "Announce now playing in channel"],
              ["autoplay", "Auto-play related songs when queue is empty"],
              ["allowDuplicates", "Allow duplicate songs in queue"],
              ["disconnectOnEmpty", "Disconnect when voice channel is empty"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 py-1 cursor-pointer">
                <button onClick={() => update(key, !config[key])} className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", config[key] ? "bg-primary" : "bg-secondary")}>
                  <div className={cn("w-4 h-4 rounded-full bg-background absolute top-0.5 transition-transform", config[key] ? "translate-x-4" : "translate-x-0.5")} />
                </button>
                <span className="text-sm text-card-foreground">{label}</span>
              </label>
            ))}
          </div>
        </motion.div>

        {/* Queue Settings */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-4"><ListMusic className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">Queue Settings</h2></div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Max Queue Size</label>
            <input type="number" value={config.maxQueueSize} onChange={(e) => update("maxQueueSize", parseInt(e.target.value) || 100)} min={1} max={1000} className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="mt-3">
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Now Playing Channel ID</label>
            <input type="text" value={config.nowPlayingChannel} onChange={(e) => update("nowPlayingChannel", e.target.value)} placeholder="Leave empty for same channel" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </motion.div>

        {/* DJ Settings */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-4"><Shield className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium text-card-foreground">DJ Mode</h2></div>
          <label className="flex items-center gap-3 py-1 cursor-pointer mb-3">
            <button onClick={() => update("djOnly", !config.djOnly)} className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", config.djOnly ? "bg-primary" : "bg-secondary")}>
              <div className={cn("w-4 h-4 rounded-full bg-background absolute top-0.5 transition-transform", config.djOnly ? "translate-x-4" : "translate-x-0.5")} />
            </button>
            <span className="text-sm text-card-foreground">Restrict music commands to DJ role</span>
          </label>
          {config.djOnly && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">DJ Role ID</label>
              <input type="text" value={config.djRoleId} onChange={(e) => update("djRoleId", e.target.value)} placeholder="Role ID" className="w-full px-3 py-2.5 rounded-md bg-background border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          )}
        </motion.div>

        {/* Commands preview */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Included Commands</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {["/play", "/pause", "/resume", "/skip", "/stop", "/queue", "/nowplaying", "/volume", "/shuffle", "/loop", "/remove", "/clear"].map((cmd) => (
              <div key={cmd} className="px-3 py-2 rounded-md bg-background border border-border">
                <span className="text-sm font-mono text-primary">{cmd}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
