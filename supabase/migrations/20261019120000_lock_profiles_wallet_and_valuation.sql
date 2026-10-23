-- Privilege lock, atomic refunds, trial spend, and resale valuation.
-- Apply this in the Supabase SQL editor or via `supabase db push`. Do not edit earlier migrations.

-- ============ profiles: members may not grant themselves founder or billing rights ============
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (
  display_name,
  onboarding_step,
  onboarding_completed_at,
  ai_consent_at,
  marketing_opt_in
) ON TABLE public.profiles TO authenticated;

-- FUNCTION protect_profile_columns
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  jwt_role text := '';
BEGIN
  BEGIN
    jwt_role := coalesce(auth.role(), '');
  EXCEPTION
    WHEN undefined_function OR invalid_parameter_value THEN
      jwt_role := '';
  END;

  IF current_user IN ('service_role', 'postgres', 'supabase_admin') OR jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.is_founder IS DISTINCT FROM OLD.is_founder
     OR NEW.ai_mode IS DISTINCT FROM OLD.ai_mode
     OR NEW.ai_key_hint IS DISTINCT FROM OLD.ai_key_hint
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'protected profile field' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
-- END FUNCTION protect_profile_columns

DROP TRIGGER IF EXISTS profiles_protect_columns ON public.profiles;
CREATE TRIGGER profiles_protect_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_columns();

-- API keys are written only by the server, as ciphertext (enc:v1:...).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_credentials FROM PUBLIC, anon, authenticated;

-- ============ atomic wallet refund ============
-- FUNCTION refund_ai_wallet
CREATE OR REPLACE FUNCTION public.refund_ai_wallet(
  _user_id uuid,
  _charged_pence integer,
  _note text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance integer;
BEGIN
  IF _charged_pence IS NULL OR _charged_pence <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.ai_wallets
    SET balance_pence = balance_pence + _charged_pence
    WHERE owner_id = _user_id
    RETURNING balance_pence INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'wallet missing';
  END IF;

  INSERT INTO public.ai_usage (owner_id, kind, model, mode, cost_pence, markup_bps, charged_pence, note)
  VALUES (_user_id, 'refund', NULL, 'builtin', 0, 0, -_charged_pence, _note);

  RETURN new_balance;
END;
$$;
-- END FUNCTION refund_ai_wallet

REVOKE ALL ON FUNCTION public.refund_ai_wallet(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_wallet(uuid, integer, text) TO service_role;

-- ============ trial spend ceiling ============
ALTER TABLE public.trial_runs
  ADD COLUMN IF NOT EXISTS cost_pence integer NOT NULL DEFAULT 0;

-- ============ resale valuation on each piece ============
ALTER TABLE public.garments
  ADD COLUMN IF NOT EXISTS size_label text,
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS purchase_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS estimated_resale_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS value_low numeric(12,2),
  ADD COLUMN IF NOT EXISTS value_high numeric(12,2),
  ADD COLUMN IF NOT EXISTS value_source text,
  ADD COLUMN IF NOT EXISTS valued_at timestamptz,
  ADD COLUMN IF NOT EXISTS value_confidence text,
  ADD COLUMN IF NOT EXISTS value_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_worn_at timestamptz,
  ADD COLUMN IF NOT EXISTS wear_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.garments DROP CONSTRAINT IF EXISTS garments_condition_check;
ALTER TABLE public.garments
  ADD CONSTRAINT garments_condition_check
  CHECK (condition IS NULL OR condition IN ('new_with_tags', 'like_new', 'good', 'fair'));

ALTER TABLE public.garments DROP CONSTRAINT IF EXISTS garments_confidence_check;
ALTER TABLE public.garments
  ADD CONSTRAINT garments_confidence_check
  CHECK (value_confidence IS NULL OR value_confidence IN ('high', 'medium', 'low', 'unknown'));

ALTER TABLE public.garments DROP CONSTRAINT IF EXISTS garments_part_check;
ALTER TABLE public.garments
  ADD CONSTRAINT garments_part_check
  CHECK (part IN (
    'upperbody', 'wholebody_up', 'lowerbody', 'accessories_up', 'shoes',
    'bags', 'watches', 'jewellery'
  ));

CREATE TABLE IF NOT EXISTS public.value_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  garment_id uuid NOT NULL REFERENCES public.garments(id) ON DELETE CASCADE,
  value_low numeric(12,2),
  value_high numeric(12,2),
  recorded_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/London')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (garment_id, recorded_on)
);

GRANT SELECT, INSERT, UPDATE ON public.value_snapshots TO authenticated;
GRANT ALL ON public.value_snapshots TO service_role;
ALTER TABLE public.value_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "snapshots_select_own" ON public.value_snapshots;
CREATE POLICY "snapshots_select_own" ON public.value_snapshots
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "snapshots_insert_own" ON public.value_snapshots;
CREATE POLICY "snapshots_insert_own" ON public.value_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "snapshots_update_own" ON public.value_snapshots;
CREATE POLICY "snapshots_update_own" ON public.value_snapshots
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Retire the founder invite that was committed in an earlier migration.
-- The code remains in git history; this stops it being used again.
UPDATE public.invites
SET expires_at = now()
WHERE code = 'FOUNDER-DB-001'
  AND (expires_at IS NULL OR expires_at > now());
