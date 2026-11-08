BEGIN;

CREATE TABLE IF NOT EXISTS public.reservation_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.reservation_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reservation_staff FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reservations_staff_has_access(p_write boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reservation_staff AS staff
    WHERE staff.user_id = (SELECT auth.uid())
  ) OR public.analytics_has_permission(
    CASE WHEN p_write THEN 'analytics.write' ELSE 'analytics.read' END
  );
$$;

REVOKE ALL ON FUNCTION public.reservations_staff_has_access(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservations_staff_has_access(boolean) TO authenticated;

GRANT SELECT ON TABLE public.reservations TO authenticated;
REVOKE UPDATE, TRUNCATE ON TABLE public.reservations FROM authenticated;
GRANT UPDATE (
  status, reservation_status, service_status,
  confirmed_at, confirmation_channel_used, assigned_tables
) ON TABLE public.reservations TO authenticated;

DROP POLICY IF EXISTS reservations_manager_read ON public.reservations;
CREATE POLICY reservations_manager_read
ON public.reservations FOR SELECT TO authenticated
USING ((SELECT public.reservations_staff_has_access()));

DROP POLICY IF EXISTS reservations_manager_update ON public.reservations;
CREATE POLICY reservations_manager_update
ON public.reservations FOR UPDATE TO authenticated
USING ((SELECT public.reservations_staff_has_access(true)))
WITH CHECK ((SELECT public.reservations_staff_has_access(true)));

COMMIT;
