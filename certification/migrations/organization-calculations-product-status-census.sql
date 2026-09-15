-- Read-only census: is Organization Calculations a live product concept, and WHO writes it?
--
-- The Access & Identity program reached six role-title gates under /api/admin/organization-calculations
-- and paused before designing capabilities, because the Department slice established that a live
-- table is not proof of a live operator-facing concept.
--
-- Source evidence says the concept is mounted but NOT standalone: the workspace renders only as
-- `<OrganizationCalculationsWorkspace embedded />` inside OperationalIntelligenceWorkspace, reached
-- as an OI tab labelled "Calculation Library"; `/settings/calculations` redirects to Operational
-- Intelligence; and `organizationRuntime.ts` states "Not an Organization landing peer". The table's
-- own migration calls itself a "Path B proving slice" and constrains subject_grain to 'room' alone.
--
-- Code liveness is not adoption. This asks the database the question code cannot answer: do real
-- tenants have calculations, are they published and bound to runtime, and — the question the
-- Department census taught us to ask FIRST — who made the most recent write.
--
-- created_by / updated_by are FKs to auth.users, so their PRESENCE distinguishes a human-authored
-- row from one a migration or seed inserted. No user identity is read, only whether an author exists.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
select question_id, kind, payload
from (
    select 'calculations'::text, 'summary'::text,
           ('rows=' || count(*)::text
            || ' orgs=' || count(distinct org_id)::text
            || ' draft=' || count(*) filter (where lifecycle = 'draft')::text
            || ' published=' || count(*) filter (where lifecycle = 'published')::text
            || ' archived=' || count(*) filter (where lifecycle = 'archived')::text
            || ' first=' || coalesce(min(created_at)::date::text,'none')
            || ' last_created=' || coalesce(max(created_at)::date::text,'none')
            || ' last_updated=' || coalesce(max(updated_at)::date::text,'never'))::text,
           'a1'::text
    from public.organization_calculations

    union all
    -- PROVENANCE. An author present means a signed-in principal created it through the product; an
    -- absent author means a migration, seed or service-role path did.
    select 'authorship'::text, 'provenance'::text,
           ('with_created_by=' || count(*) filter (where created_by is not null)::text
            || ' without_created_by=' || count(*) filter (where created_by is null)::text
            || ' with_updated_by=' || count(*) filter (where updated_by is not null)::text
            || ' distinct_authors=' || count(distinct created_by)::text)::text,
           'a2'::text
    from public.organization_calculations

    union all
    -- Per row: key, lifecycle, whether a human authored it, and when it last moved.
    select 'row'::text, 'detail'::text,
           (c.key || ' ~ ' || c.lifecycle
            || ' ~ authored=' || (c.created_by is not null)::text
            || ' ~ created=' || c.created_at::date::text
            || ' ~ updated=' || coalesce(c.updated_at::date::text,'never')
            || ' ~ versions=' || (select count(*) from public.organization_calculation_versions v
                                   where v.organization_calculation_id = c.id)::text
            || ' ~ published_version=' || (c.published_version_id is not null)::text)::text,
           'b_' || c.key
    from public.organization_calculations c

    union all
    -- Versions, and whether any is actually BOUND to a runtime surface. A published calculation that
    -- nothing consumes is an authored artifact; a bound one is load-bearing.
    select 'versions'::text, 'runtime'::text,
           ('rows=' || count(*)::text
            || ' published=' || count(*) filter (where published_at is not null)::text
            || ' runtime_bound=' || count(*) filter (where coalesce(consumer_bindings->>'runtime_surface','false') = 'true')::text
            || ' last_published=' || coalesce(max(published_at)::date::text,'never'))::text,
           'c1'::text
    from public.organization_calculation_versions

    union all
    -- The NOT NULL probe, asked of the database rather than the repository.
    select 'not_null_probe'::text, 'probe'::text,
           ('organization_calculation_versions.organization_calculation_id is_nullable='
            || (select is_nullable from information_schema.columns
                 where table_schema='public' and table_name='organization_calculation_versions'
                   and column_name='organization_calculation_id')
            || ' ~ tables_referencing_calculations='
            || (select count(*) from information_schema.columns
                 where table_schema='public' and column_name = 'organization_calculation_id')::text)::text,
           'd1'::text

    union all
    -- Adoption shape across tenants: every org, or one?
    select 'per_org'::text, 'distribution'::text,
           ('orgs_total=' || (select count(*) from public.orgs)::text
            || ' orgs_with_calculations=' || (select count(distinct org_id) from public.organization_calculations)::text)::text,
           'e1'::text

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('calculations_table_exists=' || (to_regclass('public.organization_calculations') is not null)::text
            || ' versions_table_exists=' || (to_regclass('public.organization_calculation_versions') is not null)::text
            || ' orgs=' || (select count(*) from public.orgs)::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;
