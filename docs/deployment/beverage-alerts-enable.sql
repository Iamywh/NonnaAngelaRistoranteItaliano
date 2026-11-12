-- Run after the migration and Edge Function deployment. No private secret is printed.
-- Replace <SUPABASE_ANON_KEY> with this project's public legacy anon key.
-- Keep the gateway JWT check enabled; a single-use, short-lived dispatch ticket is also required.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
-- pg_net is platform-owned and can grant PUBLIC queue access. Never place reusable
-- private credentials here. Dispatch tickets are single-use and expire in two minutes.
DO $$
BEGIN
 IF '<SUPABASE_ANON_KEY>' !~ '^eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' THEN
  RAISE EXCEPTION 'Replace the public legacy anon key placeholder before enabling';
 END IF;
 UPDATE public.beverage_alert_settings SET
  endpoint='https://nxjycaopvenshtmfntle.supabase.co/functions/v1/beverage-telegram-alerts',
  gateway_anon_key='<SUPABASE_ANON_KEY>',enabled=true WHERE id=1;
END; $$;
CREATE OR REPLACE FUNCTION public.beverage_alert_tick() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.beverage_alert_settings%ROWTYPE; token text; request_id bigint;
BEGIN
 SELECT * INTO cfg FROM public.beverage_alert_settings WHERE id=1 FOR UPDATE;
 IF NOT cfg.enabled THEN RETURN NULL; END IF;
 PERFORM public.beverage_alert_due();
 -- A crashed worker may already have delivered. Flag for review; never resend blindly.
 UPDATE public.beverage_alert_outbox SET state='uncertain',finished_at=now(),error_code='worker_interrupted'
 WHERE state='sending' AND claimed_at<now()-interval '5 minutes';
 IF NOT EXISTS(SELECT 1 FROM public.beverage_alert_outbox WHERE state='pending') THEN RETURN NULL; END IF;
 IF cfg.last_dispatch_at>now()-interval '45 seconds' THEN RETURN NULL; END IF;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 UPDATE public.beverage_alert_settings SET secret_hash=sha256(convert_to(token,'UTF8')),
  ticket_expires_at=now()+interval '2 minutes' WHERE id=1;
 SELECT net.http_post(url:=cfg.endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||cfg.gateway_anon_key,'apikey',cfg.gateway_anon_key,'x-beverage-ticket',token),
  body:='{}'::jsonb,timeout_milliseconds:=60000) INTO request_id;
 UPDATE public.beverage_alert_settings SET last_dispatch_at=now() WHERE id=1;
 RETURN request_id;
END; $$;
REVOKE ALL ON FUNCTION public.beverage_alert_tick() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('nonna-beverage-alerts','* * * * *','SELECT public.beverage_alert_tick();');
COMMIT;
SELECT enabled,endpoint FROM public.beverage_alert_settings;
SELECT jobname,schedule,active FROM cron.job WHERE jobname='nonna-beverage-alerts';
