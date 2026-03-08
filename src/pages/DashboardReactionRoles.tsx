import { motion } from "framer-motion";
import { Heart, Plus, Trash2, Save, Loader2, Info, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { DiscordEntityPicker } from "@/components/DiscordEntityPicker";

interface ReactionRole {
  id: string;
  emoji: string;
  roleName: string;
  roleId: string;
}

interface ReactionRoleGroup {
  id: string;
  name: string;
  channelId: string;
  messageText: string;
  roles: ReactionRole[];
}

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const EMOJI_OPTIONS = ["👍", "❤️", "⭐", "🎮", "🎵", "🎨", "📚", "💻", "🏆", "🔥", "✅", "🎯", "🛡️", "⚡", "🌟", "🎭"];

export default function DashboardReactionRoles() {
  const { selectedBot } = useBot();
  const { user } = useAuth();
  const [groups, setGroups] = useState<ReactionRoleGroup[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedBot) return;
    supabase
      .from("bot_modules")
      .select("*")
      .eq("bot_id", selectedBot.id)
      .eq("module_name", "reaction_roles")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.config) {
          const cfg = data.config as { groups?: ReactionRoleGroup[] };
          if (cfg.groups) setGroups(cfg.groups);
        }
      });
  }, [selectedBot?.id]);

  const addGroup = () => {
    setGroups((p) => [
      ...p,
      {
        id: createId(),
        name: "New Role Menu",
        channelId: "",
        messageText: "React to get your roles!",
        roles: [{ id: createId(), emoji: "⭐", roleName: "Member", roleId: "" }],
      },
    ]);
  };

  const updateGroup = (id: string, updates: Partial<ReactionRoleGroup>) => {
    setGroups((p) => p.map((g) => (g.id === id ? { ...g, ...updates } : g)));
  };

  const deleteGroup = (id: string) => {
    setGroups((p) => p.filter((g) => g.id !== id));
  };

  const addRole = (groupId: string) => {
    setGroups((p) =>
      p.map((g) =>
        g.id === groupId
          ? { ...g, roles: [...g.roles, { id: createId(), emoji: "👍", roleName: "", roleId: "" }] }
          : g,
      ),
    );
  };

  const updateRole = (groupId: string, roleId: string, updates: Partial<ReactionRole>) => {
    setGroups((p) =>
      p.map((g) =>
        g.id === groupId
          ? { ...g, roles: g.roles.map((r) => (r.id === roleId ? { ...r, ...updates } : r)) }
          : g,
      ),
    );
  };

  const deleteRole = (groupId: string, roleId: string) => {
    setGroups((p) =>
      p.map((g) =>
        g.id === groupId ? { ...g, roles: g.roles.filter((r) => r.id !== roleId) } : g,
      ),
    );
  };

  const saveConfig = async () => {
    if (!selectedBot || !user) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("bot_modules")
        .select("id")
        .eq("bot_id", selectedBot.id)
        .eq("module_name", "reaction_roles")
        .maybeSingle();

      const config = { groups } as unknown as Json;

      if (existing) {
        await supabase.from("bot_modules").update({ config, enabled: true }).eq("id", existing.id);
      } else {
        await supabase.from("bot_modules").insert({
          bot_id: selectedBot.id,
          user_id: user.id,
          module_name: "reaction_roles",
          enabled: true,
          config,
        });
      }
      toast.success("Reaction roles saved!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const deployPanel = async (group: ReactionRoleGroup) => {
    if (!selectedBot || !group.channelId) return;
    try {
      const res = await supabase.functions.invoke("discord-interactions", {
        body: {
          action: "deploy_reaction_role_panel",
          bot_id: selectedBot.id,
          channel_id: group.channelId,
          message_text: group.messageText,
          roles: group.roles,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data as any;
      if (data?.error) throw new Error(data.error);
      toast.success("Role panel deployed to channel!");
    } catch (err: any) {
      toast.error(err.message || "Failed to deploy panel");
    }
  };

  if (!selectedBot) return <div className="p-6 lg:p-8"><p className="text-muted-foreground">Select a bot first.</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reaction Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">Let members pick roles by reacting to messages</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addGroup} className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors">
            <Plus className="w-4 h-4" /> Add Menu
          </button>
          <button onClick={saveConfig} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity glow-primary disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </motion.div>

      {/* How it works */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-lg border border-info/20 bg-info/5 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-card-foreground font-medium">How Reaction Roles Work</p>
          <p className="text-xs text-muted-foreground mt-1">
            1. Create a role menu below with emoji → role mappings<br />
            2. Your bot posts the message in the specified channel<br />
            3. Members react to the message and automatically get the role assigned
          </p>
        </div>
      </motion.div>

      {groups.length === 0 && (
        <div className="mt-8 text-center py-12">
          <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No reaction role menus yet.</p>
          <button onClick={addGroup} className="mt-3 text-sm text-primary hover:text-primary/80 transition-colors">Create your first one →</button>
        </div>
      )}

      <div className="space-y-4 mt-6">
        {groups.map((group, gi) => (
          <motion.div key={group.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <input
                type="text"
                value={group.name}
                onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                className="text-sm font-medium text-card-foreground bg-transparent border-none outline-none focus:ring-0 p-0"
                placeholder="Menu Name"
              />
              <button onClick={() => deleteGroup(group.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <DiscordEntityPicker type="channel" value={group.channelId} onChange={(v) => updateGroup(group.id, { channelId: v })} label="Channel" placeholder="Select a channel" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Message</label>
                <textarea value={group.messageText} onChange={(e) => updateGroup(group.id, { messageText: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Role Mappings</label>
                  <button onClick={() => addRole(group.id)} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Role
                  </button>
                </div>
                <div className="space-y-2">
                  {group.roles.map((role) => (
                    <div key={role.id} className="flex items-center gap-2">
                      <select value={role.emoji} onChange={(e) => updateRole(group.id, role.id, { emoji: e.target.value })} className="w-16 px-2 py-2 rounded-md bg-background border border-border text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring">
                        {EMOJI_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                      <input type="text" value={role.roleName} onChange={(e) => updateRole(group.id, role.id, { roleName: e.target.value })} placeholder="Role name" className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      <div className="w-48">
                        <DiscordEntityPicker type="role" value={role.roleId} onChange={(v) => updateRole(group.id, role.id, { roleId: v })} placeholder="Select role" />
                      </div>
                      <button onClick={() => deleteRole(group.id, role.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mini preview & Deploy */}
            <div className="mt-4 flex items-end gap-3">
              <div className="flex-1 rounded-md bg-background border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preview</p>
                <p className="text-sm text-card-foreground">{group.messageText}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {group.roles.map((r) => (
                    <span key={r.id} className="px-2 py-1 rounded bg-secondary text-xs">{r.emoji} {r.roleName || "Role"}</span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => deployPanel(group)}
                disabled={!group.channelId || group.roles.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
              >
                <Send className="w-4 h-4" /> Deploy
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
