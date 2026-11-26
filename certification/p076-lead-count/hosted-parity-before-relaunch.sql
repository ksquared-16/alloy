-- P0-7.6 — DEPLOYED-PRIMARY MIGRATION PARITY, READ BEFORE THE CANDIDATE IS REBUILT.
--
-- WHY THIS FILE EXISTS
-- Two merge attempts were refused by `hosted_migration_behind`, naming 20260919160000 first and
-- then 20260921120000 + 20260921130000. Since then origin/staging advanced to 63d9a50fdb4c and the
-- deployed application now reports that same SHA. That proves the APPLICATION moved; it says
-- nothing about whether those migrations were APPLIED to the primary. The renumber target for the
-- lead-count migration has to be chosen against the hosted ceiling, not against the repository's,
-- and the earlier out-of-order hazard came from assuming the two agree.
--
-- OUTPUT CONTRACT (learned the hard way, see hosted-ledger-census-v2.sql): the trusted-host reader
-- takes column 1 as question_id, DISCARDS column 2 unless it is literally 'row_count', and treats
-- column 3+ as payload. So column 2 is a fixed literal and every identifying value travels inside
-- the JSON payload where nothing can be positionally swallowed.
--
-- Read-only: one statement, no DDL, no writes.
select
    question_id,
    'data' as row_kind,
    payload
from (
    -- The tail, from well before the contested window, so "missing" and "never recorded"
    -- cannot be confused.
    select
        'ledger_tail'::text as question_id,
        json_build_object('version', m.version)::text as payload
    from supabase_migrations.schema_migrations m
    where m.version >= '20260915000000'

    union all

    -- The hosted ceiling. The renumber must sort strictly after BOTH this and the repository tail.
    select
        'ledger_max'::text,
        json_build_object('max_version', max(m.version))::text
    from supabase_migrations.schema_migrations m

    union all

    select
        'ledger_count'::text,
        json_build_object('total', count(*))::text
    from supabase_migrations.schema_migrations m

    union all

    -- The exact versions in question, asked individually so an absent one answers FALSE rather
    -- than simply not appearing in a list — absence of a row is not evidence of absence.
    select
        'target_version'::text,
        json_build_object(
            'version', v.version,
            'present', exists (
                select 1 from supabase_migrations.schema_migrations m where m.version = v.version
            ),
            'role', v.role_of_row
        )::text
    from (
        values
            ('20260919160000', 'earlier_blocker_should_now_be_present'),
            ('20260920120000', 'promoted_between_attempts'),
            ('20260921120000', 'named_blocker'),
            ('20260921130000', 'named_blocker'),
            ('20260920140000', 'lead_count_candidate_old_number_must_be_absent')
    ) as v(version, role_of_row)

    union all

    -- The candidate function must NOT exist yet. A positive here would mean the additive
    -- migration already landed by some path, which changes the whole plan.
    select
        'lead_function'::text,
        json_build_object(
            'exists', exists (
                select 1
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and p.proname = 'count_active_lead_participations'
            )
        )::text

    union all

    -- Positive control: this census can say TRUE. Without it a wall of FALSE readings is
    -- indistinguishable from a probe that cannot answer.
    select
        'positive_control'::text,
        json_build_object(
            'public_persons_exists', exists (
                select 1 from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = 'persons'
            )
        )::text
) census
order by question_id, payload
