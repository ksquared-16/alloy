-- Read-only census: PROVENANCE of the `ops` grants to `scheduling.write` and `ops.jobs.write`
-- on the deployed primary, per organization.
--
-- WHY THIS EXISTS. Both keys are enforced NOWHERE today — their only executable reference in the
-- product is `web/lib/admin/unenforcedPermissionKeys.json`, a declaration list deliberately written
-- as JSON so it cannot falsify the enforcement scan that produces it. So the grants are currently
-- inert, and the Schedules + Jobs slice wants to stop seeding them to `ops` by default.
--
-- That correction is only safe for a grant nobody chose. An organization that DELIBERATELY granted
-- `scheduling.write` to its ops role owns that decision, and a default-package reconciliation must
-- not quietly take it away. The doctrine is: remove only class A, preserve B and C.
--
--   A  untouched seeded default   — ops holds it and no audited change ever touched it here
--   B  deliberate configuration   — an audited access change granted or re-granted it
--   C  ambiguous                  — ops holds it and the audit trail cannot settle which
--
-- The discriminator is `mutation_events`, which D2 made the immutable record of every access
-- change. A grant with no event behind it was never chosen by anyone: it arrived with the tenant.
--
-- Output contract: question_id | kind | payload. The parser takes the first two columns as identity,
-- so the answer must be third. One statement, no DDL, no writes.
with ops_roles as (
    select rd.org_id
    from public.role_definitions rd
    where rd.role_key = 'ops' and rd.is_active
),
held as (
    select r.org_id,
           max(case when g.permission_key = 'scheduling.write' then 1 else 0 end) as has_sched,
           max(case when g.permission_key = 'ops.jobs.write' then 1 else 0 end)   as has_jobs
    from ops_roles r
    left join public.role_permission_grants g
           on g.org_id = r.org_id and g.role_key = 'ops'
          and g.permission_key in ('scheduling.write', 'ops.jobs.write')
          and g.allowed
    group by r.org_id
),
-- Any audited access change that mentions either key, for this org, at any time.
touched as (
    select h.org_id,
           (select count(*) from public.mutation_events m
             where m.org_id = h.org_id
               and (coalesce(m.new_state, '') like '%scheduling.write%'
                 or coalesce(m.previous_state, '') like '%scheduling.write%'
                 or coalesce(m.new_state, '') like '%ops.jobs.write%'
                 or coalesce(m.previous_state, '') like '%ops.jobs.write%')) as events
    from held h
),
classified as (
    select h.org_id, h.has_sched, h.has_jobs, t.events,
           case
             when h.has_sched = 0 and h.has_jobs = 0 then 'none-held'
             when t.events = 0 then 'A'
             else 'C'
           end as class
    from held h join touched t on t.org_id = h.org_id
)
select question_id, kind, payload
from (
    select 'ops_grant'::text as question_id, 'provenance'::text as kind,
           (c.org_id::text || ' ~ scheduling.write=' || (case when c.has_sched = 1 then 'held' else 'absent' end)
            || ' ~ ops.jobs.write=' || (case when c.has_jobs = 1 then 'held' else 'absent' end)
            || ' ~ audited_events=' || c.events::text
            || ' ~ class=' || c.class)::text as payload,
           'a' || c.org_id::text as sort_key
    from classified c

    union all
    select 'class_totals'::text, 'summary'::text,
           (c.class || ' ~ organizations=' || count(*)::text)::text, 'y' || c.class
    from classified c group by c.class

    union all
    select 'org_totals'::text, 'summary'::text,
           ('active ops roles=' || (select count(*) from ops_roles)::text
            || ' ~ holding either key=' || (select count(*) from classified where has_sched = 1 or has_jobs = 1)::text)::text,
           'z1'::text
) rows
order by sort_key;
