CREATE TYPE public.ai_job_kind AS ENUM ('import_analyze', 'cutout', 'on_model', 'wishlist_resolve', 'outfit_on_model');
CREATE TYPE public.ai_job_status AS ENUM ('queued', 'processing', 'complete', 'failed', 'canceled');
CREATE TYPE public.credit_kind AS ENUM ('import', 'on_model');

-- ============ ai_jobs ============
CREATE TABLE public.ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.ai_job_kind NOT NULL,
  status public.ai_job_status NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL,
  garment_id UUID REFERENCES public.garments(id) ON DELETE SET NULL,
  outfit_id UUID REFERENCES public.outfits(id) ON DELETE SET NULL,
  wishlist_item_id UUID REFERENCES public.wishlist_items(id) ON DELETE SET NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  progress SMALLINT NOT NULL DEFAULT 0,
  stage TEXT,
  error_message TEXT,
  attempts SMALLINT NOT NULL DEFAULT 0,
  credit_kind public.credit_kind,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_jobs_idempotency_unique UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX ai_jobs_owner_status_idx ON public.ai_jobs (owner_id, status);
GRANT SELECT ON public.ai_jobs TO authenticated;
GRANT ALL ON public.ai_jobs TO service_role;
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_jobs_select_own" ON public.ai_jobs FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER ai_jobs_updated_at BEFORE UPDATE ON public.ai_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ credit_balances ============
CREATE TABLE public.credit_balances (
  owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  import_allowance INTEGER NOT NULL DEFAULT 10,
  import_balance INTEGER NOT NULL DEFAULT 10,
  on_model_allowance INTEGER NOT NULL DEFAULT 5,
  on_model_balance INTEGER NOT NULL DEFAULT 5,
  garment_allowance INTEGER NOT NULL DEFAULT 40,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_balances TO authenticated;
GRANT ALL ON public.credit_balances TO service_role;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_balances_select_own" ON public.credit_balances FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER credit_balances_updated_at BEFORE UPDATE ON public.credit_balances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ credit_ledger ============
CREATE TABLE public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.credit_kind NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ai_job_id UUID REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_ledger_owner_idx ON public.credit_ledger (owner_id, created_at DESC);
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_ledger_select_own" ON public.credit_ledger FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- ============ subscriptions ============
CREATE TABLE public.subscriptions (
  owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'inactive',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_customer_idx ON public.subscriptions (stripe_customer_id);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ billing_events (server only) ============
CREATE TABLE public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- ============ analytics_events ============
CREATE TABLE public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_name_idx ON public.analytics_events (name, created_at DESC);
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_select_own" ON public.analytics_events FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- ============ credits bootstrap on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  founder_email TEXT;
  is_founder_user BOOLEAN := false;
BEGIN
  SELECT NULLIF(lower(trim(value)), '') INTO founder_email FROM public.app_config WHERE key = 'founder_email';
  IF founder_email IS NOT NULL AND lower(NEW.email) = founder_email THEN
    is_founder_user := true;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, is_founder)
  VALUES (NEW.id, NEW.email, NULLIF(NEW.raw_user_meta_data->>'display_name', ''), is_founder_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_founder_user THEN 'founder'::public.app_role ELSE 'member'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.wardrobes (owner_id, name, is_primary)
  VALUES (NEW.id, 'My wardrobe', true);

  INSERT INTO public.credit_balances (owner_id, import_allowance, import_balance, on_model_allowance, on_model_balance, garment_allowance)
  VALUES (
    NEW.id,
    CASE WHEN is_founder_user THEN 100000 ELSE 10 END,
    CASE WHEN is_founder_user THEN 100000 ELSE 10 END,
    CASE WHEN is_founder_user THEN 100000 ELSE 5 END,
    CASE WHEN is_founder_user THEN 100000 ELSE 5 END,
    CASE WHEN is_founder_user THEN 100000 ELSE 40 END
  )
  ON CONFLICT (owner_id) DO NOTHING;

  INSERT INTO public.subscriptions (owner_id, plan, status)
  VALUES (NEW.id, CASE WHEN is_founder_user THEN 'founder' ELSE 'none' END,
                 CASE WHEN is_founder_user THEN 'active' ELSE 'inactive' END)
  ON CONFLICT (owner_id) DO NOTHING;

  RETURN NEW;
END; $$;

-- ============ lock down internal functions ============
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM anon;