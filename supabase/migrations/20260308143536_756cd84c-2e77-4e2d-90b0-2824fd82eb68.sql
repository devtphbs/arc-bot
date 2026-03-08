
CREATE TABLE public.custom_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_command TEXT,
  script_code TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scripts" ON public.custom_scripts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scripts" ON public.custom_scripts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scripts" ON public.custom_scripts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scripts" ON public.custom_scripts FOR DELETE USING (auth.uid() = user_id);
