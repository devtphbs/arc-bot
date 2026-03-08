
-- Active giveaways tracking
CREATE TABLE public.active_giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  channel_id text NOT NULL,
  guild_id text NOT NULL,
  prize text NOT NULL,
  winners_count integer NOT NULL DEFAULT 1,
  ends_at timestamp with time zone NOT NULL,
  ended boolean NOT NULL DEFAULT false,
  color text DEFAULT '#FFD700',
  end_color text DEFAULT '#FF4444',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Giveaway entries
CREATE TABLE public.giveaway_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES public.active_giveaways(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(giveaway_id, user_id)
);

ALTER TABLE public.active_giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_entries ENABLE ROW LEVEL SECURITY;

-- RLS for active_giveaways: bot owners can manage
CREATE POLICY "Bot owners can view giveaways" ON public.active_giveaways FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM bots WHERE bots.id = active_giveaways.bot_id AND bots.user_id = auth.uid()));
CREATE POLICY "Bot owners can insert giveaways" ON public.active_giveaways FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM bots WHERE bots.id = active_giveaways.bot_id AND bots.user_id = auth.uid()));
CREATE POLICY "Bot owners can update giveaways" ON public.active_giveaways FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM bots WHERE bots.id = active_giveaways.bot_id AND bots.user_id = auth.uid()));
CREATE POLICY "Bot owners can delete giveaways" ON public.active_giveaways FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM bots WHERE bots.id = active_giveaways.bot_id AND bots.user_id = auth.uid()));

-- Service role will handle entries (from edge functions), so allow all for service role via permissive policies
-- For entries, we need service role access (edge functions use service role)
CREATE POLICY "Service can manage entries" ON public.giveaway_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service can manage active giveaways" ON public.active_giveaways FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Update ticket_config: change support_role_id to support_role_ids (jsonb array)
ALTER TABLE public.ticket_config ADD COLUMN IF NOT EXISTS support_role_ids jsonb DEFAULT '[]'::jsonb;
