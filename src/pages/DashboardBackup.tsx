import { motion } from "framer-motion";
import { DatabaseBackup, Download, Upload, Loader2, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type BackupPayload = {
  version: number;
  exported_at: string;
  source: string;
  bot: {
    name: string;
    prefix: string;
  };
  data: {
    commands: any[];
    automations: any[];
    modules: any[];
    embeds: any[];
    leveling_config: any | null;
    ticket_config: any | null;
  };
};

const stripMeta = (row: any) => {
  if (!row) return row;
  const { id, user_id, bot_id, created_at, updated_at, ...rest } = row;
  return rest;
};

export default function DashboardBackup() {
  const { selectedBot, refetch } = useBot();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [backupJson, setBackupJson] = useState<BackupPayload | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const exportBackup = async () => {
    if (!selectedBot) return;

    setExporting(true);
    try {
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

      const payload: BackupPayload = {
        version: 1,
        exported_at: new Date().toISOString(),
        source: "ArcBot Dashboard",
        bot: {
          name: selectedBot.bot_name,
          prefix: selectedBot.prefix || "!",
        },
        data: {
          commands: (commandsRes.data || []).map(stripMeta),
          automations: (automationsRes.data || []).map(stripMeta),
          modules: (modulesRes.data || []).map(stripMeta),
          embeds: (embedsRes.data || []).map(stripMeta),
          leveling_config: stripMeta(levelingRes.data),
          ticket_config: stripMeta(ticketRes.data),
        },
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

  const loadBackupFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed?.data || typeof parsed !== "object") {
        throw new Error("Invalid backup file format");
      }

      setBackupJson(parsed as BackupPayload);
      toast.success("Backup file loaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to read backup file");
    }
  };

  const restoreBackup = async () => {
    if (!selectedBot || !user || !backupJson) return;

    const confirmed = window.confirm("This will replace current bot configuration for the selected bot. Continue?");
    if (!confirmed) return;

    const mapRecords = (rows: any[] = []) => rows.map((row) => ({ ...stripMeta(row), user_id: user.id, bot_id: selectedBot.id }));

    setRestoring(true);
    try {
      await Promise.all([
        supabase.from("commands").delete().eq("bot_id", selectedBot.id),
        supabase.from("automations").delete().eq("bot_id", selectedBot.id),
        supabase.from("bot_modules").delete().eq("bot_id", selectedBot.id),
        supabase.from("saved_embeds").delete().eq("bot_id", selectedBot.id),
        supabase.from("leveling_config").delete().eq("bot_id", selectedBot.id),
        supabase.from("ticket_config").delete().eq("bot_id", selectedBot.id),
      ]);

      const inserts = [];

      if (backupJson.data.commands?.length) {
        inserts.push(supabase.from("commands").insert(mapRecords(backupJson.data.commands)));
      }
      if (backupJson.data.automations?.length) {
        inserts.push(supabase.from("automations").insert(mapRecords(backupJson.data.automations)));
      }
      if (backupJson.data.modules?.length) {
        inserts.push(supabase.from("bot_modules").insert(mapRecords(backupJson.data.modules)));
      }
      if (backupJson.data.embeds?.length) {
        inserts.push(supabase.from("saved_embeds").insert(mapRecords(backupJson.data.embeds)));
      }
      if (backupJson.data.leveling_config) {
        inserts.push(supabase.from("leveling_config").insert([{ ...stripMeta(backupJson.data.leveling_config), user_id: user.id, bot_id: selectedBot.id }]));
      }
      if (backupJson.data.ticket_config) {
        inserts.push(supabase.from("ticket_config").insert([{ ...stripMeta(backupJson.data.ticket_config), user_id: user.id, bot_id: selectedBot.id }]));
      }

      const insertResults = await Promise.all(inserts);
      const firstInsertError = insertResults.find((r) => r.error)?.error;
      if (firstInsertError) throw firstInsertError;

      if (backupJson.bot?.prefix) {
        const { error: prefixError } = await supabase
          .from("bots")
          .update({ prefix: backupJson.bot.prefix })
          .eq("id", selectedBot.id);
        if (prefixError) throw prefixError;
      }

      await refetch();
      toast.success("Backup restored successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to restore backup");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <DatabaseBackup className="w-6 h-6 text-primary" /> Backup & Restore
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Export your full bot configuration and restore it anytime</p>
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select a bot first.</p>
      ) : (
        <div className="mt-6 space-y-6">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-2">Export Config Backup</h2>
            <p className="text-xs text-muted-foreground mb-4">Includes commands, automations, modules, tickets, leveling and embeds for this bot.</p>
            <button
              onClick={exportBackup}
              disabled={exporting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting ? "Exporting…" : "Download Backup JSON"}
            </button>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-card-foreground mb-2">Restore Config Backup</h2>
            <p className="text-xs text-muted-foreground mb-4">Load a backup file and replace the selected bot's current configuration.</p>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadBackupFile(file);
              }}
            />

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors"
              >
                <Upload className="w-4 h-4" /> Choose Backup File
              </button>

              <button
                onClick={restoreBackup}
                disabled={!backupJson || restoring}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {restoring ? "Restoring…" : "Restore to Selected Bot"}
              </button>
            </div>

            {backupJson && (
              <p className="text-xs text-muted-foreground mt-3">
                Loaded backup from <span className="text-foreground">{new Date(backupJson.exported_at).toLocaleString()}</span>
                {backupJson.bot?.name ? ` (${backupJson.bot.name})` : ""}
              </p>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
