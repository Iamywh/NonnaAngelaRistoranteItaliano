BEGIN;
CREATE TABLE public.beverage_alert_settings (
 id smallint PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false,
 endpoint text, gateway_anon_key text, secret_hash bytea, last_dispatch_at timestamptz,
 CHECK(endpoint IS NULL OR endpoint ~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/beverage-telegram-alerts$')
);
INSERT INTO public.beverage_alert_settings(id) VALUES(1);
CREATE TABLE public.beverage_alert_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL, part integer NOT NULL,
 kind text NOT NULL CHECK(kind IN ('empty','weekly','test')),
 message text NOT NULL CHECK(octet_length(message)<=3500),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','uncertain')),
 attempts integer NOT NULL DEFAULT 0, attempt uuid, created_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz, finished_at timestamptz, error_code text,
 UNIQUE(event_key,part)
);
ALTER TABLE public.beverage_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beverage_alert_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beverage_alert_settings, public.beverage_alert_outbox FROM PUBLIC,anon,authenticated;
CREATE INDEX beverage_alert_pending ON public.beverage_alert_outbox(created_at) WHERE state='pending';

CREATE FUNCTION public.beverage_alert_enqueue(p_key text,p_kind text,p_heading text,p_lines text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_text text:=p_heading; v_line text; v_part int:=1; v_count int:=0; v_rows int;
BEGIN
 -- Atomic key-level lock prevents concurrent producers from making mixed multipart events.
 PERFORM pg_advisory_xact_lock(hashtextextended('beverage:'||p_key,0));
 IF EXISTS(SELECT 1 FROM public.beverage_alert_outbox WHERE event_key=p_key) THEN RETURN 0; END IF;
 FOREACH v_line IN ARRAY p_lines LOOP
  IF octet_length(v_text||E'\n'||v_line)>3200 THEN
   INSERT INTO public.beverage_alert_outbox(event_key,part,kind,message)
   VALUES(p_key,v_part,p_kind,v_text); v_count:=v_count+1; v_part:=v_part+1; v_text:=p_heading||E'\n(continua)';
  END IF;
  v_text:=v_text||E'\n'||v_line;
 END LOOP;
 INSERT INTO public.beverage_alert_outbox(event_key,part,kind,message) VALUES(p_key,v_part,p_kind,v_text);
 RETURN v_count+1;
END; $$;

CREATE FUNCTION public.beverage_alert_on_save() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_lines text[]; v_previous jsonb:='[]'::jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.beverage_alert_settings WHERE id=1 AND enabled) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN v_previous:=OLD.categories; END IF;
 SELECT array_agg('• '||left(c->>'title',100)||' — '||left(i->>'name',200)||' = 0 '||left(c->>'unit',40) ORDER BY c->>'title',i->>'name')
 INTO v_lines FROM jsonb_array_elements(NEW.categories) c
 CROSS JOIN LATERAL jsonb_array_elements(c->'items') i
 WHERE (i->>'quantity')::numeric=0 AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_previous) oc
  CROSS JOIN LATERAL jsonb_array_elements(oc->'items') oi
  WHERE oc->>'id'=c->>'id' AND oi->>'name'=i->>'name' AND (oi->>'quantity')::numeric=0
 );
 IF coalesce(cardinality(v_lines),0)>0 THEN
  PERFORM public.beverage_alert_enqueue('inventory:'||NEW.version,'empty',
   'NONNA ANGELA · Bevande esaurite'||E'\nConteggio salvato: '||to_char(NEW.updated_at AT TIME ZONE 'Atlantic/Canary','DD/MM/YYYY HH24:MI')||
   E'\nVerificare le scorte prima di ordinare.\nhttps://nonnaangelaristorante.netlify.app/manager',v_lines);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER beverage_alert_after_save AFTER INSERT OR UPDATE OF categories ON public.beverage_inventory
FOR EACH ROW EXECUTE FUNCTION public.beverage_alert_on_save();

CREATE FUNCTION public.beverage_alert_summary(p_key text,p_test boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_inventory public.beverage_inventory%ROWTYPE; v_lines text[]; v_heading text; v_total int; v_zero int;
BEGIN
 SELECT * INTO v_inventory FROM public.beverage_inventory WHERE id=1;
 v_heading:=CASE WHEN p_test THEN 'TEST · NON ORDINARE — ' ELSE '' END||'NONNA ANGELA · Riepilogo bevande';
 IF NOT FOUND THEN
  v_lines:=ARRAY['Inventario condiviso non ancora salvato. Nessuna disponibilità verificabile.'];
 ELSE
  SELECT count(*),count(*) FILTER(WHERE (i->>'quantity')::numeric=0),
   array_agg(CASE WHEN (i->>'quantity')::numeric=0 THEN '[ESAURITO] ' ELSE '• ' END||left(c->>'title',100)||' — '||left(i->>'name',200)||': '||(i->>'quantity')||' '||left(c->>'unit',40) ORDER BY c->>'title',i->>'name')
  INTO v_total,v_zero,v_lines
  FROM jsonb_array_elements(v_inventory.categories) c CROSS JOIN LATERAL jsonb_array_elements(c->'items') i;
  v_heading:=v_heading||E'\nUltimo conteggio: '||to_char(v_inventory.updated_at AT TIME ZONE 'Atlantic/Canary','DD/MM/YYYY HH24:MI')||' (Tenerife)'||
   E'\nProdotti: '||v_total||' · Esauriti: '||v_zero;
  IF v_inventory.updated_at<now()-interval '7 days' THEN v_heading:=v_heading||E'\nATTENZIONE: inventario non aggiornato da oltre 7 giorni.'; END IF;
  v_lines:=coalesce(v_lines,ARRAY['Nessun prodotto presente.']);
 END IF;
 v_heading:=v_heading||E'\nLe quantità sono quelle salvate dal personale.\nhttps://nonnaangelaristorante.netlify.app/manager';
 RETURN public.beverage_alert_enqueue(p_key,CASE WHEN p_test THEN 'test' ELSE 'weekly' END,v_heading,v_lines);
END; $$;

CREATE FUNCTION public.beverage_alert_due(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE local_time timestamp:=p_now AT TIME ZONE 'Atlantic/Canary';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.beverage_alert_settings WHERE id=1 AND enabled) THEN RETURN 0; END IF;
 -- Retry the Sunday window after a delayed cron, once per local date. DST handled by zone.
 IF extract(isodow FROM local_time)=7 AND local_time::time>=time '18:00' THEN
  RETURN public.beverage_alert_summary('weekly:'||local_time::date);
 END IF;
 RETURN 0;
END; $$;

CREATE FUNCTION public.beverage_alert_authorize(p_secret text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(length(p_secret)=64 AND EXISTS(
 SELECT 1 FROM public.beverage_alert_settings WHERE id=1 AND enabled
 AND secret_hash=sha256(convert_to(p_secret,'UTF8'))),false);
$$;
CREATE FUNCTION public.beverage_alert_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.beverage_alert_outbox%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.beverage_alert_settings WHERE id=1 AND enabled) THEN RETURN NULL; END IF;
 SELECT * INTO v FROM public.beverage_alert_outbox WHERE state='pending' ORDER BY created_at,part,id
 FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.beverage_alert_outbox SET state='sending',attempt=gen_random_uuid(),attempts=attempts+1,claimed_at=now()
 WHERE id=v.id RETURNING * INTO v;
 RETURN jsonb_build_object('id',v.id,'attempt',v.attempt,'text',v.message);
END; $$;
CREATE FUNCTION public.beverage_alert_finish(p_id uuid,p_attempt uuid,p_state text,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_state NOT IN ('sent','failed','uncertain') OR p_state IS NULL THEN RAISE EXCEPTION 'Invalid delivery state'; END IF;
 UPDATE public.beverage_alert_outbox SET state=p_state,finished_at=now(),error_code=left(p_error,80)
 WHERE id=p_id AND attempt=p_attempt AND state='sending';
 RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.beverage_alert_enqueue(text,text,text,text[]),public.beverage_alert_on_save(),
 public.beverage_alert_summary(text,boolean),public.beverage_alert_due(timestamptz),
 public.beverage_alert_authorize(text),public.beverage_alert_claim(),public.beverage_alert_finish(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beverage_alert_authorize(text),public.beverage_alert_claim(),public.beverage_alert_finish(uuid,uuid,text,text) TO service_role;
COMMIT;
