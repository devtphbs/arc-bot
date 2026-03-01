import { Outlet } from "react-router-dom";
import { DashboardSidebar } from "./DashboardSidebar";

export function DashboardLayout() {
  return (
    <div className="flex min-h-screen w-full">
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-gradient-glow min-h-screen">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
