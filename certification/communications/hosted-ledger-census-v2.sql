-- Read-only census, second attempt -- the first one answered and told us almost nothing.
--
-- WHY THIS FILE EXISTS
-- The trusted-host reader parses each output line as
--     column 1 -> question_id
--     column 2 -> a row-kind marker, DISCARDED unless it is literally 'row_count'
--     column 3+ -> payload
-- The first artifact put the migration version and the table name in column 2, so every
-- identifying value was swallowed: the ledger came back as eleven rows of "|||applied".
-- The privilege matrix survived only because its identity happened to sit further right.
--
-- So column 2 is now a fixed literal and every fact travels inside a JSON payload, where
-- nothing can be positionally consumed.
--
-- Same read-only shape as before: one statement, no DDL, no writes.
--
-- The positive controls are unchanged and they earned their place last time: `authenticated`
-- came back TRUE on public.persons, which is what proves the FALSE readings on the two
-- Communications tables are a real revoke and not a probe that cannot say yes.
select
    question_id,
    'data' as row_kind,
    payload
from (
    -- Every recorded version in the Communications window, now legible.
    select
        'ledger'::text as question_id,
        json_build_object('version', m.version)::text as payload
    from supabase_migrations.schema_migrations m
    where m.version >= '20260817000000'

    union all

    -- The ceiling, so the renumber target can be chosen against hosted rather than assumed.
    select
        'ledger_max'::text,
        json_build_object('max_version', max(m.version))::text
    from supabase_migrations.schema_migrations m

    union all

    -- Total recorded versions, so a truncated ledger cannot look like a short one.
    select
        'ledger_count'::text,
        json_build_object('total', count(*))::text
    from supabase_migrations.schema_migrations m

    union all

    -- The physical privilege matrix, asked of the live catalog, with the table named
    -- inside the payload this time.
    select
        'privilege'::text,
        json_build_object(
            'table',   t.tbl,
            'role',    r.rolname,
            'priv',    p.priv,
            'granted', has_table_privilege(r.rolname, t.tbl, p.priv),
            'control', t.role_of_row
        )::text
    from (
        values
            ('public.communication_provider_bindings', 'target'),
            ('public.communication_ingress_routes',    'target'),
            ('public.persons',                         'positive_control')
    ) as t(tbl, role_of_row)
    cross join (
        values ('anon'), ('authenticated'), ('service_role')
    ) as r(rolname)
    cross join (
        values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
    ) as p(priv)
) census
order by question_id, payload
