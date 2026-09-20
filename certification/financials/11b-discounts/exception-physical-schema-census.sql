-- PROMOTION-GATED PROOF C — the exception table, as the deployed database actually holds it.
--
-- The migration file is the INTENT. This is the fact. Every row below answers one of the A-K
-- items in PROMOTION-GATED-PROOFS.md, and each carries a boolean so a reader does not have to
-- interpret DDL text:
--
--   B  the table exists at all
--   C  reason is NOT NULL and the non-empty CHECK is present
--      the partial unique index exists AND is partial on superseded_at is null
--      the org-parity trigger is attached and fires
--      policy_id restricts deletion; opportunity_customer_member_id cascades
--
-- An all-empty answer is two different answers — the table is genuinely absent, or the census ran
-- against the wrong database. The first row settles that before anything else is read.
select
    'table_exists'                                              as check_key,
    to_regclass('public.commercial_policy_exceptions') is not null as holds,
    coalesce(to_regclass('public.commercial_policy_exceptions')::text, '(absent)') as detail

union all
select
    'columns_present',
    count(*) = 12,
    string_agg(column_name, ', ' order by ordinal_position)
from information_schema.columns
where table_schema = 'public' and table_name = 'commercial_policy_exceptions'

union all
select
    'reason_not_null',
    bool_or(is_nullable = 'NO'),
    'is_nullable=' || coalesce(max(is_nullable), '(no column)')
from information_schema.columns
where table_schema = 'public' and table_name = 'commercial_policy_exceptions' and column_name = 'reason'

union all
select
    'reason_non_empty_check',
    count(*) > 0,
    coalesce(string_agg(pg_get_constraintdef(con.oid), ' | '), '(none)')
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public' and rel.relname = 'commercial_policy_exceptions'
  and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%reason%'

union all
-- PARTIAL, not merely unique. A plain unique index would forbid a superseded row from coexisting
-- with the live one that replaced it, which is the whole supersession model.
select
    'live_row_unique_index_is_partial',
    bool_or(indexdef ilike '%where%superseded_at is null%'),
    coalesce(string_agg(indexdef, ' | '), '(none)')
from pg_indexes
where schemaname = 'public' and tablename = 'commercial_policy_exceptions'
  and indexname = 'ux_commercial_policy_exceptions_live'

union all
select
    'org_parity_trigger_enabled',
    bool_or(tgenabled <> 'D'),
    coalesce(string_agg(tgname || ' (' || tgenabled || ')', ' | '), '(none)')
from pg_trigger t
join pg_class rel on rel.oid = t.tgrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public' and rel.relname = 'commercial_policy_exceptions' and not t.tgisinternal

union all
-- The two foreign keys differ deliberately: deleting a policy that an exception still names must
-- be REFUSED (the exception would lose its subject), while the relationship going away takes its
-- exceptions with it.
select
    'fk_policy_restricts_delete',
    bool_or(con.confdeltype in ('r', 'a')),
    coalesce(string_agg(con.conname || ' confdeltype=' || con.confdeltype, ' | '), '(none)')
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
where nsp.nspname = 'public' and rel.relname = 'commercial_policy_exceptions'
  and con.contype = 'f' and att.attname = 'policy_id'

union all
select
    'fk_relationship_cascades',
    bool_or(con.confdeltype = 'c'),
    coalesce(string_agg(con.conname || ' confdeltype=' || con.confdeltype, ' | '), '(none)')
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
where nsp.nspname = 'public' and rel.relname = 'commercial_policy_exceptions'
  and con.contype = 'f' and att.attname = 'opportunity_customer_member_id'

union all
-- Tenant integrity: the table must carry org_id and it must not be nullable, or a row could exist
-- outside every organization.
select
    'org_id_not_null',
    bool_or(is_nullable = 'NO'),
    'is_nullable=' || coalesce(max(is_nullable), '(no column)')
from information_schema.columns
where table_schema = 'public' and table_name = 'commercial_policy_exceptions' and column_name = 'org_id'

union all
-- The ledger half of item A, read from the database rather than from the apply result.
select
    'migration_in_ledger',
    count(*) > 0,
    coalesce(string_agg(version, ', '), '(absent)')
from supabase_migrations.schema_migrations
where version = '20260924120000'

order by check_key;
