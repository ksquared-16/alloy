-- Read-only census: what does the deployed primary's migration ledger ACTUALLY
-- contain, column by column, for rows the migration system itself wrote?
--
-- WHY A SECOND CENSUS. The equivalence census proved the schema and revealed
-- something the local reference could not: the hosted ledger has SIX columns
-- (version, statements, name, created_by, idempotency_key, rollback) where the
-- local CLI writes three. Reconciliation must write the shape THIS database's
-- migration system writes, and the only way to know that is to read rows it
-- wrote. Copying the local three-column shape would be inventing a minimal
-- representation sufficient to fool parity, which is precisely what the
-- reconciliation must not do.
--
-- Nothing here returns SQL text. `statements` is summarised by count and length:
-- the question is the SHAPE of a canonical row, not its contents, and a census
-- that dumped every migration's body would be a large read for no added proof.
--
-- Also re-proves, at this instant, that the two Thread 5 identities are absent.
-- The reconciliation re-reads again immediately before writing; this is the
-- earlier of the two readings, not a substitute for it.
select question_id, kind, payload
from (
    -- ── How the last twenty rows are populated, in full column shape ────────
    select
        'LEDGER-ROW'::text as question_id,
        'row'::text        as kind,
        json_build_object(
            'version', tail.version,
            'name', tail.name,
            'statements_count', coalesce(array_length(tail.statements, 1), 0),
            'statements_chars', coalesce((select sum(length(s)) from unnest(tail.statements) s), 0),
            'created_by', tail.created_by,
            'created_by_is_null', (tail.created_by is null),
            'idempotency_key', tail.idempotency_key,
            'idempotency_key_is_null', (tail.idempotency_key is null),
            'rollback_is_null', (tail.rollback is null),
            'rollback_count', coalesce(array_length(tail.rollback, 1), 0)
        )::text            as payload,
        '1' || tail.version as sort_key
    from (
        select version, name, statements, created_by, idempotency_key, rollback
        from supabase_migrations.schema_migrations
        order by version desc
        limit 20
    ) tail

    union all

    -- ── How OFTEN each extra column is populated across ALL of history ──────
    -- Twenty rows could be unrepresentative. If a column is null in every one of
    -- 393 rows, null is not a gap in the sample — it is the convention.
    select
        'LEDGER-COLUMN-USE'::text,
        'usage'::text,
        json_build_object(
            'total_rows', count(*),
            'created_by_populated', count(created_by),
            'idempotency_key_populated', count(idempotency_key),
            'rollback_populated', count(rollback),
            'name_populated', count(name),
            'statements_populated', count(statements)
        )::text,
        '2'::text
    from supabase_migrations.schema_migrations

    union all

    -- ── The two identities under reconciliation: still absent? ──────────────
    select
        'LEDGER-TARGET-PRESENT'::text,
        'version'::text,
        json_build_object('version', m.version)::text,
        '3' || m.version
    from supabase_migrations.schema_migrations m
    where m.version in ('20260910120000', '20260910130000')

    union all

    -- ── Head and total, so the before-state is on the record ────────────────
    select
        'LEDGER-BEFORE'::text,
        'stats'::text,
        json_build_object(
            'total_rows', (select count(*) from supabase_migrations.schema_migrations),
            'head', (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations)
        )::text,
        '4'::text
) rows
order by sort_key;
