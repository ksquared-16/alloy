-- Read-only census: IS "OPPORTUNITY" A CURRENT PRODUCT, OR LIVE RUNTIME UNDER RETIRED LANGUAGE?
--
-- The Departments and Document Field Definitions retirements both turned on the same distinction:
-- data being RECENT is not the same as a product being CURRENT. What settles it is WHO writes the
-- rows and through WHAT surface.
--
-- THIS FILE ASKS FOR THE COLUMN LIST FIRST, AND THAT IS NOT DECORATION. The first attempt guessed
-- `stage` and the whole census died on `column "stage" does not exist` — one wrong identifier costs
-- the entire measurement, and inside a single Execution Run the query hash is the dedupe key, so
-- re-asking needs different bytes (DATABASE_READ_CENSUS_CONTEXT_REUSE_DEFECT). Every later question
-- here uses only columns verified against source (`status_key`, `stage_key`, `location_id`,
-- `customer_id`, `work_unit_id`), and the inventory means the next run never has to guess.
--
-- Output contract: question_id | kind | payload — the value must sit third or later, or
-- `parseTrustedHostSqlOutput` consumes it as `kind`.
select question_id, kind, payload
from (
    -- 0. THE COLUMN INVENTORY. Definitive, and cheap.
    select 'columns'::text as question_id, 'name'::text as kind,
           c.column_name::text as payload, ('0' || c.ordinal_position::text)::text as sort_key
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'opportunities'

    union all

    -- 1. VOLUME. A dead abstraction and a load-bearing runtime table look different here.
    select 'volume', 'total', count(*)::text, '1a' from public.opportunities
    union all
    select 'volume', 'orgs', count(distinct org_id)::text, '1b' from public.opportunities

    union all

    -- 2. RECENCY. Departments looked alive by this measure alone, which is exactly why it is not the
    -- answer by itself — it is reported so the shape questions can be read against it.
    select 'recency', 'created_last_30d',
           count(*) filter (where created_at > now() - interval '30 days')::text, '2a'
    from public.opportunities
    union all
    select 'recency', 'updated_last_30d',
           count(*) filter (where updated_at > now() - interval '30 days')::text, '2b'
    from public.opportunities
    union all
    select 'recency', 'newest_created', coalesce(max(created_at)::text,'none'), '2c'
    from public.opportunities

    union all

    -- 3. POPULATION SHAPE. If these rows are the runtime identity behind Leads and Enrollment, they
    -- should be attached to the live product's structures rather than standing alone as records an
    -- operator curates for their own sake.
    select 'shape', 'with_status_key', count(*) filter (where status_key is not null)::text, '3a'
    from public.opportunities
    union all
    select 'shape', 'with_customer', count(*) filter (where customer_id is not null)::text, '3b'
    from public.opportunities
    union all
    select 'shape', 'with_work_unit', count(*) filter (where work_unit_id is not null)::text, '3c'
    from public.opportunities
    union all
    select 'shape', 'with_location', count(*) filter (where location_id is not null)::text, '3d'
    from public.opportunities

    union all

    -- 4. STATUS VOCABULARY. Status names are operator language leaking into the table, and they say
    -- which product this record belongs to.
    select 'status_vocab', 'value',
           (coalesce(status_key,'(null)') || ' ~ rows=' || count(*)::text), '4' || coalesce(status_key,'zzz')
    from public.opportunities
    group by status_key

    union all

    -- 5. PER-CHILD ROWS. entity-model.md calls these "per-child inquiry/enrollment rows" and makes
    -- `opportunity_customer_members.outcome_status_key` the child-enrollment source of truth. If
    -- that is where the live product actually works, it should show here.
    select 'members', 'total', count(*)::text, '5a' from public.opportunity_customer_members
    union all
    select 'members', 'updated_last_30d',
           count(*) filter (where updated_at > now() - interval '30 days')::text, '5b'
    from public.opportunity_customer_members

    union all

    -- 6. THE CAPABILITY ITSELF. A key nobody holds and nothing enforces is not a control, whatever
    -- the role editor renders.
    select 'capability', 'definition', (pd.key || ' ~ active=' || pd.is_active::text), '6a' || pd.key
    from public.permission_definitions pd
    where pd.key like 'crm.opportunities%'
    union all
    select 'capability', 'grant',
           (g.permission_key || ' ~ role=' || g.role_key || ' ~ allowed=' || g.allowed::text
            || ' ~ orgs=' || count(distinct g.org_id)::text), '6b' || g.permission_key || g.role_key
    from public.role_permission_grants g
    where g.permission_key like 'crm.opportunities%'
    group by g.permission_key, g.role_key, g.allowed

    union all

    select 'scale', 'orgs_with_roles', count(distinct rd.org_id)::text, '7a'
    from public.role_definitions rd
) rows
order by sort_key;
