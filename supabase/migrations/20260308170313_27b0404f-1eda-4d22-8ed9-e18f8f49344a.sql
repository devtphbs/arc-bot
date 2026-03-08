
CREATE TABLE public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  channel_id TEXT NOT NULL,
  message_content TEXT NOT NULL,
  embed_data JSONB,
  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  recurring TEXT DEFAULT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled messages" ON public.scheduled_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scheduled messages" ON public.scheduled_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scheduled messages" ON public.scheduled_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scheduled messages" ON public.scheduled_messages FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.server_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.server_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bot owners can view server events" ON public.server_events FOR SELECT USING (EXISTS (SELECT 1 FROM bots WHERE bots.id = server_events.bot_id AND bots.user_id = auth.uid()));
CREATE POLICY "Service can manage server events" ON public.server_events FOR ALL USING (true) WITH CHECK (true);
