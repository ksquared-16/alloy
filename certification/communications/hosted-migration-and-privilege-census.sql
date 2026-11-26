-- Read-only census: hosted migration ledger + the physical privilege state of the two
-- Communications tables the privilege repair governs.
--
-- One statement, no DDL, no writes -- the trusted-host read action permits nothing else.
-- That constraint is why the positive control here is not a scratch table: it is a cell
-- whose answer must come back TRUE. If every cell were false, the probe would be broken and
-- an all-false result would look exactly like a clean revoke. Two independent controls:
--   * service_role on the target tables, which the repair must PRESERVE, and
--   * authenticated on public.persons, a table nobody has ever revoked.
--
-- `communication_provider_bindings` is the real table name. There is no
-- `communication_bindings`; a census naming that returns zero rows and reads like success.
select
    kind,
    subject,
    role_name,
    privilege,
    granted,
    note
from (
    -- Every hosted ledger row at or after the Communications window, so the caller can see
    -- exactly which versions are recorded and which are absent.
    select
        'ledger'::text      as kind,
        m.version::text     as subject,
        null::text          as role_name,
        null::text          as privilege,
        null::boolean       as granted,
        'applied'::text     as note
    from supabase_migrations.schema_migrations m
    where m.version >= '20260817000000'

    union all

    -- The ceiling, so the caller can tell whether a renumbered migration would sort above it
    -- without assuming anything about include-all behaviour.
    select
        'ledger_max'::text,
        max(m.version)::text,
        null::text,
        null::text,
        null::boolean,
        'highest version recorded on hosted'::text
    from supabase_migrations.schema_migrations m

    union all

    -- The physical privilege matrix, asked of the live catalog rather than inferred from the
    -- migration having run.
    select
        'privilege'::text,
        t.tbl,
        r.rolname,
        p.priv,
        has_table_privilege(r.rolname, t.tbl, p.priv),
        t.role_of_row
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
order by kind, subject, role_name, privilege
