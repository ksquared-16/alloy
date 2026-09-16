-- Read-only census: WHAT PACKAGE SHOULD TOURS AUTHORITY JOIN, AND DOES OPS BELONG IN IT?
--
-- The approved baseline gives admin and ops both keys, and asks that ops be RE-PROVEN rather than
-- seeded from the prompt. Current reach cannot answer that: all nine Tour mutations are reachable
-- through portal admission today, so every principal already reaches them and the measurement would
-- only restate the defect.
--
-- What can answer it is DOCTRINE — the shape of the package ops already holds. This programme has
-- gone both ways deliberately: ops holds `fin.write` and `fields.manage`, and `reports.write` was
-- WITHHELD from ops on purpose. So the question is asked as a comparison: for the operator-facing
-- keys ops holds today, and the configuration keys it does not, where would each Tours family sit?
--
-- ONE ARTIFACT, EVERY QUESTION (DATABASE_READ_CENSUS_CONTEXT_REUSE_DEFECT). The column inventory
-- comes first, because one guessed identifier fails the whole statement.
--
-- Output contract: question_id | kind | payload — the value must sit third or later.
select question_id, kind, payload
from (
    select 'columns'::text as question_id, 'tour_availability_rules'::text as kind,
           c.column_name::text as payload, ('0a' || c.ordinal_position::text)::text as sort_key
    from information_schema.columns c
    where c.table_schema='public' and c.table_name='tour_availability_rules'

    union all

    select 'columns', 'tour_bookings', c.column_name::text, '0b' || c.ordinal_position::text
    from information_schema.columns c
    where c.table_schema='public' and c.table_name='tour_bookings'

    union all

    -- 1. CONFIRM ABSENCE. If either key already exists the migration must not create it.
    select 'catalog', 'existing_tours_key', (pd.key || ' ~ active=' || pd.is_active::text), '1' || pd.key
    from public.permission_definitions pd
    where pd.key like 'tours.%'

    union all

    -- 2. WHAT OPS ACTUALLY HOLDS. The doctrine comparison: ops is not uniformly an operator-only
    -- role, and it is not uniformly a configuration role either. This is the evidence for Phase 13.
    select 'ops_package', 'key', (g.permission_key || ' ~ orgs=' || count(distinct g.org_id)::text),
           '2' || g.permission_key
    from public.role_permission_grants g
    where g.allowed and g.role_key = 'ops'
    group by g.permission_key

    union all

    -- 3. THE SAME FOR ADMIN, as the denominator for "which keys are admin-only".
    select 'admin_only', 'key', (g.permission_key || ' ~ orgs=' || count(distinct g.org_id)::text),
           '3' || g.permission_key
    from public.role_permission_grants g
    where g.allowed and g.role_key = 'admin'
      and not exists (
        select 1 from public.role_permission_grants o
        where o.allowed and o.role_key='ops' and o.permission_key = g.permission_key
      )
    group by g.permission_key

    union all

    -- 4. DO THE OTHER SEEDED ROLES HOLD ANYTHING OPERATIONAL? Directors must stay unchanged unless
    -- doctrine says otherwise, so their current breadth is worth seeing before deciding.
    select 'other_roles', 'role_breadth',
           (g.role_key || ' ~ keys=' || count(distinct g.permission_key)::text), '4' || g.role_key
    from public.role_permission_grants g
    where g.allowed and g.role_key not in ('admin','ops')
    group by g.role_key

    union all

    -- 5. FIXTURE SIZING for certification, and a sanity check that Tours is live product.
    select 'volume', 'availability_rules', count(*)::text, '5a' from public.tour_availability_rules
    union all
    select 'volume', 'bookings', count(*)::text, '5b' from public.tour_bookings
    union all
    select 'scale', 'orgs_with_roles', count(distinct rd.org_id)::text, '5c' from public.role_definitions rd
) rows
order by sort_key;
