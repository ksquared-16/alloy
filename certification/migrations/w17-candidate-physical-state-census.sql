-- Read-only census: PHYSICAL state and LEDGER identity of the W-17 candidate migration
-- (20260912010000) on the deployed primary, in ONE reading.
--
-- WHY THIS EXISTS. D2 established that `post_apply_verification_failed` is only reachable AFTER the
-- migration runner reports success, so it never means "nothing happened" — it means the schema may
-- be there while the ledger row is not. Diagnosing that requires physical and ledger state read at
-- the SAME moment, in the shape `trusted-host-ledger-repair.mjs` consumes:
--
--     object ~ expected ~ observed ~ match
--
-- under question ids `m<last six of version>`, with the ledger head and total in the same result.
-- A version counts as present only when every one of its rows matched.
--
-- Output contract: question_id | kind | payload. The parser takes the first two columns as identity,
-- so the answer must be third. One statement, no DDL, no writes.
with fn as (
    select p.proname::text as name, count(*) over (partition by p.proname) as signatures
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
),
check_rows as (
    select 'm010000'::text as qid, 'assign_member_role_audited'::text as obj, 'present'::text as expected,
           (case when exists (select 1 from fn where name = 'assign_member_role_audited') then 'present' else 'absent' end)::text as observed,
           'a1'::text as sort_key
    union all
    select 'm010000', 'remove_member_role_audited', 'present',
           case when exists (select 1 from fn where name = 'remove_member_role_audited') then 'present' else 'absent' end, 'a2'
    union all
    -- One callable signature each: a second would be the PGRST203 hazard D2 closed for its own owners.
    select 'm010000', 'assign_member_role_audited:one signature', 'yes',
           case when (select coalesce(max(signatures), 0) from fn where name = 'assign_member_role_audited') = 1 then 'yes' else 'no' end, 'a3'
    union all
    select 'm010000', 'remove_member_role_audited:one signature', 'yes',
           case when (select coalesce(max(signatures), 0) from fn where name = 'remove_member_role_audited') = 1 then 'yes' else 'no' end, 'a4'
)
select question_id, kind, payload
from (
    select qid as question_id, 'physical'::text as kind,
           (obj || ' ~ ' || expected || ' ~ ' || observed || ' ~ ' ||
            (case when observed = expected then 'true' else 'false' end))::text as payload,
           sort_key
    from check_rows

    union all
    select 'ledger_version'::text, 'identity'::text,
           (v.version || ' ~ ledgered ~ ' ||
            (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                  then 'present' else 'absent' end) || ' ~ ' ||
            (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                  then 'true' else 'false' end))::text,
           'b' || v.version
    from (values ('20260912010000')) as v(version)

    union all
    select 'ledger_head'::text, 'max'::text, coalesce(max(m.version)::text, 'none'), 'zz1'::text
    from supabase_migrations.schema_migrations m

    union all
    select 'ledger_total'::text, 'count'::text, count(*)::text, 'zz2'::text
    from supabase_migrations.schema_migrations m
) rows
order by sort_key;
