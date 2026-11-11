-- SECURITY INCIDENT CONTAINMENT: 2026-11-08
-- Deny anonymous reads and updates of all reservations, including PII.
-- Do NOT restore the permissive dashboard MVP policies.
-- This is deliberately idempotent. Run immediately in the LIVE Supabase
-- SQL Editor even before merging this PR, then merge the PR for versioning.
--
-- BREAKING BY DESIGN:
--  - public capacity checks using .from('reservations').select() will fail;
--  - public chatbot phone search and modification will fail;
--  - legacy Manager reservations dashboard using anon role cannot read/update.
--  - anonymous INSERT policy for pending website bookings remains untouched.
--
-- Follow-up: replace public reads with non-identifying server-only capacity
-- RPC, replace phone lookup with authenticated/verified ownership flow,
-- and migrate Manager to Supabase authenticated role-based authorization.
BEGIN;

DROP POLICY IF EXISTS
  "Allow anon read reservations for dashboard MVP"
  ON public.reservations;

DROP POLICY IF EXISTS
  "Allow anon update reservation status for dashboard MVP"
  ON public.reservations;

REVOKE SELECT, UPDATE, DELETE
  ON TABLE public.reservations FROM anon;

-- Intentionally do not modify INSERT policies, service role, or
-- authenticated role grants/policies without inspecting production first.
COMMIT;
