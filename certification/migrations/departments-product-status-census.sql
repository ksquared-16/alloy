-- Read-only census: is `departments` a LIVE product concept on the deployed primary, or legacy?
--
-- The Access & Identity program reached a cluster of eight role-title gates under
-- /api/admin/departments and paused before designing capabilities for them, because the name
-- suggested an HR-style org chart that Alloy may have outgrown. Code evidence says otherwise —
-- `department_id` is NOT NULL on work_units and on business_process drafts and revisions, and the
-- one row on the certification stack is `enrollment`, carrying a `lifecycle_builder_v1` document.
-- That reads as an operational-domain / lifecycle container rather than a department.
--
-- Code liveness is not adoption, though. This asks the deployed database the question code cannot
-- answer: do real tenants actually have these rows, are they being written, and do the live tables
-- that structurally require one actually carry one.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
select question_id, kind, payload
from (
    select 'departments'::text as question_id, 'summary'::text as kind,
           ('rows=' || count(*)::text
            || ' active=' || count(*) filter (where is_active)::text
            || ' orgs=' || count(distinct org_id)::text
            || ' first=' || coalesce(min(created_at)::date::text, 'none')
            || ' last_created=' || coalesce(max(created_at)::date::text, 'none')
            || ' last_updated=' || coalesce(max(updated_at)::date::text, 'never'))::text as payload,
           'a1'::text as sort_key
    from public.departments

    union all
    -- Adoption shape: one per org reads as a seeded container; several reads as a configured concept.
    select 'per_org'::text, 'distribution'::text,
           ('orgs_with_departments=' || count(*)::text
            || ' min_per_org=' || coalesce(min(n)::text, '0')
            || ' max_per_org=' || coalesce(max(n)::text, '0'))::text, 'a2'::text
    from (select org_id, count(*) as n from public.departments group by org_id) d

    union all
    -- Are the keys a fixed vocabulary, or tenant-authored names?
    select 'keys'::text, 'vocabulary'::text,
           (key || ' x' || count(*)::text)::text, 'b' || key
    from public.departments group by key

    union all
    -- Do the tables that STRUCTURALLY require a department actually carry one?
    select 'structural_use'::text, 'counts'::text,
           ('work_units=' || (select count(*) from public.work_units)::text
            || ' bp_drafts=' || (select count(*) from public.business_process_drafts)::text
            || ' bp_revisions=' || (select count(*) from public.business_process_revisions)::text
            || ' user_department_access=' || (select count(*) from public.user_department_access)::text)::text,
           'c1'::text

    union all
    -- And the optional references, which say whether the concept spread beyond its own tables.
    select 'optional_use'::text, 'counts'::text,
           ('action_placements_with_dept=' || (select count(department_id) from public.action_placements)::text
            || ' kpi_placements_with_dept=' || (select count(department_id) from public.workspace_kpi_placement)::text
            || ' status_rules_with_dept=' || (select count(department_id) from public.status_transition_rules)::text)::text,
           'c2'::text

    union all
    -- Scope adoption: department_scope on the access profile is the authorization dimension.
    select 'access_scope'::text, 'distribution'::text,
           (coalesce(department_scope, 'null') || ' x' || count(*)::text)::text, 'd' || coalesce(department_scope, 'null')
    from public.user_access_profiles group by department_scope
) rows
order by sort_key;
