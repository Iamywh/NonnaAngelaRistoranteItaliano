BEGIN;

CREATE OR REPLACE FUNCTION public.reservation_service_booked_guests(
  p_date date,
  p_service text
) RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(sum(r.guests), 0)
  FROM public.reservations AS r
  WHERE r.reservation_date = p_date
    AND coalesce(nullif(r.reservation_status::text, ''), r.status::text, 'pending')
      NOT IN ('rejected', 'cancelled')
    AND coalesce(nullif(r.service_status::text, ''), r.status::text, 'not_arrived')
      NOT IN ('completed', 'no_show')
    AND CASE
      WHEN p_service = 'special' THEN nullif(r.reservation_time::text, '') IS NOT NULL
      WHEN r.reservation_time::text ~ '^[0-9]{1,2}:[0-9]{2}(:|$)' THEN
        CASE p_service
          WHEN 'lunch' THEN split_part(r.reservation_time::text, ':', 1)::int < 17
          WHEN 'dinner' THEN split_part(r.reservation_time::text, ':', 1)::int >= 17
          ELSE false
        END
      ELSE false
    END;
$$;

REVOKE ALL ON FUNCTION public.reservation_service_booked_guests(date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservation_service_booked_guests(date, text) TO anon;

COMMIT;
