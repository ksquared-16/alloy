-- Read-only census: does `commercial_policy_exceptions` physically exist on the
-- hosted database, with the constraints the migration claims?
--
-- §4 of the slice: "Do not trust migration success alone." A governed apply
-- reporting complete says the statement ran; it does not say the table carries
-- the NOT NULL, the partial unique index, the foreign keys or the parity
-- trigger that make the model mean what it says. Those are separate facts and
-- each is asked for separately here.
--
-- OUTPUT CONTRACT: `question_id | kind | payload`, one row per fact, ordered so
-- a reader compares identities rather than counting them. `kind` is never the
-- literal `row_count` — the parser treats that kind as a count assignment and
-- would swallow the value.
--
-- READ ONLY. Catalog reads only; no table in the application schema is touched.
select question_id, kind, payload
from (
    -- 1 · Does the table exist at all?
    select
        'table'::text                                        as question_id,
        'present'::text                                      as kind,
        (count(*) > 0)::text                                 as payload,
        '1'::text                                            as sort_key
    from information_schema.tables
    where table_schema = 'public' and table_name = 'commercial_policy_exceptions'

    union all

    -- 2 · Every column and its nullability, so `reason NOT NULL` is a fact and
    --     not a claim, and the effective/supersession fields are all present.
    select
        'column'::text,
        c.column_name::text,
        (c.data_type || ' · ' || case when c.is_nullable = 'NO' then 'NOT NULL' else 'nullable' end)::text,
        '2' || c.ordinal_position::text
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'commercial_policy_exceptions'

    union all

    -- 3 · The foreign keys: the policy relationship and the commercial
    --     relationship this exception is scoped by.
    select
        'foreign_key'::text,
        tc.constraint_name::text,
        (kcu.column_name || ' -> ' || ccu.table_name || '.' || ccu.column_name)::text,
        '3' || tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'commercial_policy_exceptions'
      and tc.constraint_type = 'FOREIGN KEY'

    union all

    -- 4 · The CHECK constraints: dates ordered, and a reason actually stated.
    select
        'check'::text,
        con.conname::text,
        pg_get_constraintdef(con.oid)::text,
        '4' || con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'commercial_policy_exceptions'
      and con.contype = 'c'

    union all

    -- 5 · The indexes, including the PARTIAL unique one that makes a retry
    --     harmless: one live exception per policy, relationship and date.
    select
        'index'::text,
        i.indexname::text,
        i.indexdef::text,
        '5' || i.indexname
    from pg_indexes i
    where i.schemaname = 'public' and i.tablename = 'commercial_policy_exceptions'

    union all

    -- 6 · The parity trigger: tenant and subject coherence enforced where a
    --     second writer cannot skip it.
    select
        'trigger'::text,
        t.tgname::text,
        pg_get_triggerdef(t.oid)::text,
        '6' || t.tgname
    from pg_trigger t
    join pg_class rel on rel.oid = t.tgrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'commercial_policy_exceptions'
      and not t.tgisinternal

    union all

    -- 7 · The ledger, so the applied version is named rather than inferred.
    select
        'ledger'::text,
        'version'::text,
        m.version::text,
        '7' || m.version::text
    from supabase_migrations.schema_migrations m
    where m.version = '20260924120000'
) facts
order by sort_key;
