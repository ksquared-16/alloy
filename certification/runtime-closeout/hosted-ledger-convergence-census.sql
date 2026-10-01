-- Read-only census: hosted migration ledger identities, for the shared-runtime closeout.
--
-- A FRESH QUESTION, DELIBERATELY. `database.read_census` dedupes on the query hash within a run and
-- replays the first answer without marking it replayed, so a census reused verbatim from an earlier
-- closeout can return a reading taken before the migrations it is meant to verify. This one asks
-- its own question, in its own run, so what comes back is a measurement and not an echo.
--
-- Catalog-only: it reads `supabase_migrations.schema_migrations` and nothing else. No application
-- table is touched, so it cannot be affected by, or affect, any row the product owns, and it
-- carries no PII by construction.
select question_id, kind, payload
from (
    -- Every hosted ledger identity in the governed window, so identities can be compared against
    -- the repository set rather than only counted.
    select
        'ledger'::text          as question_id,
        'version'::text         as kind,
        m.version::text         as payload,
        m.version::text         as sort_key
    from supabase_migrations.schema_migrations m
    where m.version >= '20260817000000'
    union all
    -- The head, so "is hosted at least at the repository head" is answerable directly.
    select
        'ledger_head'::text,
        'max'::text,
        coalesce(max(m.version)::text, 'none'),
        'zzzz1'::text
    from supabase_migrations.schema_migrations m
    union all
    -- The total across ALL history: a windowed count says nothing about the pre-baseline tail.
    select
        'ledger_total'::text,
        'count'::text,
        count(*)::text,
        'zzzz2'::text
    from supabase_migrations.schema_migrations m
) rows
order by sort_key;
