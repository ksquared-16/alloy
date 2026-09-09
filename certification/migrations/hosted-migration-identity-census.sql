-- Read-only census: the hosted migration ledger's VERSION IDENTITIES.
--
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
