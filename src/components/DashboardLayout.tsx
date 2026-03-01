import { Outlet } from "react-router-dom";
import { DashboardSidebar } from "./DashboardSidebar";
import { BotProvider } from "@/hooks/useBot";

export function DashboardLayout() {
  return (
    <BotProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="bg-gradient-glow min-h-screen">
            <Outlet />
          </div>
        </main>
      </div>
    </BotProvider>
  );
}
