-- Wallet: pay-as-you-go balance for built-in AI, held in pence.
CREATE TABLE public.ai_wallets (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_pence integer NOT NULL DEFAULT 0 CHECK (balance_pence >= 0),
  topped_up_pence integer NOT NULL DEFAULT 0 CHECK (topped_up_pence >= 0),
  spent_pence integer NOT NULL DEFAULT 0 CHECK (spent_pence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_wallets TO authenticated;
GRANT ALL ON public.ai_wallets TO service_role;
ALTER TABLE public.ai_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own AI wallet" ON public.ai_wallets
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- Completed credit-pack purchases, keyed by the checkout session for idempotency.
CREATE TABLE public.ai_topups (
  stripe_session_id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pence integer NOT NULL CHECK (pence > 0),
  price_id text,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_topups_owner ON public.ai_topups(owner_id);
GRANT SELECT ON public.ai_topups TO authenticated;
GRANT ALL ON public.ai_topups TO service_role;
ALTER TABLE public.ai_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own AI top-ups" ON public.ai_topups
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- Itemised AI usage: raw provider cost, markup and what was actually charged.
CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  model text,
  mode text NOT NULL DEFAULT 'builtin',
  cost_pence integer NOT NULL DEFAULT 0,
  markup_bps integer NOT NULL DEFAULT 2000,
  charged_pence integer NOT NULL DEFAULT 0,
  ai_job_id uuid REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_usage_owner_created ON public.ai_usage(owner_id, created_at DESC);
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own AI usage" ON public.ai_usage
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- A member's own provider key. Deliberately has no read policy: only the
-- server (service role) may ever read the secret back out.
CREATE TABLE public.ai_credentials (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openai',
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT, UPDATE, DELETE ON public.ai_credentials TO authenticated;
GRANT ALL ON public.ai_credentials TO service_role;
ALTER TABLE public.ai_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members save own key" ON public.ai_credentials
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Members replace own key" ON public.ai_credentials
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Members remove own key" ON public.ai_credentials
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Which AI path the member is on, plus a masked hint of their own key.
ALTER TABLE public.profiles
  ADD COLUMN ai_mode text NOT NULL DEFAULT 'builtin' CHECK (ai_mode IN ('builtin', 'byok')),
  ADD COLUMN ai_key_hint text;

CREATE TRIGGER ai_wallets_updated_at BEFORE UPDATE ON public.ai_wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_credentials_updated_at BEFORE UPDATE ON public.ai_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add prepaid credit once per checkout session.
CREATE OR REPLACE FUNCTION public.credit_ai_wallet(
  _user_id uuid,
  _pence integer,
  _session_id text,
  _price_id text DEFAULT NULL,
  _environment text DEFAULT 'sandbox'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_balance integer;
BEGIN
  IF _pence IS NULL OR _pence <= 0 THEN
    RAISE EXCEPTION 'Top-up amount must be positive';
  END IF;

  INSERT INTO public.ai_topups (stripe_session_id, owner_id, pence, price_id, environment)
  VALUES (_session_id, _user_id, _pence, _price_id, _environment)
  ON CONFLICT (stripe_session_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT balance_pence INTO new_balance FROM public.ai_wallets WHERE owner_id = _user_id;
    RETURN coalesce(new_balance, 0);
  END IF;

  INSERT INTO public.ai_wallets (owner_id, balance_pence, topped_up_pence)
  VALUES (_user_id, _pence, _pence)
  ON CONFLICT (owner_id) DO UPDATE
    SET balance_pence = public.ai_wallets.balance_pence + _pence,
        topped_up_pence = public.ai_wallets.topped_up_pence + _pence
  RETURNING balance_pence INTO new_balance;

  RETURN new_balance;
END;
$$;

-- Charge for one AI run. Returns the remaining balance, or -1 when there is
-- not enough credit (in which case nothing is charged or recorded).
CREATE OR REPLACE FUNCTION public.charge_ai_wallet(
  _user_id uuid,
  _charged_pence integer,
  _cost_pence integer,
  _kind text,
  _model text DEFAULT NULL,
  _markup_bps integer DEFAULT 2000,
  _note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_balance integer;
BEGIN
  IF _charged_pence IS NULL OR _charged_pence < 0 THEN
    RAISE EXCEPTION 'Charge must not be negative';
  END IF;

  INSERT INTO public.ai_wallets (owner_id) VALUES (_user_id)
  ON CONFLICT (owner_id) DO NOTHING;

  UPDATE public.ai_wallets
    SET balance_pence = balance_pence - _charged_pence,
        spent_pence = spent_pence + _charged_pence
  WHERE owner_id = _user_id AND balance_pence >= _charged_pence
  RETURNING balance_pence INTO new_balance;

  IF new_balance IS NULL THEN
    RETURN -1;
  END IF;

  INSERT INTO public.ai_usage (owner_id, kind, model, mode, cost_pence, markup_bps, charged_pence, note)
  VALUES (_user_id, _kind, _model, 'builtin', coalesce(_cost_pence, 0), _markup_bps, _charged_pence, _note);

  RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_ai_wallet(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.charge_ai_wallet(uuid, integer, integer, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_ai_wallet(uuid, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_ai_wallet(uuid, integer, integer, text, text, integer, text) TO service_role;