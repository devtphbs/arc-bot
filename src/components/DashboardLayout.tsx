import { Outlet } from "react-router-dom";
import { DashboardSidebar } from "./DashboardSidebar";
import { BotProvider } from "@/hooks/useBot";
import { useState } from "react";
import { Menu, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useAuth();

  return (
    <BotProvider>
      <div className="flex min-h-screen w-full">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={cn(
          "fixed inset-y-0 left-0 z-50 lg:relative lg:z-0 transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <DashboardSidebar onNavigate={() => setMobileOpen(false)} />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {/* Mobile header */}
          <div className="sticky top-0 z-30 flex items-center justify-between h-12 px-4 border-b border-border bg-card/95 backdrop-blur-sm lg:hidden">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="text-sm font-semibold text-foreground">ArcBot</span>
            </div>
            <button
              onClick={signOut}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-gradient-glow min-h-screen">
            <Outlet />
          </div>
        </main>
      </div>
    </BotProvider>
  );
}
