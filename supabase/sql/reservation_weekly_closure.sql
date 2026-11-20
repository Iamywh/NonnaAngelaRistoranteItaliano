-- Effective from 2026-11-22. Existing bookings are retained.
CREATE OR REPLACE FUNCTION public.enforce_reservation_weekly_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  -- Status, notes and table updates on existing bookings remain possible.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.reservation_date IS NOT DISTINCT FROM OLD.reservation_date
       AND NEW.reservation_time IS NOT DISTINCT FROM OLD.reservation_time THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.reservation_date >= DATE '2026-11-22'
     AND (EXTRACT(DOW FROM NEW.reservation_date) = 1
       OR (EXTRACT(DOW FROM NEW.reservation_date) = 0
         AND NEW.reservation_time >= TIME '17:00')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'El restaurante cierra los domingos por la noche y los lunes desde el 22/11/2026. Selecciona otro servicio.';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_reservation_weekly_closure() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS reservations_weekly_closure ON public.reservations;
CREATE TRIGGER reservations_weekly_closure
BEFORE INSERT OR UPDATE OF reservation_date, reservation_time ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.enforce_reservation_weekly_closure();
