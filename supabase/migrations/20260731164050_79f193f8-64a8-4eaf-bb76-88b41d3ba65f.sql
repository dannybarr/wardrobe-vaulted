CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  email text,
  note text,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX invites_code_idx ON public.invites (lower(code));

GRANT ALL ON public.invites TO service_role;
GRANT SELECT ON public.invites TO authenticated;

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Founders may review the invite list; everything else happens server-side with elevated rights.
CREATE POLICY "invites_founder_select" ON public.invites FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'founder'));