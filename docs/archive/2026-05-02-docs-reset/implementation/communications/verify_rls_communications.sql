-- Card 10 — RLS verification helpers for communication_* tables
-- Run fragments in Dashboard SQL or psql. Replace placeholders.

-- Prerequisites: UUIDs below must exist (use real staging test users/orgs).

-- =====================================================================
-- A) Sanity: tables and RLS on
select c.relname, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'communication_provider_bindings',
    'communication_threads',
    'communication_messages',
    'communication_message_reads'
  );

-- =====================================================================
-- B) As service role / postgres: insert smoke row (SERVICE KEY or postgres only)
-- Example: insert minimal thread + message for org UUID ORG_HERE
/*
insert into communication_threads (org_id, primary_entity_type, primary_entity_id, channel, recipient_key)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'jobs',
  '00000000-0000-0000-0000-000000000002'::uuid,
  'email',
  'recipient@example.com'
)
returning id;
*/

-- =====================================================================
-- C) As authenticated JWT (use Supabase "Run as user" / client with user token):
--    SELECT threads for own org → expect owned rows only.
-- Cannot be run as raw SQL without JWT; instead use Vitest/integration or sql with:
-- set local role authenticated; set request.jwt.claim...

-- =====================================================================
-- D) Policy enumeration (inspect definitions)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename like 'communication%'
order by tablename, policyname;
