# SECURITY HOTFIX — anonymous reservation access (2026-11-08)

## Finding
Live Supabase SQL Editor metadata supplied by the restaurant owner showed:
- Policy `Allow anon read reservations for dashboard MVP`: `SELECT TO anon USING(true)`.
- Policy `Allow anon update reservation status for dashboard MVP`: `UPDATE TO anon USING(true)` (new-status check only).
- Policy `Allow public reservation requests`: `INSERT TO anon` for `status='pending'` and `source='website'`.

With applicable table/column grants, the first two policies permit anonymous access to reservation records and arbitrary-row updates. The reservations table contains names, phones, email addresses and notes; treat as **potential P0 privacy/security exposure** until actual privileges and access logs are reviewed. The policy outputs alone do not prove unauthorized disclosure occurred.

## Immediate action
**Run** `supabase/migrations/20261108_emergency_reservations_anon_containment.sql` in the LIVE project's SQL Editor after confirming the project identifier, even before merge. The migration:
1. Drops only the two dangerous permissive anonymous SELECT/UPDATE policies.
2. Revokes anonymous SELECT/UPDATE/DELETE table grants.
3. Leaves existing `INSERT` policy and grant untouched, so pending website reservations remain allowed *in principle*.
4. Runs in an atomic `BEGIN/COMMIT` transaction and is safe to repeat (idempotent drops/revokes).

The SQL does not require, use or expose admin credentials in the frontend. Do not re-create the old MVP policies as a rollback.

## Breaking behavior — intentionally contained
The repository's current clients rely on those insecure reads:
- `Locale.jsx` public reservation form reads reservation rows to calculate occupancy. This will fail (and could block new booking submissions if capacity validation fails).
- `VirtualAgent.jsx` reads reservation rows for capacity and looks up PII by phone to modify reservations. These must be replaced by server-side aggregate capacity and verified ownership actions; never restore phone-based broad SELECT.
- `ReservationsDashboard.jsx` uses `supabase.from('reservations')` and legacy Manager UI relies partly on `VITE_MANAGER_PASSWORD` in JS and `sessionStorage`. Not a trusted server credential. Proper staff authentication with a validated owner/admin role and DB policy is required.
- `reservation-telegram-notify` accepts client-supplied reservation information: independently evaluate abuse risks and verify booking provenance in a server-side process.
- `reservation_slot_blocks` migration also grants broad anonymous writes (in source), so inspect its live policies and grant settings; do not assume they are safe or active.

**Operational mitigation:** temporarily handle reservations manually via the authorized back office / telephone until the safe booking flow has been verified. Do not silently claim reservations are available if the capacity query fails. Keep all existing real records; do not create fake production bookings.

## Verify containment (read-only SQL)
Run after the emergency migration:
```sql
SELECT policyname,roles,cmd,qual,with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='reservations'
ORDER BY policyname;
```
Expected: `Allow public reservation requests` for anonymous `INSERT` remains, the two MVP policies are **absent**. Check table and column privileges separately with the Phase 15 read-only diagnostic.

## Required follow-up (do not declare done yet)
- Replace public capacity queries with a server-side, **aggregate-only** database RPC; no names/phones/emails/booking IDs; enforce limits and ideally atomic capacity check on INSERT to prevent races/overbooking.
- Replace chatbot search/change by phone with owner-authenticated flow (e.g. verified token, expiring signed booking capability, appropriate abuse controls), or disable until secure.
- Require Supabase authenticated owner/admin role for all private Manager booking reads and writes, with least-privilege RLS/RPC.
- Move Telegram notifications to verified server-side event or DB trigger and rate-limit; no client-provided fake reservation payload.
- Audit `reservation_slot_blocks` policies, storage and remaining Manager modules.
- Re-run Phase 15/16 end-to-end tests with synthetic staging records, then release.

**Never paste any real reservation names, phone numbers, emails, customer notes, service role keys or Telegram bot tokens into a GitHub issue.**
