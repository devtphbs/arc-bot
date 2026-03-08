
-- Auto backups table
CREATE TABLE public.auto_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  backup_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  backup_type text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backups" ON public.auto_backups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own backups" ON public.auto_backups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own backups" ON public.auto_backups FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Downtime alerts table
CREATE TABLE public.downtime_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  alert_type text NOT NULL DEFAULT 'downtime',
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.downtime_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON public.downtime_alerts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON public.downtime_alerts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON public.downtime_alerts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON public.downtime_alerts FOR DELETE TO authenticated USING (auth.uid() = user_id);
