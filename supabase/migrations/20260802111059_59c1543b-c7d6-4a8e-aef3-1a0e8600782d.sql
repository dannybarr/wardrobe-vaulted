CREATE OR REPLACE FUNCTION public.garment_count(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM public.garments
  WHERE owner_id = _user_id
    AND deleted_at IS NULL
    AND (_user_id = auth.uid() OR auth.uid() IS NULL);
$function$;

CREATE OR REPLACE FUNCTION public.has_vault_access(_user_id uuid, _environment text DEFAULT 'sandbox'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NOT NULL AND _user_id <> auth.uid() THEN false ELSE (
    EXISTS (
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
    )
  ) END;
$function$;