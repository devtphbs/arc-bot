
CREATE TABLE public.active_polls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  votes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended BOOLEAN NOT NULL DEFAULT false,
  multiple_choice BOOLEAN NOT NULL DEFAULT false,
  anonymous BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.active_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bot owners can view polls" ON public.active_polls FOR SELECT USING (EXISTS (SELECT 1 FROM bots WHERE bots.id = active_polls.bot_id AND bots.user_id = auth.uid()));
CREATE POLICY "Bot owners can insert polls" ON public.active_polls FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM bots WHERE bots.id = active_polls.bot_id AND bots.user_id = auth.uid()));
CREATE POLICY "Bot owners can update polls" ON public.active_polls FOR UPDATE USING (EXISTS (SELECT 1 FROM bots WHERE bots.id = active_polls.bot_id AND bots.user_id = auth.uid()));
CREATE POLICY "Bot owners can delete polls" ON public.active_polls FOR DELETE USING (EXISTS (SELECT 1 FROM bots WHERE bots.id = active_polls.bot_id AND bots.user_id = auth.uid()));
CREATE POLICY "Service can manage active polls" ON public.active_polls FOR ALL USING (true) WITH CHECK (true);
