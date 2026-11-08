BEGIN;

ALTER TABLE public.staff_module_permissions
  DROP CONSTRAINT IF EXISTS staff_module_permissions_module_check;
ALTER TABLE public.staff_module_permissions
  ADD CONSTRAINT staff_module_permissions_module_check
  CHECK (module IN ('beverage_inventory', 'orders'));

CREATE OR REPLACE FUNCTION public.staff_portal_access()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'backoffice', (SELECT public.analytics_has_permission('analytics.write')),
    'reservations', (SELECT public.reservations_staff_has_access()),
    'beverage', (SELECT public.beverage_inventory_has_access()),
    'orders', (SELECT public.analytics_has_permission('analytics.write')) OR EXISTS (
      SELECT 1
      FROM public.staff_module_permissions
      WHERE user_id = (SELECT auth.uid()) AND module = 'orders'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.staff_portal_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_portal_access() TO authenticated;

COMMIT;
