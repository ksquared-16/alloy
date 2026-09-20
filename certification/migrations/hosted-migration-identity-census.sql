-- Read-only census: the hosted migration ledger's VERSION IDENTITIES.
-- RE-MEASURED 2026-09-20T12:5xZ AFTER the W3 merge (1e7c1745d). The previous reading was taken
-- while staging was still 7e87fd71e, so hosted parity reported PASS against a tree that did not yet
-- contain 20260922120000 — stale evidence refusing an apply, the mirror of stale evidence refusing
-- a merge.
--
--
--
-- A SECOND MEASUREMENT IN ONE RUN NEEDS A DIFFERENT QUESTION, AND THAT IS A
-- DEFECT IN THE READER, NOT IN THIS QUERY.
--
-- MEASURED on erun_4e91564845aedfb3. This census was filed at 22:18, migration
-- 20260915210000 was applied at 22:19:33, and the census was filed AGAIN at
-- 22:28 to re-measure the ledger the apply had just changed. The second filing
-- returned the FIRST measurement: a new governed request id, a new gar, its own
-- created_at -- and `census_run_at 22:18:15`, the reading from ten minutes and
-- one migration earlier. It reused trusted-host action tha_33b4c339c66fb0,
-- minted by the 22:18 filing.
--
-- `database.read_census` is classified CONTEXT_DEPENDENT precisely because "a
-- census is a measurement AT A TIME -- a before/after needs two". Its registry
-- definition then declares `reuseAuthorized: () => true`, which satisfies that
-- classification unconditionally, so every repeat within a run replays the
-- first answer. The two cases the classification distinguishes -- a retry of
-- one question, and the second half of a before/after -- are indistinguishable
-- to the dedupe, because the only thing it compares is the query hash.
--
-- The consequence is not merely inconvenience. The merge gate refuses stale
-- hosted evidence, and the only sanctioned way to refresh it is this census, so
-- a PR that applies a migration cannot clear its own parity gate in the run
-- that applied it. Worse, the replayed result is not marked as replayed in the
-- bounded summary a lane reads: it looks exactly like a fresh measurement, and
-- pre-mutation state is what gets reported as current.
--
-- The repair belongs in the reader: `completedReuseDecision` ALREADY reuses on
-- a matching governed request id ("a retry is the same request, and it always
-- reuses") before the classification is consulted, so `reuseAuthorized` adds
-- nothing a retry needs and costs the before/after the classification promises.
-- Until that lands, a genuine post-mutation reading requires this artifact's
-- bytes to differ, because the hash is sha256 over them.
-- WHY THIS EXISTS RATHER THAN REUSING THE COMMUNICATIONS CENSUS. That artifact
-- answers a different question and, for this one, answers it invisibly wrong.
-- `parseTrustedHostSqlOutput` reads each psql line as
--
--     question_id | kind | payload…
--
-- so a select of `kind, version, role_name, privilege, granted, note` renders
--
--     ledger|20260909210000||||applied
--
-- and the VERSION is consumed as `kind`, which the parser keeps out of the row
-- payload entirely. Every ledger row came back as `"|||applied"`: 55 rows whose
-- identities were structurally unreadable. That produced a count match — repo 55,
-- hosted 55 — which is exactly the kind of evidence that looks like proof and is
-- not. Counts cannot distinguish "hosted has the same 55" from "hosted has 55,
-- four of them different".
--
-- So the version is placed in the PAYLOAD position, third onward, where the
-- parser preserves it. Three columns, one statement, no DDL and no writes — the
-- trusted-host read action permits nothing else.
--
-- `kind` is deliberately not the literal `row_count`: the parser treats that kind
-- as a count assignment rather than a row, which would silently swallow the
-- total instead of returning it.
select question_id, kind, payload
from (
    -- Every hosted ledger identity in the governed window, so the caller can
    -- compare identities and not merely how many there are.
    select
        'ledger'::text          as question_id,
        'version'::text         as kind,
        m.version::text         as payload,
        m.version::text         as sort_key
    from supabase_migrations.schema_migrations m
    where m.version >= '20260817000000'

    union all

    -- The head, so "is hosted at least at the required head" is answerable
    -- without reassembling it from the rows.
    select
        'ledger_head'::text,
        'max'::text,
        coalesce(max(m.version)::text, 'none'),
        'zzzz1'::text
    from supabase_migrations.schema_migrations m

    union all

    -- The total across ALL of history, not just the window: a window count says
    -- nothing about whether the pre-baseline tail is what the repository thinks.
    select
        'ledger_total'::text,
        'count'::text,
        count(*)::text,
        'zzzz2'::text
    from supabase_migrations.schema_migrations m
) rows
order by sort_key;
