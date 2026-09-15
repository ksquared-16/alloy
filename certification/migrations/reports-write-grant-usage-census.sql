-- Read-only census: is reports.write an ESTABLISHED organization-configurable authority, or a
-- seeded key that confers nothing?
--
-- The Operational Intelligence convergence must decide whether to enforce reports.write on ten
-- currently admin-only routes. Source says the key is enforced NOWHERE as a write: its only
-- executable appearance is inside canReadAnalytics, where holding it also satisfies a READ. W-13's
-- own comment records the reasoning - "granting reports.write would have handed ops a mutation
-- capability it does not have" - yet the default package grants it to ops anyway.
--
-- That is the same shape the Schedules + Jobs slice found and acted on: scheduling.write and
-- ops.jobs.write were "seeded and enforced nowhere, so the grant conferred nothing. Keeping it while
-- the keys became real would have been the widening."
--
-- So the decision turns on adoption. If custom roles hold reports.write deliberately, it is an
-- established authority family and fragmenting it would be wrong. If only the seeded system roles
-- carry it, enforcing it now would activate a dormant grant and widen ops for the first time.
--
-- Role keys and counts only; no user identity is read.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
select question_id, kind, payload
from (
    select 'holders'::text, 'summary'::text,
           ('grants_of_reports_write=' || count(*) filter (where g.permission_key = 'reports.write' and g.allowed)::text
            || ' grants_of_reports_read=' || count(*) filter (where g.permission_key = 'reports.read' and g.allowed)::text
            || ' orgs=' || count(distinct g.org_id)::text)::text,
           'a1'::text
    from public.role_permission_grants g
    where g.permission_key in ('reports.read','reports.write')

    union all
    -- WHICH roles hold the write key, and is the role a seeded system role or an org-authored one?
    select 'write_holder'::text, 'detail'::text,
           (g.role_key || ' ~ system=' || coalesce(rd.is_system, false)::text
            || ' ~ active=' || coalesce(rd.is_active, false)::text
            || ' ~ orgs=' || count(*)::text)::text,
           'b_' || g.role_key
    from public.role_permission_grants g
    left join public.role_definitions rd on rd.org_id = g.org_id and rd.role_key = g.role_key
    where g.permission_key = 'reports.write' and g.allowed
    group by g.role_key, rd.is_system, rd.is_active

    union all
    -- The decisive split: any CUSTOM (non-system) role holding it is deliberate organization
    -- configuration. Only system roles holding it means the key is inert vocabulary.
    select 'custom_adoption'::text, 'decisive'::text,
           ('custom_roles_with_reports_write=' || count(*) filter (where coalesce(rd.is_system,false) = false)::text
            || ' system_roles_with_reports_write=' || count(*) filter (where coalesce(rd.is_system,false) = true)::text)::text,
           'c1'::text
    from public.role_permission_grants g
    left join public.role_definitions rd on rd.org_id = g.org_id and rd.role_key = g.role_key
    where g.permission_key = 'reports.write' and g.allowed

    union all
    -- Has anyone ever deliberately changed a reports grant? An audited change is adoption; silence
    -- is a seed nobody has touched.
    select 'audit_trace'::text, 'provenance'::text,
           ('events_mentioning_reports_write=' || count(*) filter (
                where coalesce(m.new_state,'') like '%reports.write%'
                   or coalesce(m.previous_state,'') like '%reports.write%')::text
            || ' events_mentioning_reports_read=' || count(*) filter (
                where coalesce(m.new_state,'') like '%reports.read%'
                   or coalesce(m.previous_state,'') like '%reports.read%')::text
            || ' role_events_total=' || count(*) filter (where m.subject_type = 'role')::text)::text,
           'd1'::text
    from public.mutation_events m

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('grants_total=' || (select count(*) from public.role_permission_grants)::text
            || ' role_definitions=' || (select count(*) from public.role_definitions)::text
            || ' custom_roles=' || (select count(*) from public.role_definitions where not coalesce(is_system,false))::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;
