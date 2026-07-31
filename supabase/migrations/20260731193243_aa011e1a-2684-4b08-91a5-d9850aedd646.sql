CREATE TABLE public.trial_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  address_hash text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trial_runs_device_idx ON public.trial_runs (device_id, kind);
CREATE INDEX trial_runs_address_idx ON public.trial_runs (address_hash, kind, created_at DESC);
CREATE INDEX trial_runs_created_idx ON public.trial_runs (created_at DESC);

GRANT ALL ON public.trial_runs TO service_role;

ALTER TABLE public.trial_runs ENABLE ROW LEVEL SECURITY;