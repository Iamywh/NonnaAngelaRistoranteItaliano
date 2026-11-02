-- Phase 12: private, opt-in /startentry wizard on the dedicated Analytics bot.
-- No reservation writes, no overwrite of existing/finalized days, and no IGIC inference.
BEGIN;

CREATE TABLE public.analytics_telegram_entry_sessions (
  chat_id text NOT NULL,
  sender_id text NOT NULL,
  step text NOT NULL,
  data jsonb NOT NULL DEFAULT '{"lunch":{},"dinner":{}}'::jsonb,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(chat_id,sender_id),
  CHECK(jsonb_typeof(data)='object')
);
CREATE INDEX analytics_telegram_entry_session_expiry
 ON public.analytics_telegram_entry_sessions(expires_at);

-- Store each Telegram update's response for safe replay when delivery is retried.
CREATE TABLE public.analytics_telegram_entry_updates (
  update_id bigint PRIMARY KEY,
  chat_id text NOT NULL,
  sender_id text NOT NULL,
  reply text NOT NULL,
  saved_day_id uuid,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.analytics_telegram_entry_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_entry_id uuid NOT NULL UNIQUE REFERENCES public.analytics_daily_entries(id),
  business_date date NOT NULL UNIQUE,
  telegram_update_id bigint NOT NULL UNIQUE
    REFERENCES public.analytics_telegram_entry_updates(update_id),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  source text NOT NULL DEFAULT 'analytics_telegram_bot'
    CHECK(source='analytics_telegram_bot'),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics_telegram_entry_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_telegram_entry_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_telegram_entry_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_telegram_entry_sessions,
 public.analytics_telegram_entry_updates,public.analytics_telegram_entry_audit
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.analytics_telegram_entry_audit TO authenticated;
CREATE POLICY analytics_telegram_entry_audit_read
 ON public.analytics_telegram_entry_audit FOR SELECT TO authenticated
 USING ((SELECT public.analytics_has_permission('analytics.read')));

-- One atomic transaction for state transition, idempotent update processing,
-- and confirmed insertion of a WHOLE DAY as DRAFT.
CREATE FUNCTION public.analytics_telegram_entry_process(
  p_chat_id text,p_sender_id text,p_update_id bigint,p_text text,p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_session public.analytics_telegram_entry_sessions%ROWTYPE;
 v_step text; v_data jsonb; v_text text; v_date date;
 v_today date := (now() AT TIME ZONE 'Atlantic/Canary')::date;
 v_reply text := ''; v_saved uuid; v_previous public.analytics_telegram_entry_updates%ROWTYPE;
 v_kind text; v_value text; v_covers integer; v_number numeric;
 v_service jsonb; v_status text; v_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only'; END IF;
 IF p_chat_id IS NULL OR p_sender_id IS NULL OR length(p_chat_id)>30 OR
    length(p_sender_id)>30 OR p_update_id IS NULL OR p_update_id<0 OR
    p_text IS NULL OR char_length(p_text)>100 OR btrim(p_text)='' THEN
   RAISE EXCEPTION 'Invalid entry update';
 END IF;

 -- Serialize concurrent duplicate update_ids before touching session state.
 INSERT INTO public.analytics_telegram_entry_updates(update_id,chat_id,sender_id,reply)
 VALUES(p_update_id,p_chat_id,p_sender_id,'Processing')
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_previous FROM public.analytics_telegram_entry_updates
    WHERE update_id=p_update_id;
   RETURN jsonb_build_object('ok',true,'duplicate',true,
     'reply',v_previous.reply,'saved_day_id',v_previous.saved_day_id);
 END IF;

 v_text := btrim(p_text);
 IF lower(v_text) IN ('/startentry','/startentry@nonnaangelanalyticsbot') THEN
   INSERT INTO public.analytics_telegram_entry_sessions
     (chat_id,sender_id,step,data,expires_at)
   VALUES (p_chat_id,p_sender_id,'date','{"lunch":{},"dinner":{}}'::jsonb,
     now()+interval '30 minutes')
   ON CONFLICT(chat_id,sender_id) DO UPDATE SET step='date',
     data='{"lunch":{},"dinner":{}}'::jsonb,
     expires_at=now()+interval '30 minutes',updated_at=now();
   v_reply := E'🍝 Registro diario Nonna Angela\n\n'
     ||E'1/11 · Fecha del registro (AAAA-MM-DD, hoy o ayer).\n'
     ||E'Una jornada existente NO se sobrescribe.\n'
     ||'Escribe /cancel para salir.';
 ELSIF lower(v_text)='/cancel' THEN
   DELETE FROM public.analytics_telegram_entry_sessions
     WHERE chat_id=p_chat_id AND sender_id=p_sender_id;
   v_reply := 'Entrada cancelada. No se ha guardado nada. /startentry para empezar.';
 ELSIF lower(v_text) IN ('/help','/start') THEN
   v_reply := E'🤖 Nonna Angela Analytics\n/startentry — Registrar una jornada\n'
     ||E'/cancel — Cancelar el formulario\n'
     ||'El registro se guarda como BORRADOR tras confirmar y se revisa en Analytics.';
 ELSE
   SELECT * INTO v_session FROM public.analytics_telegram_entry_sessions
    WHERE chat_id=p_chat_id AND sender_id=p_sender_id FOR UPDATE;
   IF NOT FOUND THEN
     v_reply := 'Para registrar datos, escribe /startentry.';
   ELSIF v_session.expires_at < now() THEN
     DELETE FROM public.analytics_telegram_entry_sessions
       WHERE chat_id=p_chat_id AND sender_id=p_sender_id;
     v_reply := 'El formulario caducó (30 min). Usa /startentry de nuevo.';
   ELSE
     v_step:=v_session.step;
     v_data:=v_session.data;
     v_kind:=split_part(v_step,'_',1);
     IF v_step='date' THEN
       IF lower(v_text)='hoy' THEN
         v_date:=v_today;
       ELSIF lower(v_text)='ayer' THEN
         v_date:=v_today-1;
       ELSIF v_text ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
         BEGIN
           v_date:=to_date(v_text,'YYYY-MM-DD');
           IF to_char(v_date,'YYYY-MM-DD')<>v_text THEN v_date:=NULL; END IF;
         EXCEPTION WHEN OTHERS THEN v_date:=NULL;
         END;
       END IF;
       IF v_date IS NULL OR v_date>v_today OR v_date<v_today-366 THEN
         v_reply:='Fecha inválida. Usa AAAA-MM-DD, hoy o ayer (máximo 366 días atrás).';
       ELSIF EXISTS (SELECT 1 FROM public.analytics_daily_entries
                     WHERE business_date=v_date) THEN
         v_reply:='Esa fecha ya tiene un registro. Revísalo en Analytics; no se sobrescribe. Indica otra fecha o /cancel.';
       ELSIF EXISTS (SELECT 1 FROM public.analytics_monthly_closures
                     WHERE month_start=date_trunc('month',v_date)::date) THEN
         v_reply:='Ese mes está cerrado en Analytics. No se admiten nuevas entradas. Indica otra fecha.';
       ELSE
         v_data:=jsonb_set(v_data,'{date}',to_jsonb(v_date::text),true);
         v_step:='lunch_status';
         v_reply:='2/11 · ¿Almuerzo abierto o cerrado? Escribe ABIERTO o CERRADO.';
       END IF;
     ELSIF v_step IN ('lunch_status','dinner_status') THEN
       IF lower(v_text) NOT IN ('abierto','cerrado') THEN
         v_reply:='Indica ABIERTO o CERRADO.';
       ELSE
         v_status:=CASE WHEN lower(v_text)='abierto' THEN 'open' ELSE 'closed' END;
         IF v_status='closed' THEN
           v_data:=jsonb_set(v_data,ARRAY[v_kind],
             '{"status":"closed","covers":0,"food":"0.00","beverage":"0.00","basis":"gross"}'::jsonb,true);
           v_step:=CASE WHEN v_kind='lunch' THEN 'dinner_status' ELSE 'confirm' END;
         ELSE
           v_data:=jsonb_set(v_data,ARRAY[v_kind],
             '{"status":"open"}'::jsonb,true);
           v_step:=v_kind||'_covers';
         END IF;
       END IF;
     ELSIF v_step IN ('lunch_covers','dinner_covers') THEN
       IF v_text !~ '^[0-9]{1,5}$' THEN
         v_reply:='Comensales: número entero entre 0 y 99999.';
       ELSE
         v_covers:=v_text::integer;
         v_data:=jsonb_set(v_data,ARRAY[v_kind,'covers'],to_jsonb(v_covers),true);
         v_step:=v_kind||'_food';
       END IF;
     ELSIF v_step IN ('lunch_food','lunch_beverage','dinner_food','dinner_beverage') THEN
       IF v_text !~ '^[0-9]{1,9}([,.][0-9]{1,2})?$' THEN
         v_reply:='Importe inválido. Ejemplo: 123,45 (sin separadores de miles).';
       ELSE
         v_number:=replace(v_text,',','.')::numeric;
         v_value:=to_char(v_number,'FM9999999990.00');
         v_data:=jsonb_set(v_data,ARRAY[v_kind,
           CASE WHEN v_step LIKE '%_food' THEN 'food' ELSE 'beverage' END],
           to_jsonb(v_value),true);
         v_step:=CASE WHEN v_step LIKE '%_food' THEN v_kind||'_beverage'
           ELSE v_kind||'_basis' END;
       END IF;
     ELSIF v_step IN ('lunch_basis','dinner_basis') THEN
       IF lower(v_text) NOT IN ('bruto','neto','gross','net') THEN
         v_reply:='Escribe BRUTO (IGIC incluido) o NETO (sin IGIC).';
       ELSE
         v_value:=CASE WHEN lower(v_text) IN ('bruto','gross') THEN 'gross' ELSE 'net' END;
         v_data:=jsonb_set(v_data,ARRAY[v_kind,'basis'],to_jsonb(v_value),true);
         v_step:=CASE WHEN v_kind='lunch' THEN 'dinner_status' ELSE 'confirm' END;
       END IF;
     ELSIF v_step='confirm' THEN
       IF upper(v_text)<>'CONFIRMAR' THEN
         v_reply:='Para guardar como borrador escribe CONFIRMAR. /cancel para cancelar o /startentry para empezar de nuevo.';
       ELSIF p_actor IS NULL OR NOT EXISTS(
          SELECT 1 FROM public.analytics_user_roles r
           WHERE r.user_id=p_actor AND r.is_active AND r.role IN ('owner','admin')
       ) THEN
         v_reply:='No hay propietario Analytics válido configurado. No se ha guardado nada.';
       ELSE
         v_date:=(v_data->>'date')::date;
         -- Serialize with other bot writes. The date UNIQUE also rejects all
         -- simultaneous writes from the site, without replacing them.
         PERFORM pg_advisory_xact_lock(hashtext('analytics_telegram_daily'),hashtext(v_date::text));
         IF EXISTS (SELECT 1 FROM public.analytics_daily_entries
                    WHERE business_date=v_date) THEN
           v_reply:='Ya existe esa jornada en Analytics. No se ha sobrescrito. Usa /cancel.';
         ELSIF EXISTS(SELECT 1 FROM public.analytics_monthly_closures
                      WHERE month_start=date_trunc('month',v_date)::date) THEN
           v_reply:='Mes cerrado. No se puede registrar una jornada en este mes.';
         ELSE
           -- No implicit completion: always draft, even when all figures provided.
           INSERT INTO public.analytics_daily_entries
             (business_date,lunch_status,dinner_status,status,created_by,updated_by)
           VALUES (v_date,v_data->'lunch'->>'status',v_data->'dinner'->>'status',
                   'draft',p_actor,p_actor) RETURNING id INTO v_id;
           FOR v_kind IN SELECT unnest(ARRAY['lunch','dinner']) LOOP
             v_service:=v_data->v_kind;
             INSERT INTO public.analytics_service_entries
               (daily_entry_id,service_type,covers,food_revenue_amount,
                beverage_revenue_amount,tax_basis,tax_details)
             VALUES (v_id,v_kind,(v_service->>'covers')::integer,
               (v_service->>'food')::numeric,(v_service->>'beverage')::numeric,
               v_service->>'basis',
               CASE WHEN v_service->>'status'='closed'
                 THEN '{"status":"not_applicable"}'::jsonb
                 ELSE '{"status":"unverified"}'::jsonb END);
           END LOOP;
           INSERT INTO public.analytics_telegram_entry_audit
             (daily_entry_id,business_date,telegram_update_id,actor_user_id,snapshot)
           VALUES(v_id,v_date,p_update_id,p_actor,v_data);
           v_saved:=v_id;
           DELETE FROM public.analytics_telegram_entry_sessions
             WHERE chat_id=p_chat_id AND sender_id=p_sender_id;
           v_reply:='✅ Jornada '||v_date||E' guardada como BORRADOR en Analytics.\n'
             ||'Revisa y finaliza el día desde la web cuando hayas comprobado los importes.';
         END IF;
       END IF;
     ELSE
       RAISE EXCEPTION 'Unsupported wizard step';
     END IF;

     IF v_saved IS NULL AND v_step IS DISTINCT FROM 'confirm' AND
        v_reply='' THEN
       v_reply:=CASE v_step
         WHEN 'lunch_covers' THEN '3/11 · Comensales almuerzo:'
         WHEN 'lunch_food' THEN '4/11 · Ingresos COMIDA almuerzo (€):'
         WHEN 'lunch_beverage' THEN '5/11 · Ingresos BEBIDAS almuerzo (€):'
         WHEN 'lunch_basis' THEN '6/11 · Almuerzo: BRUTO (IGIC incluido) o NETO (sin IGIC):'
         WHEN 'dinner_status' THEN '7/11 · ¿Cena abierta o cerrada? ABIERTO o CERRADO:'
         WHEN 'dinner_covers' THEN '8/11 · Comensales cena:'
         WHEN 'dinner_food' THEN '9/11 · Ingresos COMIDA cena (€):'
         WHEN 'dinner_beverage' THEN '10/11 · Ingresos BEBIDAS cena (€):'
         WHEN 'dinner_basis' THEN '11/11 · Cena: BRUTO (IGIC incluido) o NETO (sin IGIC):'
         ELSE '' END;
     END IF;
     IF v_step='confirm' AND v_saved IS NULL AND
        v_reply='' THEN
       v_reply:='📋 RESUMEN — '||(v_data->>'date')||
         E'\nAlmuerzo: '||(v_data->'lunch'->>'status')||
         ', '||(v_data->'lunch'->>'covers')||' personas, comida '||
         (v_data->'lunch'->>'food')||' €, bebidas '||
         (v_data->'lunch'->>'beverage')||' €, base '||
         (v_data->'lunch'->>'basis')||
         E'\nCena: '||(v_data->'dinner'->>'status')||
         ', '||(v_data->'dinner'->>'covers')||' personas, comida '||
         (v_data->'dinner'->>'food')||' €, bebidas '||
         (v_data->'dinner'->>'beverage')||' €, base '||
         (v_data->'dinner'->>'basis')||
         E'\n\nSe guardará como BORRADOR, nunca finalizado.'||
         E'\nEscribe CONFIRMAR o /cancel.';
     END IF;
     IF v_saved IS NULL THEN
       UPDATE public.analytics_telegram_entry_sessions SET
         step=v_step,data=v_data,expires_at=now()+interval '30 minutes',updated_at=now()
       WHERE chat_id=p_chat_id AND sender_id=p_sender_id;
     END IF;
   END IF;
 END IF;
 UPDATE public.analytics_telegram_entry_updates
    SET reply=v_reply,saved_day_id=v_saved WHERE update_id=p_update_id;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'reply',v_reply,
   'saved_day_id',v_saved);
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_telegram_entry_process(text,text,bigint,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_telegram_entry_process(text,text,bigint,text,uuid)
  TO service_role;
COMMIT;
