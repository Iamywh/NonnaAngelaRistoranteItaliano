-- Fase 11: opt-in internal digest, immutable notifications and Telegram delivery ledger.
-- Additive only. Never modifies reservations, daily entries, financial or tax data.
BEGIN;
CREATE TABLE public.analytics_notification_settings (
  singleton smallint PRIMARY KEY DEFAULT 1 CHECK (singleton=1),
  enabled boolean NOT NULL DEFAULT false,
  daily_enabled boolean NOT NULL DEFAULT true,
  weekly_enabled boolean NOT NULL DEFAULT true,
  telegram_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR daily_enabled OR weekly_enabled)
);
INSERT INTO public.analytics_notification_settings(singleton) VALUES(1);

CREATE TABLE public.analytics_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence text NOT NULL CHECK (cadence IN ('daily','weekly')),
  local_run_date date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  level text NOT NULL CHECK (level IN ('info','warning')),
  title text NOT NULL CHECK(char_length(title) BETWEEN 4 AND 140),
  body text NOT NULL CHECK(char_length(body) BETWEEN 10 AND 1500),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  telegram_state text NOT NULL DEFAULT 'disabled'
    CHECK(telegram_state IN ('disabled','pending','sending','sent','failed')),
  telegram_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cadence,local_run_date),
  CHECK(period_start<=period_end)
);
CREATE INDEX analytics_notifications_recent_idx
  ON public.analytics_notifications(created_at DESC);

CREATE TABLE public.analytics_notification_reads (
  notification_id uuid NOT NULL REFERENCES public.analytics_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id,user_id)
);
CREATE TABLE public.analytics_notification_settings_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_notification_settings_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_notification_settings,public.analytics_notifications,
  public.analytics_notification_reads,public.analytics_notification_settings_audit
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.analytics_notification_settings,public.analytics_notifications,
  public.analytics_notification_reads,public.analytics_notification_settings_audit TO authenticated;
CREATE POLICY analytics_notify_settings_read ON public.analytics_notification_settings
 FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));
CREATE POLICY analytics_notify_messages_read ON public.analytics_notifications
 FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));
CREATE POLICY analytics_notify_reads_read ON public.analytics_notification_reads
 FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()) AND
   (SELECT public.analytics_has_permission('analytics.read')));
CREATE POLICY analytics_notify_audit_read ON public.analytics_notification_settings_audit
 FOR SELECT TO authenticated USING ((SELECT public.analytics_has_permission('analytics.read')));

CREATE OR REPLACE FUNCTION public.analytics_save_notification_settings(
 p_enabled boolean,p_daily_enabled boolean,p_weekly_enabled boolean,p_telegram_enabled boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old jsonb;v_new jsonb;
BEGIN
 IF NOT public.analytics_has_permission('analytics.write') THEN
   RAISE EXCEPTION 'Access denied';
 END IF;
 IF p_enabled IS NULL OR p_daily_enabled IS NULL OR p_weekly_enabled IS NULL
   OR p_telegram_enabled IS NULL OR (p_enabled AND NOT(p_daily_enabled OR p_weekly_enabled)) THEN
   RAISE EXCEPTION 'Invalid preferences';
 END IF;
 SELECT to_jsonb(s) INTO v_old FROM public.analytics_notification_settings s
  WHERE singleton=1 FOR UPDATE;
 UPDATE public.analytics_notification_settings SET enabled=p_enabled,
  daily_enabled=p_daily_enabled,weekly_enabled=p_weekly_enabled,
  telegram_enabled=p_telegram_enabled,updated_by=auth.uid(),updated_at=now()
 WHERE singleton=1;
 SELECT to_jsonb(s) INTO v_new FROM public.analytics_notification_settings s WHERE singleton=1;
 INSERT INTO public.analytics_notification_settings_audit(old_value,new_value,changed_by)
 VALUES (v_old,v_new,auth.uid());
 RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.analytics_mark_notification_read(
 p_notification_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.analytics_has_permission('analytics.read') THEN
  RAISE EXCEPTION 'Access denied';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.analytics_notifications n WHERE n.id=p_notification_id) THEN
  RETURN false;
 END IF;
 INSERT INTO public.analytics_notification_reads(notification_id,user_id)
 VALUES(p_notification_id,auth.uid()) ON CONFLICT DO NOTHING;
 RETURN true;
END;
$$;

-- This RPC is exclusively callable with the server-side service-role JWT.
-- The browser never gets to create, forge or send notification content.
CREATE OR REPLACE FUNCTION public.analytics_generate_notification_digest(
 p_cadence text,p_local_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_settings public.analytics_notification_settings%ROWTYPE;
 v_start date;v_end date;v_recorded integer;v_finalized integer;
 v_services integer;v_lunch integer;v_dinner integer;
 v_title text;v_body text;v_level text;v_id uuid;v_created boolean:=false;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service access only'; END IF;
 IF p_cadence NOT IN ('daily','weekly') OR p_local_date IS NULL OR
   p_local_date <> (now() AT TIME ZONE 'Atlantic/Canary')::date THEN
   RAISE EXCEPTION 'Invalid cadence or run date';
 END IF;
 IF p_cadence='weekly' AND EXTRACT(ISODOW FROM p_local_date)<>1 THEN
   RETURN jsonb_build_object('created',false,'reason','not_monday');
 END IF;
 SELECT * INTO v_settings FROM public.analytics_notification_settings WHERE singleton=1;
 IF NOT v_settings.enabled OR
   (p_cadence='daily' AND NOT v_settings.daily_enabled) OR
   (p_cadence='weekly' AND NOT v_settings.weekly_enabled) THEN
   RETURN jsonb_build_object('created',false,'reason','disabled');
 END IF;
 IF p_cadence='daily' THEN
   v_start:=p_local_date-1;v_end:=p_local_date-1;
 ELSE
   v_start:=p_local_date-7;v_end:=p_local_date-1;
 END IF;
 SELECT count(*)::integer,(count(*) FILTER(WHERE status='finalized'))::integer
 INTO v_recorded,v_finalized
 FROM public.analytics_daily_entries WHERE business_date BETWEEN v_start AND v_end;
 -- Don't spam on dates with no data; closures are not implicitly inferred.
 IF v_recorded=0 THEN RETURN jsonb_build_object('created',false,'reason','no_records'); END IF;
 SELECT count(*)::integer,
   coalesce(sum(s.covers) FILTER(WHERE s.service_type='lunch'),0)::integer,
   coalesce(sum(s.covers) FILTER(WHERE s.service_type='dinner'),0)::integer
 INTO v_services,v_lunch,v_dinner
 FROM public.analytics_daily_entries d
 JOIN public.analytics_service_entries s ON s.daily_entry_id=d.id
 WHERE d.business_date BETWEEN v_start AND v_end AND d.status='finalized'
  AND ((s.service_type='lunch' AND d.lunch_status='open') OR
       (s.service_type='dinner' AND d.dinner_status='open'));
 v_level:=CASE WHEN v_finalized<v_recorded THEN 'warning' ELSE 'info' END;
 v_title:=CASE WHEN p_cadence='daily' THEN 'Resumen diario Nonna Angela'
   ELSE 'Resumen semanal Nonna Angela' END;
 v_body:='Periodo '||v_start||CASE WHEN p_cadence='weekly' THEN ' a '||v_end ELSE '' END||
   E'\nJornadas registradas: '||v_recorded||
   '. Finalizadas: '||v_finalized||
   E'.\nComensales SOLO de jornadas finalizadas: almuerzo '||v_lunch||
   ', cena '||v_dinner||', total '||(v_lunch+v_dinner)||'.'||
   CASE WHEN v_finalized<v_recorded
    THEN E'\nHay borradores: revisa Registro diario.' ELSE '' END||
   CASE WHEN p_cadence='weekly' THEN
    E'\nLa cobertura no representa necesariamente todos los dias abiertos de la semana.'
    ELSE '' END||
   E'\nNo se deducen ventas, beneficios ni objetivos de jornadas ausentes.';
 INSERT INTO public.analytics_notifications
 (cadence,local_run_date,period_start,period_end,level,title,body,metrics,telegram_state)
 VALUES (p_cadence,p_local_date,v_start,v_end,v_level,v_title,v_body,
   jsonb_build_object('recorded_days',v_recorded,'finalized_days',v_finalized,
    'lunch_covers_finalized',v_lunch,'dinner_covers_finalized',v_dinner,
    'finalized_services',v_services),
   CASE WHEN v_settings.telegram_enabled THEN 'pending' ELSE 'disabled' END)
 ON CONFLICT(cadence,local_run_date) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NOT NULL THEN v_created:=true;
 ELSE SELECT id INTO v_id FROM public.analytics_notifications
   WHERE cadence=p_cadence AND local_run_date=p_local_date;
 END IF;
 RETURN jsonb_build_object('created',v_created,'id',v_id,
   'cadence',p_cadence,'reason',CASE WHEN v_created THEN 'created' ELSE 'already_exists' END);
END;
$$;

-- Reserve exactly one Telegram attempt; claim committed before external HTTP call.
-- Failed/ambiguous network attempts remain failed and are NOT auto retried (at-most-once).
CREATE OR REPLACE FUNCTION public.analytics_reserve_notification_telegram(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.analytics_notifications%ROWTYPE;v_on boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service access only'; END IF;
 SELECT enabled AND telegram_enabled INTO v_on FROM public.analytics_notification_settings WHERE singleton=1;
 IF v_on IS DISTINCT FROM true THEN RETURN NULL; END IF;
 UPDATE public.analytics_notifications SET telegram_state='sending'
  WHERE id=p_id AND telegram_state='pending' RETURNING * INTO v_row;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',v_row.id,'text',v_row.title||E'\n\n'||v_row.body);
END;
$$;
CREATE OR REPLACE FUNCTION public.analytics_complete_notification_telegram(
 p_id uuid,p_success boolean,p_error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service access only'; END IF;
 IF p_success IS NULL THEN RAISE EXCEPTION 'Missing delivery result'; END IF;
 UPDATE public.analytics_notifications
 SET telegram_state=CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
     telegram_error=CASE WHEN p_success THEN NULL ELSE left(coalesce(p_error,'Delivery failed'),120) END,
     delivered_at=CASE WHEN p_success THEN now() ELSE NULL END
 WHERE id=p_id AND telegram_state='sending';
 RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_save_notification_settings(boolean,boolean,boolean,boolean)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.analytics_mark_notification_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.analytics_save_notification_settings(boolean,boolean,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_mark_notification_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.analytics_generate_notification_digest(text,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analytics_reserve_notification_telegram(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analytics_complete_notification_telegram(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_generate_notification_digest(text,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_reserve_notification_telegram(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_complete_notification_telegram(uuid,boolean,text) TO service_role;
COMMIT;
