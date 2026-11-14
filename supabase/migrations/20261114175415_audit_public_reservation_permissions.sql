BEGIN;
-- Preserve anonymous requests while excluding server-owned and staff-only fields.
REVOKE INSERT ON public.reservations FROM PUBLIC, anon;
DO $$
DECLARE column_list text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ') INTO column_list
  FROM pg_attribute WHERE attrelid='public.reservations'::regclass
    AND attnum > 0 AND NOT attisdropped;
  EXECUTE 'REVOKE INSERT (' || column_list || ') ON public.reservations FROM PUBLIC, anon';
END;
$$;
GRANT INSERT (customer_name,customer_phone,customer_email,reservation_date,
  reservation_time,guests,status,area_preference,notes,source,phone_country_code,
  phone_country_iso,confirmation_channel,reservation_status,service_status)
ON public.reservations TO anon;

-- Restrictive check also applies if another permissive INSERT policy is added.
DROP POLICY IF EXISTS reservation_public_request_states ON public.reservations;
CREATE POLICY reservation_public_request_states ON public.reservations
AS RESTRICTIVE FOR INSERT TO anon
WITH CHECK (status::text='pending' AND source::text='website'
  AND reservation_status='pending' AND service_status='not_arrived');
COMMIT;
