import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { BotProvider } from "@/hooks/useBot";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { DashboardLayout } from "./components/DashboardLayout";
import DashboardOverview from "./pages/DashboardOverview";
import DashboardCommands from "./pages/DashboardCommands";
import DashboardEvents from "./pages/DashboardEvents";
import DashboardModeration from "./pages/DashboardModeration";
import DashboardAutomations from "./pages/DashboardAutomations";
import DashboardLogs from "./pages/DashboardLogs";
import DashboardSettings from "./pages/DashboardSettings";
import DashboardWelcome from "./pages/DashboardWelcome";
import DashboardReactionRoles from "./pages/DashboardReactionRoles";
import CommandBuilder from "./pages/CommandBuilder";

const queryClient = new QueryClient();

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<DashboardOverview />} />
                <Route path="commands" element={<DashboardCommands />} />
                <Route path="welcome" element={<DashboardWelcome />} />
                <Route path="reaction-roles" element={<DashboardReactionRoles />} />
                <Route path="events" element={<DashboardEvents />} />
                <Route path="moderation" element={<DashboardModeration />} />
                <Route path="automations" element={<DashboardAutomations />} />
                <Route path="logs" element={<DashboardLogs />} />
                <Route path="settings" element={<DashboardSettings />} />
              </Route>
              <Route path="/dashboard/command-builder" element={<ProtectedRoute><BotProvider><CommandBuilder /></BotProvider></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
