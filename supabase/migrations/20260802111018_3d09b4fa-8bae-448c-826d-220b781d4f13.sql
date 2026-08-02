DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl.name);
  END LOOP;
END; $$;