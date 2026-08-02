REVOKE EXECUTE ON FUNCTION public.credit_ai_wallet(uuid, integer, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.charge_ai_wallet(uuid, integer, integer, text, text, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.provision_account(uuid, text, text) FROM anon, authenticated;