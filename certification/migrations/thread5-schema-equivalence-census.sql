-- Read-only census: does the deployed primary's PHYSICAL SCHEMA match what the
-- two Thread 5 migrations at 63b139d23 define?
--
-- WHY THIS EXISTS. During production-executor certification the exact certified
-- Thread 5 DDL was unintentionally executed against the deployed primary four
-- times, and the migration ledger was never written. Before any ledger row is
-- reconciled, the schema those rows would CLAIM has to be proven present — a
-- ledger entry for a schema that does not match is a lie that every later gate
-- would believe.
--
-- psql stdout is not evidence for this. It records that statements returned
-- CREATE TABLE; it cannot say whether the resulting columns, constraints,
-- indexes, policies, grants and comments are the ones the migration defines. So
-- this reads the CATALOG, object by object, and returns the facts for comparison
-- rather than a verdict — the comparison belongs to the caller, and a census
-- that judged would be a census whose judgement nobody could re-check.
--
-- OUTPUT SHAPE. `question_id | kind | payload`, payload a JSON object, exactly
-- the contract parseTrustedHostSqlOutput reads. `kind` is never the literal
-- `row_count`, which that parser treats as a count assignment rather than a row.
--
-- One statement. No DDL, no writes; the trusted-host read action permits nothing
-- else and the transaction is READ ONLY regardless.
select question_id, kind, payload
from (
    -- ── 1. The three tables: existence, RLS, FORCE RLS ──────────────────────
    -- FORCE matters on its own: ENABLE alone leaves the owner exempt, and these
    -- tables are written by a service role that would then bypass every policy.
    select
        'T5-TABLE'::text as question_id,
        'table'::text    as kind,
        json_build_object(
            'table', c.relname,
            'kind', c.relkind,
            'rls_enabled', c.relrowsecurity,
            'rls_forced', c.relforcerowsecurity,
            'owner', pg_get_userbyid(c.relowner)
        )::text          as payload,
        '1' || c.relname as sort_key
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')

    union all

    -- ── 2. Columns: name, type, nullability, default ────────────────────────
    select
        'T5-COLUMN'::text,
        'column'::text,
        json_build_object(
            'table', c.relname,
            'column', a.attname,
            'ordinal', a.attnum,
            'type', format_type(a.atttypid, a.atttypmod),
            'not_null', a.attnotnull,
            'default', pg_get_expr(ad.adbin, ad.adrelid)
        )::text,
        '2' || c.relname || lpad(a.attnum::text, 3, '0')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
    where n.nspname = 'public'
      and c.relname in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')

    union all

    -- ── 3. Constraints: primary keys, foreign keys (with delete action), checks
    select
        'T5-CONSTRAINT'::text,
        'constraint'::text,
        json_build_object(
            'table', c.relname,
            'name', con.conname,
            'type', con.contype,
            'definition', pg_get_constraintdef(con.oid)
        )::text,
        '3' || c.relname || con.conname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')

    union all

    -- ── 4. Indexes, by full definition ──────────────────────────────────────
    -- The definition carries UNIQUE and the partial WHERE clause, both of which
    -- are the point: uq_person_kiosk_code_active_person is only correct as a
    -- partial unique index.
    select
        'T5-INDEX'::text,
        'index'::text,
        json_build_object(
            'table', i.tablename,
            'name', i.indexname,
            'definition', i.indexdef
        )::text,
        '4' || i.tablename || i.indexname
    from pg_indexes i
    where i.schemaname = 'public'
      and i.tablename in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')

    union all

    -- ── 5. Policies: command, roles, USING and WITH CHECK expressions ───────
    select
        'T5-POLICY'::text,
        'policy'::text,
        json_build_object(
            'table', p.tablename,
            'name', p.policyname,
            'permissive', p.permissive,
            'roles', p.roles::text,
            'command', p.cmd,
            'using', p.qual,
            'with_check', p.with_check
        )::text,
        '5' || p.tablename || p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')

    union all

    -- ── 6. Table-level privileges ───────────────────────────────────────────
    -- A REVOKE leaves no row, so ABSENCE here is the evidence that the migration's
    -- REVOKE ALL took effect. Reported per grantee so an unexpected grantee is
    -- visible rather than inferred.
    select
        'T5-TABLE-GRANT'::text,
        'grant'::text,
        json_build_object(
            'table', g.table_name,
            'grantee', g.grantee,
            'privilege', g.privilege_type
        )::text,
        '6' || g.table_name || g.grantee || g.privilege_type
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.table_name in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')

    union all

    -- ── 7. Column-level privileges ──────────────────────────────────────────
    -- Both kiosk tables grant SELECT on a COLUMN LIST that deliberately omits the
    -- digest column. Proving the list is proving credential_hash and code_hash are
    -- unreadable through an ordinary select.
    select
        'T5-COLUMN-GRANT'::text,
        'grant'::text,
        json_build_object(
            'table', g.table_name,
            'column', g.column_name,
            'grantee', g.grantee,
            'privilege', g.privilege_type
        )::text,
        '7' || g.table_name || g.grantee || g.column_name
    from information_schema.column_privileges g
    where g.table_schema = 'public'
      and g.table_name in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')

    union all

    -- ── 8a. Table comments ─────────────────────────────────────────────────
    select
        'T5-COMMENT'::text,
        'table_comment'::text,
        json_build_object(
            'table', c.relname,
            'comment_chars', length(obj_description(c.oid, 'pg_class')),
            'comment_head', left(obj_description(c.oid, 'pg_class'), 80)
        )::text,
        '8a' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')
      and obj_description(c.oid, 'pg_class') is not null

    union all

    -- ── 8b. Column comments ────────────────────────────────────────────────
    select
        'T5-COMMENT'::text,
        'column_comment'::text,
        json_build_object(
            'table', c.relname,
            'column', a.attname,
            'comment_chars', length(col_description(c.oid, a.attnum)),
            'comment_head', left(col_description(c.oid, a.attnum), 80)
        )::text,
        '8b' || c.relname || a.attname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public'
      and c.relname in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')
      and col_description(c.oid, a.attnum) is not null

    union all

    -- ── 9. Anything Thread-5-shaped that the migrations do NOT define ───────
    -- The instruction requires proving no unexpected Thread 5 objects were
    -- created. A name-pattern sweep is the only way to find an object nobody
    -- thought to look for; the three known tables are excluded so a hit here is
    -- always something to explain.
    select
        'T5-UNEXPECTED'::text,
        'object'::text,
        json_build_object(
            'name', c.relname,
            'kind', c.relkind,
            'schema', n.nspname
        )::text,
        '9' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'auth')
      and c.relkind in ('r', 'v', 'm', 'f', 'p')
      and (c.relname like '%kiosk%' or c.relname like '%safeguarding_screening%')
      and c.relname not in ('attendance_kiosk_devices', 'child_safeguarding_screenings', 'person_kiosk_codes')

    union all

    -- ── 10. The ledger: are the two identities still absent? ────────────────
    select
        'LEDGER-TARGET'::text,
        'version'::text,
        json_build_object('version', m.version, 'present', true)::text,
        'A' || m.version
    from supabase_migrations.schema_migrations m
    where m.version in ('20260910120000', '20260910130000')

    union all

    -- ── 11. Ledger statistics: total and head ───────────────────────────────
    select
        'LEDGER-STATS'::text,
        'stats'::text,
        json_build_object(
            'total_rows', (select count(*) from supabase_migrations.schema_migrations),
            'head', (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations)
        )::text,
        'B0'::text

    union all

    -- ── 12. The ledger's own column shape ───────────────────────────────────
    -- The reconciliation must write the SAME shape the migration system writes.
    -- Reading the table's real columns is how that stops being an assumption.
    select
        'LEDGER-SHAPE'::text,
        'column'::text,
        json_build_object(
            'column', a.attname,
            'ordinal', a.attnum,
            'type', format_type(a.atttypid, a.atttypmod),
            'not_null', a.attnotnull,
            'default', pg_get_expr(ad.adbin, ad.adrelid)
        )::text,
        'C' || lpad(a.attnum::text, 3, '0')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
    where n.nspname = 'supabase_migrations' and c.relname = 'schema_migrations'

    union all

    -- ── 13. Adjacent ledger rows, so the written shape is copied not guessed ─
    -- Whether `statements` is populated, whether `name` carries the timestamp,
    -- what an untouched row actually looks like. Content is summarised rather
    -- than dumped: the shape is the question, not the SQL text.
    --
    -- Wrapped in its own subquery because ORDER BY / LIMIT inside a UNION arm
    -- binds to the whole union, which would silently truncate the census to five
    -- rows and look like a schema with almost nothing in it.
    select
        'LEDGER-ADJACENT'::text,
        'row'::text,
        json_build_object(
            'version', tail.version,
            'name', tail.name,
            'statements_is_null', (tail.statements is null),
            'statements_count', coalesce(array_length(tail.statements, 1), 0),
            'statements_total_chars', coalesce((select sum(length(s)) from unnest(tail.statements) s), 0)
        )::text,
        'D' || tail.version
    from (
        select m.version, m.name, m.statements
        from supabase_migrations.schema_migrations m
        order by m.version desc
        limit 5
    ) tail
) rows
order by sort_key;
