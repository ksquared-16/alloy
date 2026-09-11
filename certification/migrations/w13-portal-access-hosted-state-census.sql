-- Read-only census: did 20260911140000 leave ANYTHING on the deployed primary,
-- and does the deployed primary hold `portal.access` yet.
--
-- WHY THIS EXISTS RATHER THAN RE-RUNNING THE LEDGER CENSUS. Trusted-host reads are
-- reused on `{missionId, actionType, executionSessionId, assignmentId, laneId,
-- queryHash}` with no TTL, so re-filing `hosted-migration-identity-census.sql`
-- inside the same execution run returns the EARLIER reading — in this case
-- `tha_62a0bc1ab313f7` at 16:51:52Z, which predates the 17:04 apply attempt and
-- therefore cannot say anything about what that attempt left behind. A census
-- that answers a question it was not asked is worse than no census.
--
-- This is not the same query with the hash perturbed. It asks a question the
-- ledger census does not ask at all: not *where is the ledger head*, but *does
-- the capability exist, and who holds it*. `20260911140000` writes a catalog row
-- and grant rows before it writes anything else, so those rows are what a
-- partial apply would have left. `apply.ok = false` with
-- `code = target_resolution_failed` says the runner never resolved which database
-- to talk to, let alone opened a connection — but a promotion decision should
-- rest on a measurement, not on reading a failure message.
--
-- It is also the verification query for AFTER the apply finally lands: the same
-- four rows read `false / 0 / 0 / <count>` before and
-- `true / <orgs> / <orgs> / <count>` after.
--
-- Shape follows `hosted-migration-identity-census.sql`: three columns, the payload
-- from the third position onward, one statement, no DDL and no writes.
select question_id, kind, payload
from (
    -- 1. THE CATALOG ROW. `20260911140000` §1 writes this first. Its absence is
    --    the strongest single statement that nothing landed.
    select
        'w13'::text     as question_id,
        'check'::text   as kind,
        ('permission_definitions ~ portal.access ~ present ~ '
         || (exists (
                select 1 from public.permission_definitions
                 where key = 'portal.access' and is_active = true
            ))::text)   as payload,
        'a1'::text      as sort_key

    union all

    -- 2. THE PRESERVATION GRANTS. One per org that defines `admin`. Zero before,
    --    and equal to row 4 after — a partial apply would land between them.
    select
        'w13'::text, 'check'::text,
        ('role_permission_grants ~ portal.access ~ admin_orgs ~ '
         || (select count(*)::text
               from public.role_permission_grants g
              where g.permission_key = 'portal.access'
                and g.role_key = 'admin'
                and g.allowed)),
        'a2'::text

    union all

    select
        'w13'::text, 'check'::text,
        ('role_permission_grants ~ portal.access ~ ops_orgs ~ '
         || (select count(*)::text
               from public.role_permission_grants g
              where g.permission_key = 'portal.access'
                and g.role_key = 'ops'
                and g.allowed)),
        'a3'::text

    union all

    -- 3. THE DENOMINATOR. How many orgs define each role, so rows 2 and 3 are
    --    readable as "all of them" or "some of them" rather than as bare counts.
    select
        'w13'::text, 'check'::text,
        ('role_definitions ~ admin ~ orgs ~ '
         || (select count(*)::text from public.role_definitions where role_key = 'admin')),
        'a4'::text

    union all

    select
        'w13'::text, 'check'::text,
        ('role_definitions ~ ops ~ orgs ~ '
         || (select count(*)::text from public.role_definitions where role_key = 'ops')),
        'a5'::text

    union all

    -- 4. NOBODY ELSE. A preservation migration that widens is not a preservation
    --    migration, and this is the row that would catch it.
    select
        'w13'::text, 'check'::text,
        ('role_permission_grants ~ portal.access ~ other_roles ~ '
         || (select count(*)::text
               from public.role_permission_grants g
              where g.permission_key = 'portal.access'
                and g.role_key not in ('admin', 'ops')
                and g.allowed)),
        'a6'::text

    union all

    -- 5. THE LEDGER, so this census answers the parity question too and a caller
    --    does not have to correlate two readings taken at different moments.
    select
        'w13'::text, 'check'::text,
        ('schema_migrations ~ 20260911140000 ~ present ~ '
         || (exists (
                select 1 from supabase_migrations.schema_migrations
                 where version = '20260911140000'
            ))::text),
        'a7'::text

    union all

    select
        'ledger_head'::text, 'max'::text,
        coalesce((select max(version)::text from supabase_migrations.schema_migrations), 'none'),
        'zzzz1'::text

    union all

    select
        'ledger_total'::text, 'count'::text,
        (select count(*)::text from supabase_migrations.schema_migrations),
        'zzzz2'::text
) rows
order by sort_key;
