-- Phase 12B/1: /startexpense through the EXISTING private Analytics bot.
-- Apply once, AFTER 20261102_create_analytics_telegram_entry.sql and expenses migrations.
-- Preserves /startentry, the existing webhook, the existing bot token and Telegram update receipts.
-- Data model: one TOTAL per (daily/monthly, period, category), NOT individual invoices.
-- Expense ids are deliberately NOT FK-linked in receipts/audit: the existing manager
-- delete RPC must still be able to remove a total while preserving audit history.
BEGIN;

ALTER TABLE public.analytics_telegram_entry_updates
  ADD COLUMN IF NOT EXISTS saved_expense_id uuid;

CREATE TABLE IF NOT EXISTS public.analytics_telegram_expense_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL UNIQUE,
  telegram_update_id bigint NOT NULL UNIQUE REFERENCES public.analytics_telegram_entry_updates(update_id),
  period_kind text NOT NULL CHECK(period_kind IN ('daily','monthly')),
  period_date date NOT NULL,
  category text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  snapshot jsonb NOT NULL,
  source text NOT NULL DEFAULT 'analytics_telegram_bot' CHECK(source='analytics_telegram_bot'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_telegram_expense_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_telegram_expense_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.analytics_telegram_expense_audit TO authenticated;
DROP POLICY IF EXISTS analytics_telegram_expense_audit_read ON public.analytics_telegram_expense_audit;
CREATE POLICY analytics_telegram_expense_audit_read
 ON public.analytics_telegram_expense_audit FOR SELECT TO authenticated
 USING ((SELECT public.analytics_has_permission('analytics.read')));

CREATE OR REPLACE FUNCTION public.analytics_telegram_entry_process(
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
 v_saved_expense uuid; v_index integer; v_new jsonb;
 v_expense_keys text[] := ARRAY[
   'food_purchases','beverage_purchases','payroll','rent','utilities','marketing',
   'cleaning_supplies','packaging','maintenance','professional_services','bank_fees','other'
 ];
 v_expense_labels text[] := ARRAY[
   'Alimentos','Bebidas','Nóminas','Alquiler','Suministros','Marketing',
   'Limpieza','Embalajes','Mantenimiento','Servicios profesionales','Comisiones','Otros'
 ];
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
     'reply',v_previous.reply,'saved_day_id',v_previous.saved_day_id,
     'saved_expense_id',v_previous.saved_expense_id);
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
 ELSIF lower(v_text) IN ('/startexpense','/startexpense@nonnaangelanalyticsbot') THEN
   INSERT INTO public.analytics_telegram_entry_sessions
     (chat_id,sender_id,step,data,expires_at)
   VALUES(p_chat_id,p_sender_id,'expense_period','{}'::jsonb,now()+interval '30 minutes')
   ON CONFLICT(chat_id,sender_id) DO UPDATE SET
     step='expense_period',data='{}'::jsonb,expires_at=now()+interval '30 minutes',
     updated_at=now();
   v_reply:=E'🧾 Gastos — Nonna Angela\n\n'
     ||E'1/8 · ¿Gasto DIARIO o MENSUAL?\n'
     ||E'Se guardan TOTALES por categoría, NO facturas individuales.\n'
     ||'Para cancelar: /cancel';
 ELSIF lower(v_text)='/cancel' THEN
   DELETE FROM public.analytics_telegram_entry_sessions
     WHERE chat_id=p_chat_id AND sender_id=p_sender_id;
   v_reply := 'Entrada cancelada. No se ha guardado nada. /startentry para empezar.';
 ELSIF lower(v_text) IN ('/help','/start') THEN
   v_reply := E'🤖 Nonna Angela Analytics\n/startentry — Registrar una jornada\n'
     ||E'/startexpense — Registrar total de gastos por categoría\n/cancel — Cancelar el formulario\n'
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
     IF v_step='expense_period' THEN
       IF lower(v_text) NOT IN ('diario','mensual') THEN
         v_reply:='Indica DIARIO o MENSUAL.';
       ELSE
         v_data:=jsonb_set(v_data,'{kind}',to_jsonb(
           CASE WHEN lower(v_text)='diario' THEN 'daily'::text ELSE 'monthly'::text END),true);
         v_step:='expense_date';
         v_reply:=CASE WHEN v_data->>'kind'='daily'
           THEN '2/8 · Fecha del gasto (AAAA-MM-DD, hoy o ayer):'
           ELSE '2/8 · Mes del coste fijo (AAAA-MM):' END;
       END IF;
     ELSIF v_step='expense_date' THEN
       v_value:=v_text;
       IF v_data->>'kind'='daily' AND lower(v_text)='hoy' THEN
         v_value:=v_today::text;
       ELSIF v_data->>'kind'='daily' AND lower(v_text)='ayer' THEN
         v_value:=(v_today-1)::text;
       ELSIF v_data->>'kind'='monthly' AND
         v_text ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
         v_value:=v_text||'-01';
       END IF;
       IF v_value ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
         BEGIN
           v_date:=to_date(v_value,'YYYY-MM-DD');
           IF to_char(v_date,'YYYY-MM-DD')<>v_value THEN v_date:=NULL; END IF;
         EXCEPTION WHEN OTHERS THEN v_date:=NULL;
         END;
       END IF;
       IF v_date IS NULL OR v_date>v_today OR v_date<v_today-366 OR
           (v_data->>'kind'='monthly' AND extract(day FROM v_date)<>1) THEN
         v_reply:='Fecha no válida o fuera de rango (máx. 366 días atrás, sin futuro).';
       ELSIF EXISTS(SELECT 1 FROM public.analytics_monthly_closures
              WHERE month_start=date_trunc('month',v_date)::date) THEN
         v_reply:='Ese mes está cerrado. Elige otra fecha o /cancel.';
       ELSE
         v_data:=jsonb_set(v_data,'{date}',to_jsonb(v_date::text),true);
         v_step:='expense_category';
         v_reply:=E'3/8 · Elige la categoría escribiendo su número:\n'
           ||E'1 Alimentos · 2 Bebidas · 3 Nóminas · 4 Alquiler\n'
           ||E'5 Suministros · 6 Marketing · 7 Limpieza · 8 Embalajes\n'
           ||'9 Mantenimiento · 10 Servicios profesionales · 11 Comisiones · 12 Otros';
       END IF;
     ELSIF v_step='expense_category' THEN
       IF v_text !~ '^([1-9]|1[0-2])$' THEN
         v_reply:='Escribe un número entre 1 y 12.';
       ELSE
         v_index:=v_text::integer;
         v_value:=v_expense_keys[v_index];
         IF EXISTS (SELECT 1 FROM public.analytics_expenses
           WHERE period_kind=v_data->>'kind'
           AND period_date=(v_data->>'date')::date AND category=v_value) THEN
           v_reply:='Ya hay un TOTAL registrado para esa categoría y período. '
             ||'No se sustituirá por Telegram. Edita el total en la web o elige otra categoría.';
         ELSE
           v_data:=jsonb_set(v_data,'{category}',to_jsonb(v_value),true);
           v_data:=jsonb_set(v_data,'{category_label}',to_jsonb(v_expense_labels[v_index]),true);
           v_step:='expense_amount';
           v_reply:='4/8 · Importe total (€), positivo, con hasta 2 decimales. Ejemplo: 124,50';
         END IF;
       END IF;
     ELSIF v_step='expense_amount' THEN
       IF v_text !~ '^[0-9]{1,9}([,.][0-9]{1,2})?$' THEN
         v_reply:='Importe inválido. Usa 123,45 (sin separador de miles).';
       ELSE
         v_number:=replace(v_text,',','.')::numeric;
         IF v_number<=0 THEN
           v_reply:='El importe debe ser mayor que cero.';
         ELSE
           v_data:=jsonb_set(v_data,'{amount}',to_jsonb(to_char(v_number,'FM9999999990.00')),true);
           v_step:='expense_basis';
           v_reply:='5/8 · ¿El importe es BRUTO (IGIC incluido, si aplica) o NETO?';
         END IF;
       END IF;
     ELSIF v_step='expense_basis' THEN
       IF lower(v_text) NOT IN ('bruto','neto','gross','net') THEN
         v_reply:='Escribe BRUTO o NETO.';
       ELSE
         v_data:=jsonb_set(v_data,'{basis}',to_jsonb(
           CASE WHEN lower(v_text) IN ('bruto','gross')
             THEN 'gross'::text ELSE 'net'::text END),true);
         v_step:='expense_igic';
         v_reply:='6/8 · IGIC conocido (€): escribe importe exacto o NO si no tienes desglose. '
           ||'No se calcula automáticamente.';
       END IF;
     ELSIF v_step='expense_igic' THEN
       IF upper(v_text)='NO' THEN
         v_data:=jsonb_set(v_data,'{igic}','null'::jsonb,true);
         v_step:='expense_notes';
         v_reply:='7/8 · Notas/proveedor (máximo 100 caracteres) o - para omitir:';
       ELSIF v_text !~ '^[0-9]{1,9}([,.][0-9]{1,2})?$' THEN
         v_reply:='Indica un importe IGIC válido (0 permitido), o NO.';
       ELSE
         v_number:=replace(v_text,',','.')::numeric;
         IF v_data->>'basis'='gross' AND v_number>(v_data->>'amount')::numeric THEN
           v_reply:='El IGIC no puede superar el importe BRUTO. Corrige el valor.';
         ELSE
           v_data:=jsonb_set(v_data,'{igic}',to_jsonb(to_char(v_number,'FM9999999990.00')),true);
           v_step:='expense_notes';
           v_reply:='7/8 · Notas/proveedor (máximo 100 caracteres) o - para omitir:';
         END IF;
       END IF;
     ELSIF v_step='expense_notes' THEN
       v_data:=jsonb_set(v_data,'{notes}',
         to_jsonb(CASE WHEN v_text='-' THEN ''::text ELSE v_text END),true);
       v_step:='expense_confirm';
     ELSIF v_step='expense_confirm' THEN
       IF upper(v_text)<>'CONFIRMAR' THEN
         v_reply:='Para guardar, escribe CONFIRMAR. Para cancelar, /cancel.';
       ELSIF p_actor IS NULL OR NOT EXISTS(
         SELECT 1 FROM public.analytics_user_roles r
         WHERE r.user_id=p_actor AND r.is_active AND r.role IN ('owner','admin')
       ) THEN
         v_reply:='No hay propietario Analytics autorizado. No se guardó ningún gasto.';
       ELSE
         v_date:=(v_data->>'date')::date;
         v_value:=v_data->>'category';
         -- Same per-month lock as close-finalization; never insert into closed periods.
         PERFORM pg_advisory_xact_lock(
           hashtext('nonna_month_close'),
           hashtext(date_trunc('month',v_date)::date::text)
         );
         PERFORM pg_advisory_xact_lock(
           hashtext('analytics_telegram_expense'),
           hashtext((v_data->>'kind')||':'||v_date::text||':'||v_value)
         );
         IF EXISTS(SELECT 1 FROM public.analytics_monthly_closures
                   WHERE month_start=date_trunc('month',v_date)::date) THEN
           v_reply:='Mes cerrado. No se ha guardado el gasto.';
         ELSIF EXISTS(SELECT 1 FROM public.analytics_expenses
           WHERE period_kind=v_data->>'kind'
           AND period_date=v_date AND category=v_value) THEN
           v_reply:='Ya existe un total de esa categoría y período. No se ha sobrescrito.';
         ELSE
           -- Insert only: a simultaneous web save must never be overwritten.
           INSERT INTO public.analytics_expenses(
             period_kind,period_date,category,amount,tax_basis,igic_amount,
             notes,created_by,updated_by)
           VALUES(v_data->>'kind',v_date,v_value,(v_data->>'amount')::numeric,
             v_data->>'basis',(v_data->>'igic')::numeric,
             nullif(btrim(v_data->>'notes'),''),p_actor,p_actor)
           ON CONFLICT(period_kind,period_date,category) DO NOTHING
           RETURNING id INTO v_id;
           IF v_id IS NULL THEN
             v_reply:='Ese total ya existe. No se ha sobrescrito.';
           ELSE
             SELECT to_jsonb(e) INTO v_new FROM public.analytics_expenses e WHERE e.id=v_id;
             INSERT INTO public.analytics_expense_audit(
               expense_id,operation,before_value,after_value,changed_by)
             VALUES(v_id,'insert',NULL,v_new,p_actor);
             INSERT INTO public.analytics_telegram_expense_audit(
               expense_id,telegram_update_id,period_kind,period_date,
               category,actor_user_id,snapshot)
             VALUES(v_id,p_update_id,v_data->>'kind',v_date,v_value,p_actor,v_data);
             v_saved_expense:=v_id;
             DELETE FROM public.analytics_telegram_entry_sessions
               WHERE chat_id=p_chat_id AND sender_id=p_sender_id;
             v_reply:='✅ Total de gastos registrado en Analytics: '
               ||v_data->>'category_label'||', '
               ||(v_data->>'amount')||' €, período '||v_date::text
               ||E'.\nRevisa los gastos en la web. No se ha estimado IGIC.';
           END IF;
         END IF;
       END IF;
     ELSIF v_step='date' THEN
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

     IF v_saved IS NULL AND v_saved_expense IS NULL AND v_step IS DISTINCT FROM 'confirm' AND
        v_reply='' THEN
       v_reply:=CASE v_step
         WHEN 'expense_amount' THEN '4/8 · Importe total (€):'
         WHEN 'expense_basis' THEN '5/8 · BRUTO o NETO:'
         WHEN 'expense_igic' THEN '6/8 · IGIC conocido o NO:'
         WHEN 'expense_notes' THEN '7/8 · Notas o - para omitir:'
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
     IF v_step='expense_confirm' AND v_saved_expense IS NULL AND
        v_reply='' THEN
       v_reply:='📋 GASTO PARA CONFIRMAR'
         ||E'\nPeríodo: '||(v_data->>'kind')||' / '||(v_data->>'date')
         ||E'\nCategoría: '||(v_data->>'category_label')
         ||E'\nImporte: '||(v_data->>'amount')||' €'
         ||E'\nBase: '||(v_data->>'basis')
         ||E'\nIGIC declarado: '||coalesce(v_data->>'igic','sin desglose')
         ||E'\nNotas: '||coalesce(nullif(v_data->>'notes',''),'-')
         ||E'\n\nSe guardará un TOTAL NUEVO. Nunca se sustituirá el existente.'
         ||E'\nEscribe CONFIRMAR o /cancel.';
     END IF;
     IF v_saved IS NULL AND v_saved_expense IS NULL THEN
       UPDATE public.analytics_telegram_entry_sessions SET
         step=v_step,data=v_data,expires_at=now()+interval '30 minutes',updated_at=now()
       WHERE chat_id=p_chat_id AND sender_id=p_sender_id;
     END IF;
   END IF;
 END IF;
 UPDATE public.analytics_telegram_entry_updates
    SET reply=v_reply,saved_day_id=v_saved,saved_expense_id=v_saved_expense
    WHERE update_id=p_update_id;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'reply',v_reply,
   'saved_day_id',v_saved,'saved_expense_id',v_saved_expense);
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_telegram_entry_process(text,text,bigint,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_telegram_entry_process(text,text,bigint,text,uuid)
 TO service_role;
COMMIT;
