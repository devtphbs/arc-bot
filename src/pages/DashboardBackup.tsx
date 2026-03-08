import { motion } from "framer-motion";
import { DatabaseBackup, Download, Upload, Loader2, RefreshCw, Clock, History, Trash2, Eye, ArrowRight, Info } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type BackupPayload = {
  version: number;
  exported_at: string;
  source: string;
  bot: { name: string; prefix: string };
  data: {
    commands: any[];
    automations: any[];
    modules: any[];
    embeds: any[];
    leveling_config: any | null;
    ticket_config: any | null;
  };
};

type DiffResult = {
  commands: { added: number; removed: number; changed: number };
  automations: { added: number; removed: number; changed: number };
  modules: { added: number; removed: number; changed: number };
  embeds: { added: number; removed: number; changed: number };
  leveling: string;
  tickets: string;
  prefix: string;
};

const stripMeta = (row: any) => {
  if (!row) return row;
  const { id, user_id, bot_id, created_at, updated_at, ...rest } = row;
  return rest;
};

const computeDiff = (current: BackupPayload["data"], incoming: BackupPayload["data"], currentPrefix: string, incomingPrefix: string): DiffResult => {
  const diffSection = (cur: any[], inc: any[]) => ({
    added: Math.max(0, inc.length - cur.length),
    removed: Math.max(0, cur.length - inc.length),
    changed: Math.min(cur.length, inc.length),
  });

  return {
    commands: diffSection(current.commands || [], incoming.commands || []),
    automations: diffSection(current.automations || [], incoming.automations || []),
    modules: diffSection(current.modules || [], incoming.modules || []),
    embeds: diffSection(current.embeds || [], incoming.embeds || []),
    leveling: !current.leveling_config && !incoming.leveling_config ? "unchanged" : !incoming.leveling_config ? "will be removed" : !current.leveling_config ? "will be added" : "will be replaced",
    tickets: !current.ticket_config && !incoming.ticket_config ? "unchanged" : !incoming.ticket_config ? "will be removed" : !current.ticket_config ? "will be added" : "will be replaced",
    prefix: currentPrefix === incomingPrefix ? "unchanged" : `${currentPrefix} → ${incomingPrefix}`,
  };
};

export default function DashboardBackup() {
  const { selectedBot, refetch } = useBot();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [backupJson, setBackupJson] = useState<BackupPayload | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [autoBackups, setAutoBackups] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [savingAutoSetting, setSavingAutoSetting] = useState(false);

  // Load auto backup history and settings
  useEffect(() => {
    if (!selectedBot || !user) return;
    setLoadingHistory(true);
    Promise.all([
      supabase.from("auto_backups").select("id, backup_type, created_at").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id).eq("module_name", "auto_backup").maybeSingle(),
    ]).then(([{ data: backups }, { data: mod }]) => {
      setAutoBackups(backups || []);
      setAutoBackupEnabled(mod?.enabled || false);
      setLoadingHistory(false);
    });
  }, [selectedBot?.id, user]);

  const toggleAutoBackup = async () => {
    if (!selectedBot || !user) return;
    setSavingAutoSetting(true);
    try {
      const newValue = !autoBackupEnabled;
      const { data: existing } = await supabase.from("bot_modules").select("id").eq("bot_id", selectedBot.id).eq("module_name", "auto_backup").maybeSingle();
      if (existing) {
        await supabase.from("bot_modules").update({ enabled: newValue }).eq("id", existing.id);
      } else {
        await supabase.from("bot_modules").insert({ bot_id: selectedBot.id, user_id: user.id, module_name: "auto_backup", enabled: newValue, config: { interval: "daily", keep: 7 } });
      }
      setAutoBackupEnabled(newValue);
      toast.success(newValue ? "Auto-backup enabled" : "Auto-backup disabled");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingAutoSetting(false);
    }
  };

  const getCurrentData = async () => {
    if (!selectedBot) return null;
    const [commandsRes, automationsRes, modulesRes, embedsRes, levelingRes, ticketRes] = await Promise.all([
      supabase.from("commands").select("*").eq("bot_id", selectedBot.id),
      supabase.from("automations").select("*").eq("bot_id", selectedBot.id),
      supabase.from("bot_modules").select("*").eq("bot_id", selectedBot.id),
      supabase.from("saved_embeds").select("*").eq("bot_id", selectedBot.id),
      supabase.from("leveling_config").select("*").eq("bot_id", selectedBot.id).maybeSingle(),
      supabase.from("ticket_config").select("*").eq("bot_id", selectedBot.id).maybeSingle(),
    ]);
    const firstError = [commandsRes, automationsRes, modulesRes, embedsRes, levelingRes, ticketRes].find((r) => r.error)?.error;
    if (firstError) throw firstError;
    return {
      commands: (commandsRes.data || []).map(stripMeta),
      automations: (automationsRes.data || []).map(stripMeta),
      modules: (modulesRes.data || []).map(stripMeta),
      embeds: (embedsRes.data || []).map(stripMeta),
      leveling_config: stripMeta(levelingRes.data),
      ticket_config: stripMeta(ticketRes.data),
    };
  };

  const exportBackup = async () => {
    if (!selectedBot) return;
    setExporting(true);
    try {
      const data = await getCurrentData();
      if (!data) throw new Error("Failed to fetch data");
      const payload: BackupPayload = {
        version: 1,
        exported_at: new Date().toISOString(),
        source: "ArcBot Dashboard",
        bot: { name: selectedBot.bot_name, prefix: selectedBot.prefix || "!" },
        data,
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedBot.bot_name.toLowerCase().replace(/\s+/g, "-")}-backup.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup exported");
    } catch (err: any) {
      toast.error(err.message || "Failed to export backup");
    } finally {
      setExporting(false);
    }
  };

  const createAutoBackup = async () => {
    if (!selectedBot || !user) return;
    try {
      const data = await getCurrentData();
      if (!data) return;
      const payload: BackupPayload = {
        version: 1,
        exported_at: new Date().toISOString(),
        source: "ArcBot Auto-Backup",
        bot: { name: selectedBot.bot_name, prefix: selectedBot.prefix || "!" },
        data,
      };
      await supabase.from("auto_backups").insert({
        bot_id: selectedBot.id,
        user_id: user.id,
        backup_data: payload as any,
        backup_type: "manual",
      });
      // Refresh list
      const { data: backups } = await supabase.from("auto_backups").select("id, backup_type, created_at").eq("bot_id", selectedBot.id).order("created_at", { ascending: false }).limit(10);
      setAutoBackups(backups || []);
      toast.success("Backup snapshot saved");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const loadAutoBackup = async (backupId: string) => {
    try {
      const { data, error } = await supabase.from("auto_backups").select("backup_data").eq("id", backupId).single();
      if (error) throw error;
      const parsed = data.backup_data as unknown as BackupPayload;
      setBackupJson(parsed);
      // Compute diff
      const currentData = await getCurrentData();
      if (currentData && parsed.data) {
        const d = computeDiff(currentData, parsed.data, selectedBot?.prefix || "!", parsed.bot?.prefix || "!");
        setDiff(d);
        setShowDiff(true);
      }
      toast.success("Backup loaded from history");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const deleteAutoBackup = async (backupId: string) => {
    await supabase.from("auto_backups").delete().eq("id", backupId);
    setAutoBackups((p) => p.filter((b) => b.id !== backupId));
    toast.success("Backup deleted");
  };

  const loadBackupFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.data || typeof parsed !== "object") throw new Error("Invalid backup file format");
      setBackupJson(parsed as BackupPayload);
      // Compute diff
      const currentData = await getCurrentData();
      if (currentData && parsed.data) {
        const d = computeDiff(currentData, parsed.data, selectedBot?.prefix || "!", parsed.bot?.prefix || "!");
        setDiff(d);
        setShowDiff(true);
      }
      toast.success("Backup file loaded — review changes below");
    } catch (err: any) {
      toast.error(err.message || "Failed to read backup file");
    }
  };

  const restoreBackup = async () => {
    if (!selectedBot || !user || !backupJson) return;
    const mapRecords = (rows: any[] = []) => rows.map((row) => ({ ...stripMeta(row), user_id: user.id, bot_id: selectedBot.id }));
    setRestoring(true);
    try {
      // Auto-save current state before restoring
      await createAutoBackup();

      await Promise.all([
        supabase.from("commands").delete().eq("bot_id", selectedBot.id),
        supabase.from("automations").delete().eq("bot_id", selectedBot.id),
        supabase.from("bot_modules").delete().eq("bot_id", selectedBot.id),
        supabase.from("saved_embeds").delete().eq("bot_id", selectedBot.id),
        supabase.from("leveling_config").delete().eq("bot_id", selectedBot.id),
        supabase.from("ticket_config").delete().eq("bot_id", selectedBot.id),
      ]);

      const inserts = [];
      if (backupJson.data.commands?.length) inserts.push(supabase.from("commands").insert(mapRecords(backupJson.data.commands)));
      if (backupJson.data.automations?.length) inserts.push(supabase.from("automations").insert(mapRecords(backupJson.data.automations)));
      if (backupJson.data.modules?.length) inserts.push(supabase.from("bot_modules").insert(mapRecords(backupJson.data.modules)));
      if (backupJson.data.embeds?.length) inserts.push(supabase.from("saved_embeds").insert(mapRecords(backupJson.data.embeds)));
      if (backupJson.data.leveling_config) inserts.push(supabase.from("leveling_config").insert([{ ...stripMeta(backupJson.data.leveling_config), user_id: user.id, bot_id: selectedBot.id }]));
      if (backupJson.data.ticket_config) inserts.push(supabase.from("ticket_config").insert([{ ...stripMeta(backupJson.data.ticket_config), user_id: user.id, bot_id: selectedBot.id }]));

      const insertResults = await Promise.all(inserts);
      const firstInsertError = insertResults.find((r) => r.error)?.error;
      if (firstInsertError) throw firstInsertError;

      if (backupJson.bot?.prefix) {
        await supabase.from("bots").update({ prefix: backupJson.bot.prefix }).eq("id", selectedBot.id);
      }

      await refetch();
      setDiff(null);
      setShowDiff(false);
      setBackupJson(null);
      toast.success("Backup restored successfully (previous state saved to history)");
    } catch (err: any) {
      toast.error(err.message || "Failed to restore backup");
    } finally {
      setRestoring(false);
    }
  };

  const DiffBadge = ({ label, data }: { label: string; data: { added: number; removed: number; changed: number } }) => (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-card-foreground">{label}</span>
      <div className="flex items-center gap-2 text-xs">
        {data.added > 0 && <span className="text-success">+{data.added} new</span>}
        {data.removed > 0 && <span className="text-destructive">-{data.removed} removed</span>}
        {data.changed > 0 && <span className="text-warning">~{data.changed} replaced</span>}
        {data.added === 0 && data.removed === 0 && data.changed === 0 && <span className="text-muted-foreground">no changes</span>}
      </div>
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <DatabaseBackup className="w-6 h-6 text-primary" /> Backup & Restore
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Export, restore, and auto-backup your full bot configuration. Backups include all commands, automations, modules, embeds, leveling, and ticket settings.</p>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select a bot first.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Auto Backup Toggle */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10"><Clock className="w-5 h-5 text-primary" /></div>
                <div>
                  <h2 className="text-sm font-medium text-card-foreground">Auto Backup</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Automatically save a backup snapshot every time you start/restart your bot. Keeps last 7 snapshots.</p>
                </div>
              </div>
              <button onClick={toggleAutoBackup} disabled={savingAutoSetting} className={cn("w-12 h-6 rounded-full transition-colors relative", autoBackupEnabled ? "bg-primary" : "bg-secondary")}>
                <div className={cn("w-5 h-5 rounded-full bg-background absolute top-0.5 transition-transform", autoBackupEnabled ? "translate-x-6" : "translate-x-0.5")} />
              </button>
            </div>
          </motion.div>

          {/* Export */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-1">Export Config Backup</h2>
            <p className="text-xs text-muted-foreground mb-4">Downloads a JSON file with all your bot's commands, automations, modules, embeds, leveling, and ticket settings.</p>
            <div className="flex gap-2">
              <button onClick={exportBackup} disabled={exporting} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exporting ? "Exporting…" : "Download Backup"}
              </button>
              <button onClick={createAutoBackup} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors">
                <History className="w-4 h-4" /> Save Snapshot
              </button>
            </div>
          </motion.div>

          {/* Backup History */}
          {autoBackups.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium text-card-foreground mb-1">Backup History</h2>
              <p className="text-xs text-muted-foreground mb-3">Click any snapshot to preview changes before restoring.</p>
              <div className="space-y-1">
                {autoBackups.map((b) => (
                  <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-secondary/50 transition-colors group">
                    <div className="flex items-center gap-3">
                      <History className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-card-foreground">{new Date(b.created_at).toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{b.backup_type} backup</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => loadAutoBackup(b.id)} className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors" title="Load & preview diff">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteAutoBackup(b.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Restore */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-1">Restore Config Backup</h2>
            <p className="text-xs text-muted-foreground mb-4">Upload a backup JSON file to preview and apply. Your current config is automatically saved to history before restoring.</p>

            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void loadBackupFile(file); }} />

            <div className="flex flex-wrap gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors">
                <Upload className="w-4 h-4" /> Choose Backup File
              </button>
            </div>

            {backupJson && (
              <p className="text-xs text-muted-foreground mt-3">
                Loaded backup from <span className="text-foreground">{new Date(backupJson.exported_at).toLocaleString()}</span>
                {backupJson.bot?.name ? ` (${backupJson.bot.name})` : ""}
              </p>
            )}
          </motion.div>

          {/* Diff Preview */}
          {showDiff && diff && backupJson && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-warning/30 bg-warning/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-5 h-5 text-warning" />
                <h2 className="text-sm font-medium text-card-foreground">Changes Preview</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-3">These changes will be applied when you restore. Your current config will be auto-saved to history first.</p>
              <div className="rounded-md bg-background border border-border p-3">
                <DiffBadge label="Commands" data={diff.commands} />
                <DiffBadge label="Automations" data={diff.automations} />
                <DiffBadge label="Modules" data={diff.modules} />
                <DiffBadge label="Embeds" data={diff.embeds} />
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-card-foreground">Leveling Config</span>
                  <span className="text-xs text-muted-foreground">{diff.leveling}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-sm text-card-foreground">Ticket Config</span>
                  <span className="text-xs text-muted-foreground">{diff.tickets}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-card-foreground">Prefix</span>
                  <span className="text-xs text-muted-foreground font-mono">{diff.prefix}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={restoreBackup} disabled={restoring} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {restoring ? "Restoring…" : "Apply Restore"}
                </button>
                <button onClick={() => { setShowDiff(false); setDiff(null); setBackupJson(null); }} className="px-4 py-2.5 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
