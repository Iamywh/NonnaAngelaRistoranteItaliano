# Backend access remediation — release proposal

Production inspected read-only on 2026-11-14, project nxjycaopvenshtmfntle.

## Confirmed findings

- manager-manual-docs v17 still compares x-manager-password with MANAGER_PASSWORD; frontend sends a user JWT. Its gateway verify_jwt is true. Four expected PDFs exist in a private bucket. This explains the exact live error; it is not missing files.
- authenticated effectively has TRUNCATE on analytics_daily_entries and analytics_service_entries. RLS does not control that privilege. This finding alone does not demonstrate a public HTTP endpoint exposing TRUNCATE.
- anon has table-wide INSERT on reservations, including server/staff fields. The current INSERT policy checks only legacy status/source, not reservation_status/service_status.
- Only trg_reservations_updated_at is active on reservations; the blocked-slot trigger in the repository is not deployed. Atomic capacity, closure/slot validation and notification outbox remain separate unfinished work.

## Prepared changes

1. `20261114175248_audit_revoke_analytics_truncate.sql`: revoke TRUNCATE from PUBLIC/anon/authenticated, assert no inherited privilege remains. Preserve SELECT and service-role/owner privileges.
2. `20261114175415_audit_public_reservation_permissions.sql`: column-scoped anonymous INSERT preserving current form and assistant payloads, plus restrictive pending/not_arrived/website policy. No public SELECT or UPDATE added.
3. `manager-manual-docs/index.ts` plus `handler.mjs`: validate JWT via Auth getUser, require active owner/admin read from analytics_user_roles, fixed PDF paths and private responses. No shared-password fallback. Upload bounded to 10 MB and PDF header checked. Keep gateway JWT verification enabled, matching production.

## Validation

255 passing tests, 6 pre-existing TODO. New PGlite tests execute migrations twice, verify remaining grants, allow a synthetic pending request and deny staff-field insertion, forged states, public SELECT and TRUNCATE. Manual handler tests cover no/expired credentials, nonstaff/inactive users, active owner/admin status/download and synthetic upload. Storage/Auth calls are mocked; no actual production writes or Telegram sends.

## Approval and release order

Production changes are NOT applied. After approval:

1. Apply the TRUNCATE migration and read back has_table_privilege for both tables/roles.
2. Apply reservation INSERT migration and inspect column grants/policies. No live booking should be created merely to test this.
3. Deploy the two-file manual function with verify_jwt=true. No new secrets are required. Existing user JWT and service-role secret remain server-side.
4. Use an authorized account to check status and download one existing PDF; confirm 401 without session and 403 for a real nonstaff test account. No upload/overwrite in production. Retain pending status until this authenticated E2E is observed.

These changes do not require merging the frontend PR stack first. A repository merge is a separate approval from applying the prepared backend artifacts.

## Rollback

These migrations do not alter rows. Prefer forward correction of any accidentally omitted public INSERT column; do not automatically restore table-wide INSERT or TRUNCATE. Keep the predeployment function version for emergency rollback, but it would restore the old shared-password incompatibility. Never make the manual bucket public as a workaround. No data restore is necessary for these permission changes.

## Remaining advisory triage

RLS-enabled tables with no policies can be intentional when accessed exclusively through authorized RPCs. Executable SECURITY DEFINER warnings must be reviewed by function; do not blanket-revoke working public loyalty/capacity APIs or staff RPCs. `set_updated_at` has mutable search_path; pg_net is installed in public; leaked-password protection is disabled. These are recorded, not silently changed.

References: https://supabase.com/docs/guides/functions/auth ; https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

## Production execution — 14 November 2026

Explicit user approval received for the two migrations and manual function deployment (not PR merges).
Both migrations applied successfully. Readback confirms authenticated SELECT retained and TRUNCATE denied on both Analytics tables; service_role retains TRUNCATE. Anonymous reservation INSERT is allowed on the 15 request columns and denied on 11 internal/server columns. Public SELECT remains denied. Restrictive pending/website/not_arrived policy verified.

manager-manual-docs v18 is ACTIVE with verify_jwt=true; retrieved deployed files confirm Auth getUser validation and no MANAGER_PASSWORD fallback. Bucket remains private. Live HTTP request without Authorization returns 401 UNAUTHORIZED_NO_AUTH_HEADER. No real rows changed or messages sent; no production upload performed.

Authorized account status/download and nonstaff authenticated HTTP verification are still pending: these require real test-user sessions. Do not equate deployment/401 verification with successful authenticated PDF E2E. GitHub PRs remain unmerged by this execution.
