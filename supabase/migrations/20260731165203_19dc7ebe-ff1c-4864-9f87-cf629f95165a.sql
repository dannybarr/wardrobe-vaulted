CREATE OR REPLACE FUNCTION public.provision_account(_user_id uuid, _email text, _display_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  INSERT INTO public.subscriptions (owner_id, plan, status)
  VALUES (_user_id,
          CASE WHEN is_founder_user THEN 'founder' ELSE 'none' END,
          CASE WHEN is_founder_user THEN 'active' ELSE 'inactive' END)
  ON CONFLICT (owner_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_account(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_account(uuid, text, text) TO service_role;