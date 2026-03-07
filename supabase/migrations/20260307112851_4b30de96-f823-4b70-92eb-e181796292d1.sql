
-- Leveling/XP table
CREATE TABLE public.leveling_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  xp_per_message INTEGER NOT NULL DEFAULT 15,
  xp_cooldown INTEGER NOT NULL DEFAULT 60,
  level_up_channel TEXT,
  level_up_message TEXT DEFAULT 'Congratulations {user}, you reached level {level}!',
  role_rewards JSONB DEFAULT '[]'::jsonb,
  ignored_channels JSONB DEFAULT '[]'::jsonb,
  ignored_roles JSONB DEFAULT '[]'::jsonb,
  multipliers JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bot_id)
);

ALTER TABLE public.leveling_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own leveling config" ON public.leveling_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leveling config" ON public.leveling_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leveling config" ON public.leveling_config FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own leveling config" ON public.leveling_config FOR DELETE USING (auth.uid() = user_id);

-- Ticket system config
CREATE TABLE public.ticket_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  category_id TEXT,
  support_role_id TEXT,
  welcome_message TEXT DEFAULT 'Thank you for creating a ticket! Support will be with you shortly.',
  log_channel_id TEXT,
  max_tickets_per_user INTEGER NOT NULL DEFAULT 3,
  ticket_categories JSONB DEFAULT '[{"name":"General Support","emoji":"🎫","description":"General questions and help"},{"name":"Bug Report","emoji":"🐛","description":"Report a bug"},{"name":"Feature Request","emoji":"💡","description":"Suggest a feature"}]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bot_id)
);

ALTER TABLE public.ticket_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ticket config" ON public.ticket_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ticket config" ON public.ticket_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ticket config" ON public.ticket_config FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ticket config" ON public.ticket_config FOR DELETE USING (auth.uid() = user_id);

-- Saved embeds table
CREATE TABLE public.saved_embeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  embed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_embeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own embeds" ON public.saved_embeds FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own embeds" ON public.saved_embeds FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own embeds" ON public.saved_embeds FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own embeds" ON public.saved_embeds FOR DELETE USING (auth.uid() = user_id);
