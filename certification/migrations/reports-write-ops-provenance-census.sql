-- Read-only census: per-org provenance for every ops grant of reports.write.
--
-- The approved model removes reports.write from the ops DEFAULT package and corrects existing orgs.
-- Aggregate evidence already showed zero custom holders and zero audit events, but a migration that
-- DELETES existing grant rows owes a per-org classification, not an aggregate one - the same
-- discipline the Schedules + Jobs and Business Process slices used before touching deployed grants.
--
-- Each ops grant is classified:
--   A_UNTOUCHED_SEED     no mutation event ever named this key for this org's ops role. Safe to correct.
--   B_DELIBERATE         an event names it - somebody granted or re-granted it on purpose. PRESERVE.
--   C_AMBIGUOUS          events exist for the role but none names this key. Do not blanket-remove.
--
-- The predicate is role-precise: it joins mutation_events to the ops role of the SAME org, because an
-- org-wide event test would let an unrelated admin-role change protect an ops grant. That correction
-- was made once already in this program after a coarse predicate let 66 admin events do exactly that.
--
-- Org ids and role keys only; no user identity is read.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
with ops_write as (
    select g.org_id, g.role_key, g.allowed, rd.is_system, rd.is_active
    from public.role_permission_grants g
    left join public.role_definitions rd
           on rd.org_id = g.org_id and rd.role_key = g.role_key
    where g.permission_key = 'reports.write' and g.role_key = 'ops'
),
classified as (
    select w.*,
           (select count(*) from public.mutation_events m
              join public.role_definitions rd2 on rd2.id = m.subject_id and rd2.org_id = m.org_id
             where m.org_id = w.org_id and m.subject_type = 'role' and rd2.role_key = 'ops'
               and (coalesce(m.new_state,'') like '%reports.write%'
                 or coalesce(m.previous_state,'') like '%reports.write%')) as key_events,
           (select count(*) from public.mutation_events m
              join public.role_definitions rd2 on rd2.id = m.subject_id and rd2.org_id = m.org_id
             where m.org_id = w.org_id and m.subject_type = 'role' and rd2.role_key = 'ops') as role_events
    from ops_write w
)
select question_id, kind, payload
from (
    select 'ops_write_grants'::text, 'summary'::text,
           ('rows=' || count(*)::text
            || ' allowed=' || count(*) filter (where allowed)::text
            || ' system_role=' || count(*) filter (where is_system)::text
            || ' custom_role=' || count(*) filter (where not coalesce(is_system,false))::text)::text,
           'a1'::text
    from classified

    union all
    select 'provenance'::text, 'decisive'::text,
           (org_id::text || ' ~ ops ~ '
            || case when key_events > 0 then 'B_DELIBERATE'
                    when role_events > 0 then 'C_AMBIGUOUS'
                    else 'A_UNTOUCHED_SEED' end
            || ' ~ key_events=' || key_events::text || ' role_events=' || role_events::text)::text,
           'b_' || org_id::text
    from classified

    union all
    -- The safety gate the migration will assert: only class A may be corrected automatically.
    select 'correctable'::text, 'decisive'::text,
           ('class_A=' || count(*) filter (where key_events = 0 and role_events = 0)::text
            || ' class_B=' || count(*) filter (where key_events > 0)::text
            || ' class_C=' || count(*) filter (where key_events = 0 and role_events > 0)::text)::text,
           'c1'::text
    from classified

    union all
    -- READ PRESERVATION. Every org losing the write key must already hold the read key, or the
    -- correction would remove analytics access rather than merely narrow authoring.
    select 'read_preserved'::text, 'decisive'::text,
           ('ops_write_orgs=' || (select count(*) from classified)::text
            || ' of_which_hold_reports_read=' || (
                 select count(*) from classified c
                  where exists (select 1 from public.role_permission_grants g2
                                 where g2.org_id = c.org_id and g2.role_key = 'ops'
                                   and g2.permission_key = 'reports.read' and g2.allowed))::text)::text,
           'd1'::text

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('grants_total=' || (select count(*) from public.role_permission_grants)::text
            || ' ops_roles=' || (select count(*) from public.role_definitions where role_key='ops')::text
            || ' mutation_events=' || (select count(*) from public.mutation_events)::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;
