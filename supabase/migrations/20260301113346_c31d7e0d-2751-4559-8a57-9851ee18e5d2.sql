-- Create update_updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_id TEXT,
  discord_username TEXT,
  discord_avatar TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, discord_id, discord_username, discord_avatar)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'provider_id',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Bots table
CREATE TABLE public.bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_name TEXT NOT NULL,
  bot_id TEXT,
  bot_avatar TEXT,
  token_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  guild_count INTEGER DEFAULT 0,
  prefix TEXT DEFAULT '!',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bots" ON public.bots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own bots" ON public.bots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own bots" ON public.bots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own bots" ON public.bots FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_bots_updated_at BEFORE UPDATE ON public.bots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Command type enum
CREATE TYPE public.command_type AS ENUM ('slash', 'prefix', 'context');

-- Commands table
CREATE TABLE public.commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type public.command_type NOT NULL DEFAULT 'slash',
  enabled BOOLEAN NOT NULL DEFAULT true,
  uses INTEGER NOT NULL DEFAULT 0,
  permissions TEXT[] DEFAULT '{}',
  responses JSONB DEFAULT '[]',
  embed JSONB,
  buttons JSONB DEFAULT '[]',
  conditions JSONB DEFAULT '[]',
  cooldown INTEGER DEFAULT 0,
  ephemeral BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own commands" ON public.commands FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own commands" ON public.commands FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own commands" ON public.commands FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own commands" ON public.commands FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_commands_updated_at BEFORE UPDATE ON public.commands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bot modules
CREATE TABLE public.bot_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own modules" ON public.bot_modules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own modules" ON public.bot_modules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own modules" ON public.bot_modules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own modules" ON public.bot_modules FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_bot_modules_updated_at BEFORE UPDATE ON public.bot_modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bot logs
CREATE TABLE public.bot_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  source TEXT DEFAULT 'system',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own logs" ON public.bot_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own logs" ON public.bot_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_logs;

-- Automations table
CREATE TABLE public.automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'schedule',
  trigger_config JSONB DEFAULT '{}',
  actions JSONB DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own automations" ON public.automations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own automations" ON public.automations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own automations" ON public.automations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own automations" ON public.automations FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();