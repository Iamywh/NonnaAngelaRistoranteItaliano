# Weekly closure change — 22 November 2026

Effective for reservation dates from 2026-11-22:
- Sunday: lunch only (12:30–15:30; last online arrival 15:15).
- Monday: closed all day.
- Tuesday/Wednesday reopen, using the normal weekday hours.
- Thursday–Saturday and configured Christmas/New Year exceptions unchanged.
- Earlier dates keep their former Tuesday/Wednesday closure.

Home hours, four-language copy, assistant knowledge, public form/assistant slots, manager slot groups and current-service windows are aligned.

Production: applied Supabase migration reservation_weekly_closure_from_november_22 on 2026-11-20. Reproducible SQL is in supabase/sql/reservation_weekly_closure.sql. It blocks new bookings/rescheduling into Monday or Sunday >=17:00 from the effective date, indefinitely. No bulk inserts, updates or cancellations of existing reservations. Existing bookings can still be updated without changing their date/time, or moved into an open service.

Validation: Three booking-calendar tests executed in JavaScript isolate, plus manager slot groups/current-service checks. Production SQL trigger verified on temporary synthetic table with rollback; no reservation rows modified. Full npm test/build unavailable locally because executor failed.
CI on the pull request is required before release. Supabase advisors report existing unrelated warnings; the new function is SECURITY INVOKER, fixed search_path, and not directly executable by public/anon/authenticated.

Rollback: revert frontend commit; drop trigger reservations_weekly_closure on public.reservations and then drop function public.enforce_reservation_weekly_closure(). Do not alter existing bookings.

This change enforces the new recurring closures, not all legacy opening hours, capacity or manual slot blocks.
