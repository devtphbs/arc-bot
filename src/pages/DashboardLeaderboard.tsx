import { motion } from "framer-motion";
import { Trophy, Medal, Crown, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBot } from "@/hooks/useBot";

interface UserLevel {
  id: string;
  user_id: string;
  guild_id: string;
  xp: number;
  level: number;
}

export default function DashboardLeaderboard() {
  const { selectedBot } = useBot();
  const [levels, setLevels] = useState<UserLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [guildFilter, setGuildFilter] = useState<string>("all");

  useEffect(() => {
    if (!selectedBot) { setLevels([]); setLoading(false); return; }

    const fetch = async () => {
      setLoading(true);
      let query = supabase
        .from("user_levels")
        .select("*")
        .eq("bot_id", selectedBot.id)
        .order("xp", { ascending: false })
        .limit(100);

      if (guildFilter !== "all") {
        query = query.eq("guild_id", guildFilter);
      }

      const { data } = await query;
      setLevels((data as UserLevel[]) || []);
      setLoading(false);
    };

    fetch();
  }, [selectedBot?.id, guildFilter]);

  const guilds = [...new Set(levels.map((l) => l.guild_id))];
  const xpForLevel = (lvl: number) => 5 * lvl * lvl + 50 * lvl + 100;

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground">#{index + 1}</span>;
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" /> Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">XP rankings across your servers</p>
        </div>
        {guilds.length > 1 && (
          <select
            value={guildFilter}
            onChange={(e) => setGuildFilter(e.target.value)}
            className="px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Servers</option>
            {guilds.map((g) => (
              <option key={g} value={g}>Server {g.slice(0, 8)}…</option>
            ))}
          </select>
        )}
      </motion.div>

      {!selectedBot ? (
        <p className="text-muted-foreground mt-8">Select a bot first.</p>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : levels.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No XP data yet. Users earn XP by chatting in your servers.</p>
        </motion.div>
      ) : (
        <div className="mt-6 space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[40px_1fr_80px_100px_1fr] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">
            <span>Rank</span>
            <span>User</span>
            <span className="text-center">Level</span>
            <span className="text-right">XP</span>
            <span>Progress</span>
          </div>

          {levels.map((entry, i) => {
            const xpNeeded = xpForLevel(entry.level);
            let xpInLevel = entry.xp;
            for (let l = 1; l < entry.level; l++) xpInLevel -= xpForLevel(l);
            const progress = Math.min((xpInLevel / xpNeeded) * 100, 100);

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`grid grid-cols-[40px_1fr_80px_100px_1fr] gap-3 items-center px-4 py-3 rounded-lg border transition-colors ${
                  i === 0 ? "border-yellow-500/30 bg-yellow-500/5" :
                  i === 1 ? "border-gray-400/20 bg-gray-400/5" :
                  i === 2 ? "border-amber-600/20 bg-amber-600/5" :
                  "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-center">{getRankIcon(i)}</div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-foreground truncate">
                    User {entry.user_id.slice(0, 8)}…
                  </p>
                  <p className="text-[10px] text-muted-foreground">Server {entry.guild_id.slice(0, 6)}…</p>
                </div>
                <div className="text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                    {entry.level}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground text-right font-mono">{entry.xp.toLocaleString()}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(progress)}%</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
