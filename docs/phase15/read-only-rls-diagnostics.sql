-- PHASE 15 — READ ONLY access configuration inspection.
-- Paste into Supabase SQL Editor on the correct Nonna Angela project.
-- This does not inspect customer rows, perform bookings or change any objects.
-- Keep the output private: policy definitions reveal internal permission logic.

-- A. Row-level security switches for high-impact tables.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relkind IN ('r','p')
  AND c.relname IN (
    'reservations','analytics_user_roles','analytics_daily_entries',
    'analytics_expenses','loyalty_cards','loyalty_visits',
    'analytics_growth_campaigns','analytics_editorial_items',
    'analytics_creative_assets'
  )
ORDER BY c.relname;

-- B. Policies attached to reservation and manager role data.
SELECT schemaname,tablename,policyname,permissive,roles,cmd,
       qual,with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('reservations','analytics_user_roles')
ORDER BY tablename,policyname;

-- C. Table-level privileges; note that column permissions may differ.
SELECT table_schema,table_name,grantee,privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('reservations','analytics_user_roles')
  AND grantee IN ('anon','authenticated','PUBLIC')
ORDER BY table_name,grantee,privilege_type;

-- D. Column-specific reservation privileges. Compare personal columns to
-- time/guest-only fields used to calculate slot availability.
SELECT table_name,column_name,grantee,privilege_type
FROM information_schema.column_privileges
WHERE table_schema='public'
  AND table_name='reservations'
  AND grantee IN ('anon','authenticated','PUBLIC')
ORDER BY grantee,privilege_type,column_name;

-- E. Storage access policies: private Creative Library and existing buckets.
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY policyname;

-- F. Bucket privacy flags, without listing user files.
SELECT id,name,public,file_size_limit,allowed_mime_types
FROM storage.buckets
WHERE id IN ('nonna-creative-library','manager-manual')
ORDER BY id;
