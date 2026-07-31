REVOKE EXECUTE ON FUNCTION public.has_vault_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.garment_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_vault_access(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.garment_count(uuid) TO authenticated, service_role;