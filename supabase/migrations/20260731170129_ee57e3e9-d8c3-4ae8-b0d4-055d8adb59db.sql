-- Extend subscriptions for Stripe
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS price_id text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_pkey;
ALTER TABLE public.subscriptions ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_owner_env_key
  ON public.subscriptions (owner_id, environment);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_key
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Keep provisioning working with the new conflict target
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.subscriptions (owner_id, plan, status, environment)
  VALUES (NEW.id, CASE WHEN is_founder_user THEN 'founder' ELSE 'none' END,
                 CASE WHEN is_founder_user THEN 'active' ELSE 'inactive' END,
                 'sandbox')
  ON CONFLICT (owner_id, environment) DO NOTHING;

  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.provision_account(_user_id uuid, _email text, _display_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  founder_email TEXT;
  is_founder_user BOOLEAN := false;
BEGIN
  SELECT NULLIF(lower(trim(value)), '') INTO founder_email FROM public.app_config WHERE key = 'founder_email';
  IF founder_email IS NOT NULL AND lower(coalesce(_email, '')) = founder_email THEN
    is_founder_user := true;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, is_founder)
  VALUES (_user_id, _email, NULLIF(_display_name, ''), is_founder_user)
  ON CONFLICT (id) DO UPDATE SET is_founder = EXCLUDED.is_founder OR public.profiles.is_founder;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, CASE WHEN is_founder_user THEN 'founder'::public.app_role ELSE 'member'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.wardrobes (owner_id, name, is_primary)
  SELECT _user_id, 'My wardrobe', true
  WHERE NOT EXISTS (SELECT 1 FROM public.wardrobes WHERE owner_id = _user_id);

  INSERT INTO public.credit_balances (owner_id, import_allowance, import_balance, on_model_allowance, on_model_balance, garment_allowance)
  VALUES (
    _user_id,
    CASE WHEN is_founder_user THEN 100000 ELSE 10 END,
    CASE WHEN is_founder_user THEN 100000 ELSE 10 END,
    CASE WHEN is_founder_user THEN 100000 ELSE 5 END,
    CASE WHEN is_founder_user THEN 100000 ELSE 5 END,
    CASE WHEN is_founder_user THEN 100000 ELSE 40 END
  )
  ON CONFLICT (owner_id) DO NOTHING;

  INSERT INTO public.subscriptions (owner_id, plan, status, environment)
  VALUES (_user_id,
          CASE WHEN is_founder_user THEN 'founder' ELSE 'none' END,
          CASE WHEN is_founder_user THEN 'active' ELSE 'inactive' END,
          'sandbox')
  ON CONFLICT (owner_id, environment) DO NOTHING;
END;
$function$;

-- Access helpers
CREATE OR REPLACE FUNCTION public.has_vault_access(_user_id uuid, _environment text DEFAULT 'sandbox')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.is_founder
  ) OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.owner_id = _user_id
      AND s.environment = _environment
      AND (
        (s.status IN ('active', 'trialing', 'past_due', 'founder')
          AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.garment_count(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int FROM public.garments
  WHERE owner_id = _user_id AND deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.has_vault_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.garment_count(uuid) TO authenticated;