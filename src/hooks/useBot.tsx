import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

type Bot = Tables<"bots">;

interface BotContextType {
  bots: Bot[];
  selectedBot: Bot | null;
  selectBot: (bot: Bot) => void;
  loading: boolean;
  refetch: () => void;
}

const BotContext = createContext<BotContextType | undefined>(undefined);

export function BotProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBots = async () => {
    if (!user) { setBots([]); setSelectedBot(null); setLoading(false); return; }
    const { data } = await supabase.from("bots").select("*").order("created_at");
    if (data) {
      setBots(data);
      if (!selectedBot && data.length > 0) setSelectedBot(data[0]);
      else if (selectedBot) {
        const updated = data.find((b) => b.id === selectedBot.id);
        if (updated) setSelectedBot(updated);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchBots(); }, [user]);

  return (
    <BotContext.Provider value={{ bots, selectedBot, selectBot: setSelectedBot, loading, refetch: fetchBots }}>
      {children}
    </BotContext.Provider>
  );
}

export function useBot() {
  const context = useContext(BotContext);
  if (!context) throw new Error("useBot must be used within BotProvider");
  return context;
}
