CREATE TABLE IF NOT EXISTS public.user_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  guild_id text NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  last_xp_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bot_id, user_id, guild_id)
);

ALTER TABLE public.user_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bot owners can view levels" ON public.user_levels
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bots WHERE bots.id = user_levels.bot_id AND bots.user_id = auth.uid())
  );

CREATE POLICY "Bot owners can delete levels" ON public.user_levels
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.bots WHERE bots.id = user_levels.bot_id AND bots.user_id = auth.uid())
  );

CREATE POLICY "Service can insert levels" ON public.user_levels
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update levels" ON public.user_levels
  FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_levels;