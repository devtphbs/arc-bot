DROP POLICY IF EXISTS "Service can insert levels" ON public.user_levels;
DROP POLICY IF EXISTS "Service can update levels" ON public.user_levels;

CREATE POLICY "Bot owners can insert levels" ON public.user_levels
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.bots WHERE bots.id = user_levels.bot_id AND bots.user_id = auth.uid())
  );

CREATE POLICY "Bot owners can update levels" ON public.user_levels
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.bots WHERE bots.id = user_levels.bot_id AND bots.user_id = auth.uid())
  );