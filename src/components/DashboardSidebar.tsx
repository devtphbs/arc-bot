import {
  LayoutDashboard, Terminal, Zap, Shield, RefreshCw, ScrollText, Settings, Bot, ChevronLeft, Plus, Circle,
  UserPlus, Heart, BarChart3, Trophy, Ticket, Palette, Medal, FileCode, Music, MessageSquare, Gift, Vote,
  Variable, Bell, Activity, DatabaseBackup,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBot } from "@/hooks/useBot";
import { ConnectBotModal } from "./ConnectBotModal";

const navSections = [
  {
    label: "Main",
    items: [
      { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
      { title: "Commands", url: "/dashboard/commands", icon: Terminal },
      { title: "Embed Builder", url: "/dashboard/embeds", icon: Palette },
    ],
  },
  {
    label: "Engagement",
    items: [
      { title: "Welcome", url: "/dashboard/welcome", icon: UserPlus },
      { title: "Reaction Roles", url: "/dashboard/reaction-roles", icon: Heart },
      { title: "Leveling & XP", url: "/dashboard/leveling", icon: Trophy },
      { title: "Leaderboard", url: "/dashboard/leaderboard", icon: Medal },
      { title: "Giveaways", url: "/dashboard/giveaways", icon: Gift },
      { title: "Polls", url: "/dashboard/polls", icon: Vote },
    ],
  },
  {
    label: "Modules",
    items: [
      { title: "Music", url: "/dashboard/music", icon: Music },
      { title: "Auto Responder", url: "/dashboard/auto-responder", icon: MessageSquare },
      { title: "Tickets", url: "/dashboard/tickets", icon: Ticket },
      { title: "Social Alerts", url: "/dashboard/social-alerts", icon: Bell },
      { title: "Variables", url: "/dashboard/variables", icon: Variable },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Events", url: "/dashboard/events", icon: Zap },
      { title: "Moderation", url: "/dashboard/moderation", icon: Shield },
      { title: "Automations", url: "/dashboard/automations", icon: RefreshCw },
      { title: "Analytics", url: "/dashboard/analytics", icon: BarChart3 },
      { title: "Logs", url: "/dashboard/logs", icon: ScrollText },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Status Monitor", url: "/dashboard/status", icon: Activity },
      { title: "Export Bot", url: "/dashboard/export", icon: FileCode },
      { title: "Backup & Restore", url: "/dashboard/backup", icon: DatabaseBackup },
      { title: "Settings", url: "/dashboard/settings", icon: Settings },
    ],
  },
];

export function DashboardSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { bots, selectedBot, selectBot } = useBot();

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const avatar = user?.user_metadata?.avatar_url;

  return (
    <>
      <aside className={cn("flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 shrink-0", collapsed ? "w-16" : "w-64")}>
        <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-gradient-primary flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground tracking-tight">ArcBot</span>
            </div>
          )}
          {collapsed && (
            <div className="w-7 h-7 rounded-md bg-gradient-primary flex items-center justify-center mx-auto">
              <Bot className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className={cn("p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors", collapsed && "mx-auto mt-2")}>
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>

        {!collapsed && (
          <div className="px-3 py-3 border-b border-sidebar-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 px-1">Bots</p>
            {bots.map((bot) => (
              <div key={bot.id} onClick={() => selectBot(bot)} className={cn("flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent cursor-pointer transition-colors", selectedBot?.id === bot.id && "bg-sidebar-accent")}>
                <Circle className={cn("w-2 h-2 fill-current", bot.status === "online" ? "text-success" : "text-muted-foreground")} />
                <span className="text-sm text-sidebar-accent-foreground truncate">{bot.bot_name}</span>
              </div>
            ))}
            <button onClick={() => setConnectOpen(true)} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent cursor-pointer transition-colors w-full text-muted-foreground hover:text-foreground mt-1">
              <Plus className="w-3 h-3" /><span className="text-sm">Add Bot</span>
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="mb-2">
              {!collapsed && <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 px-1 mt-2">{section.label}</p>}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.title} to={item.url} end={item.url === "/dashboard"} className={cn("flex items-center gap-3 px-2.5 py-1.5 rounded-md text-sm transition-all text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent", collapsed && "justify-center px-2")} activeClassName="bg-sidebar-accent text-primary font-medium glow-primary">
                    <item.icon className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {!collapsed && (
          <div className="px-4 py-3 border-t border-sidebar-border">
            <div className="flex items-center gap-2">
              {avatar ? (
                <img src={avatar} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-medium text-secondary-foreground">
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
                <button onClick={signOut} className="text-[10px] text-muted-foreground hover:text-primary transition-colors">Sign out</button>
              </div>
            </div>
          </div>
        )}
      </aside>
      <ConnectBotModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </>
  );
}
