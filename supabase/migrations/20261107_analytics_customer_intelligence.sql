-- Phase 13A — Customer Intelligence: authorized reservation aggregates only.
-- Important: this DOES NOT widen the existing reservations RLS or expose PII.
-- All client-facing results contain counts/sums by month/day/service;
-- no names, phones, emails, free-text notes, IDs or individual reservation records.
BEGIN;

CREATE OR REPLACE FUNCTION public.analytics_customer_intelligence(p_month_start date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_month_end date;
  v_today date := (now() AT TIME ZONE 'Atlantic/Canary')::date;
  v_result jsonb;
  v_registered_days integer;
  v_finalized_days integer;
  v_registered_covers bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
    OR NOT public.analytics_has_permission('analytics.read') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_month_start IS NULL OR EXTRACT(DAY FROM p_month_start) <> 1
     OR p_month_start < DATE '2000-01-01'
     OR p_month_start > (v_today + INTERVAL '5 years')::date THEN
    RAISE EXCEPTION 'Invalid month';
  END IF;
  v_month_end := (p_month_start + INTERVAL '1 month')::date;

  -- Figures from the DAILY REGISTER have a different meaning from reservation
  -- attendance. Their covers may include walk-ins and must NOT be joined to
  -- individual bookings or treated as verified reservation show-ups.
  SELECT count(DISTINCT d.id)::integer,
         count(DISTINCT d.id) FILTER (WHERE d.status='finalized')::integer,
         sum(s.covers)::bigint
    INTO v_registered_days,v_finalized_days,v_registered_covers
    FROM public.analytics_daily_entries d
    LEFT JOIN public.analytics_service_entries s ON s.daily_entry_id=d.id
    WHERE d.business_date>=p_month_start AND d.business_date<v_month_end;

  WITH base AS MATERIALIZED (
    SELECT
      r.reservation_date::date AS day,
      (coalesce(r.guests,0))::integer AS guests,
      coalesce(r.reservation_status::text,r.status::text,'pending') AS booking_status,
      coalesce(r.service_status::text,
        CASE WHEN r.status::text IN ('seated','completed','no_show')
             THEN r.status::text ELSE 'not_arrived' END) AS service_status,
      CASE
        WHEN left(r.reservation_time::text,5) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          AND left(r.reservation_time::text,5) BETWEEN '13:00' AND '15:30'
          THEN 'lunch'
        WHEN left(r.reservation_time::text,5) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          AND left(r.reservation_time::text,5) BETWEEN '19:30' AND '23:00'
          THEN 'dinner'
        ELSE 'outside'
      END AS service,
      CASE WHEN r.source::text='website' THEN 'website'
           WHEN r.source IS NULL THEN 'unknown' ELSE 'other' END AS origin,
      CASE WHEN r.confirmation_channel::text IN ('whatsapp','email')
           THEN r.confirmation_channel::text ELSE 'other' END AS channel_preference,
      CASE WHEN r.created_at IS NOT NULL
           THEN (r.created_at AT TIME ZONE 'Atlantic/Canary')::date END AS created_day
    FROM public.reservations r
    WHERE r.reservation_date>=p_month_start AND r.reservation_date<v_month_end
  ),
  tagged AS MATERIALIZED (
    SELECT b.*,
      (b.booking_status IN ('pending','confirmed')) AS active,
      (b.booking_status IN ('pending','confirmed') AND
       b.service_status IN ('seated','completed')) AS arrived,
      (b.booking_status IN ('pending','confirmed') AND
       b.service_status='no_show') AS marked_no_show,
      (b.booking_status IN ('pending','confirmed') AND
       b.service_status='not_arrived' AND b.day<v_today) AS past_unmarked,
      CASE
        WHEN b.created_day IS NULL THEN 'unknown'
        WHEN b.created_day>b.day THEN 'late_entry'
        WHEN (b.day-b.created_day)=0 THEN 'same_day'
        WHEN (b.day-b.created_day) BETWEEN 1 AND 2 THEN 'one_two'
        WHEN (b.day-b.created_day) BETWEEN 3 AND 7 THEN 'three_seven'
        ELSE 'eight_plus'
      END AS lead_group
    FROM base b
  )
  SELECT jsonb_build_object(
    'month',to_char(p_month_start,'YYYY-MM'),
    'today',v_today,
    'definitions',jsonb_build_object(
      'active','pending/confirmed',
      'arrived','seated/completed on active booking',
      'no_show','explicitly marked no_show on active booking',
      'past_unmarked','past active booking still not_arrived',
      'services','lunch 13:00-15:30; dinner 19:30-23:00; outside=other',
      'source','website includes website form and virtual assistant'
    ),
    'totals',(
      SELECT jsonb_build_object(
        'requests',count(*)::integer,
        'requested_guests',coalesce(sum(guests),0)::integer,
        'pending',count(*) FILTER (WHERE booking_status='pending')::integer,
        'confirmed',count(*) FILTER (WHERE booking_status='confirmed')::integer,
        'cancelled',count(*) FILTER (WHERE booking_status='cancelled')::integer,
        'rejected',count(*) FILTER (WHERE booking_status='rejected')::integer,
        'other_status',count(*) FILTER (
          WHERE booking_status NOT IN ('pending','confirmed','cancelled','rejected'))::integer,
        'active',count(*) FILTER (WHERE active)::integer,
        'active_guests',coalesce(sum(guests) FILTER (WHERE active),0)::integer,
        'arrived',count(*) FILTER (WHERE arrived)::integer,
        'arrived_guests',coalesce(sum(guests) FILTER (WHERE arrived),0)::integer,
        'no_show',count(*) FILTER (WHERE marked_no_show)::integer,
        'no_show_guests',coalesce(sum(guests) FILTER (WHERE marked_no_show),0)::integer,
        'past_unmarked',count(*) FILTER (WHERE past_unmarked)::integer,
        'out_of_window',count(*) FILTER (WHERE service='outside')::integer
      ) FROM tagged
    ),
    'by_service',(
      SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY
        CASE s.service WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 ELSE 3 END),'[]'::jsonb)
      FROM (
        SELECT service,count(*)::integer AS requests,
          count(*) FILTER(WHERE active)::integer AS active,
          coalesce(sum(guests) FILTER(WHERE active),0)::integer AS active_guests,
          count(*) FILTER(WHERE arrived)::integer AS arrived,
          coalesce(sum(guests) FILTER(WHERE arrived),0)::integer AS arrived_guests,
          count(*) FILTER(WHERE marked_no_show)::integer AS no_show
        FROM tagged GROUP BY service
      ) s
    ),
    'by_weekday',(
      SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.weekday),'[]'::jsonb)
      FROM (
        SELECT extract(isodow FROM day)::integer AS weekday,
          count(*)::integer AS requests,
          count(*) FILTER(WHERE active)::integer AS active,
          coalesce(sum(guests) FILTER(WHERE active),0)::integer AS active_guests,
          count(*) FILTER(WHERE arrived)::integer AS arrived
        FROM tagged GROUP BY extract(isodow FROM day)
      ) w
    ),
    'by_date',(
      SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day),'[]'::jsonb)
      FROM (
        SELECT day,count(*)::integer AS requests,
          count(*) FILTER(WHERE active)::integer AS active,
          coalesce(sum(guests) FILTER(WHERE active),0)::integer AS active_guests,
          count(*) FILTER(WHERE arrived)::integer AS arrived,
          coalesce(sum(guests) FILTER(WHERE arrived),0)::integer AS arrived_guests,
          count(*) FILTER(WHERE marked_no_show)::integer AS no_show,
          count(*) FILTER(WHERE booking_status='cancelled')::integer AS cancelled,
          count(*) FILTER(WHERE past_unmarked)::integer AS past_unmarked
        FROM tagged GROUP BY day
      ) d
    ),
    'by_lead',(
      SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY
       CASE l.bucket WHEN 'same_day' THEN 1 WHEN 'one_two' THEN 2
         WHEN 'three_seven' THEN 3 WHEN 'eight_plus' THEN 4
         WHEN 'late_entry' THEN 5 ELSE 6 END),'[]'::jsonb)
      FROM (SELECT lead_group AS bucket,count(*)::integer AS requests
            FROM tagged GROUP BY lead_group) l
    ),
    'by_origin',(
      SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.origin),'[]'::jsonb)
      FROM (SELECT origin,count(*)::integer AS requests
            FROM tagged GROUP BY origin) o
    ),
    'by_channel_preference',(
      SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.channel_preference),'[]'::jsonb)
      FROM (SELECT channel_preference,count(*)::integer AS requests
            FROM tagged GROUP BY channel_preference) c
    ),
    'daily_register',jsonb_build_object(
      'recorded_days',v_registered_days,
      'finalized_days',v_finalized_days,
      'recorded_covers',CASE WHEN v_registered_days>0 THEN v_registered_covers ELSE NULL END,
      'comparable',false
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_customer_intelligence(date)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_customer_intelligence(date)
  TO authenticated;
COMMIT;
