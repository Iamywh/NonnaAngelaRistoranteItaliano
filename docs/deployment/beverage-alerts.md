# Beverage notifications

The shared `beverage_inventory` is the only source. Kitchen inventory is excluded.

- After a saved count, a transition to zero (or a new zero item) queues an alert. Saving the same zeros does not repeat it. A refill above zero rearms the product.
- Sundays at 18:00 Atlantic/Canary: full saved quantities grouped by category, zero stock marked, last count timestamp and warning if older than seven days. The local time check handles summer time. Sunday delays catch up before midnight.
- All notifications use the existing `ORDERS_TELEGRAM_BOT_TOKEN` and `ORDERS_TELEGRAM_CHAT_ID`. No supplier receives an order automatically.
- The minute cron only invokes the worker if there are pending messages. A bounded worker sends at most five parts with 3.1 seconds between sends. Normal alert delay is about a minute; long queues take longer.

## Deploy

1. Apply `supabase/migrations/20261112010000_beverage_alerts.sql` (notifications initially disabled).
2. Deploy `beverage-telegram-alerts`. `verify_jwt=true` preserves the gateway check. In addition, the handler requires a dedicated random 64-character secret and validates its hash through a service-only RPC. Neither an anon key nor a staff JWT permits dispatch.
3. Replace its `<SUPABASE_ANON_KEY>` placeholder with the public legacy anon key (not a service key), then run `docs/deployment/beverage-alerts-enable.sql`. It installs pg_cron/pg_net, generates the private worker secret directly in Vault, stores only its hash in settings, and enables one minute job. No private key needs copying into SQL or source control. The file contains this project's public endpoint; update that URL for another project.
4. Send a clearly marked preview without changing any quantities:

```sql
SELECT public.beverage_alert_summary('test:installation-20261112',true);
SELECT public.beverage_alert_tick();
```

Read delivery status after the async request completes:

```sql
SELECT kind,state,count(*) FROM public.beverage_alert_outbox GROUP BY kind,state;
SELECT jobname,schedule,active FROM cron.job WHERE jobname='nonna-beverage-alerts';
SELECT status,return_message,start_time FROM cron.job_run_details
 WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='nonna-beverage-alerts')
 ORDER BY start_time DESC LIMIT 5;
```

## Delivery safety and operations

Outbox messages are durably claimed with an attempt UUID. Only that attempt can finalize a message. Concurrent workers skip locked rows. A successful send is never retried. An explicit Telegram rejection is `failed`; a timeout or malformed response is `uncertain`. An interrupted worker is marked uncertain after five minutes. No automatic retries of failed/uncertain sends: review Telegram and the state first. This favors avoiding duplicate procurement alerts over promising exactly-once external delivery, which Telegram does not support.

After correcting an explicit failure, a database administrator may requeue only confirmed failed messages:

```sql
UPDATE public.beverage_alert_outbox SET state='pending',error_code=NULL
 WHERE state='failed' AND id='REVIEWED_MESSAGE_UUID';
```

Do not requeue `uncertain` without checking the group. Do not expose Vault or pg_net request headers in logs/screenshots. The public RPCs and tables are denied to anon/authenticated; worker RPCs are granted only to service_role. Existing inventory save permissions are unchanged.

Pause without deleting history:

```sql
UPDATE public.beverage_alert_settings SET enabled=false WHERE id=1;
```

Re-enable after review with `enabled=true`; pending messages remain queued. No existing zeros are backfilled on activation: the installation preview and Sunday report cover the initial state.

## Tests

`node --test tests/beverageAlerts*.test.mjs` exercises zero transitions, duplicate saves, refill/rearm, new products, DST and Sunday idempotency, long-message splitting, access restrictions, unique claims, wrong attempt protection, Telegram rejection/timeout behavior, missing configuration and disabled settings. Production smoke test verifies cron → HTTP worker → Telegram without editing real inventory.
