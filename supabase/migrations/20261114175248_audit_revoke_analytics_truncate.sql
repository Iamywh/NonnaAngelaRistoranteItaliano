-- Verified on production 2026-11-14: authenticated had TRUNCATE on both tables.
-- TRUNCATE is not governed by row-level policies. Preserve all ordinary reads
-- and SECURITY DEFINER write RPCs, and retain service_role/owner privileges.
BEGIN;
REVOKE TRUNCATE ON TABLE public.analytics_daily_entries,
  public.analytics_service_entries FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF has_table_privilege('authenticated','public.analytics_daily_entries','TRUNCATE')
     OR has_table_privilege('authenticated','public.analytics_service_entries','TRUNCATE') THEN
    RAISE EXCEPTION 'Inherited TRUNCATE remains; inspect role membership before release';
  END IF;
END;
$$;
COMMIT;
