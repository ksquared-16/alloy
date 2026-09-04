-- FINAL certification census for REAL ENROLLMENT V1, run BEFORE the automation fixture reset.
--
-- WHY BEFORE. The census has to inspect the state that actually produced the certification. Reset
-- first and it inspects an empty namespace and reports "clean" about nothing — which is the shape
-- of every reassuring measurement this program has already had to throw away.
--
-- SCOPED TO THE FIXTURE OWNERSHIP GRAPH, not to the tenant. Every question below is anchored on
-- persons whose email sits in the reserved RFC-2606 namespace `enrollment-cert.alloy.invalid`, so
-- nothing here can report on, or be confused by, real Firefly families. A census that swept the
-- whole tenant would find real rows it has no business explaining, and "unexplained row" would stop
-- meaning anything.
--
-- Emits the labeled-row form the trusted host parses, and leads with an unconditional answer so
-- absence is data rather than silence.
with fixture_persons as (
    select p.id, p.email, p.first_name, p.last_name
    from public.persons p
    where p.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and p.email like '%@enrollment-cert.alloy.invalid'
),
fixture_members as (
    select cm.id, cm.customer_id, cm.person_id, cm.first_name, cm.last_name
    from public.customer_members cm
    join fixture_persons fp on fp.id = cm.person_id
    where cm.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
),
fixture_customers as (
    select distinct cp.customer_id
    from public.customer_persons cp
    join fixture_persons fp on fp.id = cp.person_id
    where cp.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
),
fixture_ocm as (
    select o.id, o.customer_member_id, o.opportunity_id, o.outcome_status_key
    from public.opportunity_customer_members o
    join fixture_members fm on fm.id = o.customer_member_id
    where o.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
),
fixture_journeys as (
    select pi.id, pi.subject_id, pi.context_id, pi.context_type, pi.state, pi.stage_key
    from public.process_instances pi
    join fixture_members fm on fm.id = pi.subject_id
    where pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and pi.process_key = 'enrollment'
)
select question_id, 'data' as row_kind, payload
from (
    -- ALWAYS ONE ROW. The shape of the fixture graph, so zero is never mistaken for unread.
    select 'fixture_totals'::text as question_id,
           json_build_object(
               'persons', (select count(*) from fixture_persons),
               'households', (select count(*) from fixture_customers),
               'children', (select count(*) from fixture_members),
               'participations', (select count(*) from fixture_ocm),
               'journeys', (select count(*) from fixture_journeys),
               'opportunities', (select count(distinct opportunity_id) from fixture_ocm where opportunity_id is not null)
           )::text as payload

    union all

    -- B/C. Participations: which are enrolled history, which are the active next episode, and
    -- whether any child holds two ACTIVE context-free episodes (the duplicate-episode invariant).
    select 'participations'::text,
           json_build_object(
               'child', fm.first_name || ' ' || fm.last_name,
               'status', o.outcome_status_key,
               'has_opportunity', (o.opportunity_id is not null)
           )::text
    from fixture_ocm o
    join fixture_members fm on fm.id = o.customer_member_id

    union all

    select 'duplicate_active_context_free'::text,
           json_build_object('child_id', o.customer_member_id, 'active_context_free', count(*))::text
    from fixture_ocm o
    where o.opportunity_id is null
      and coalesce(o.outcome_status_key, '') not in ('enrolled', 'closed', 'withdrawn', 'not_enrolling')
    group by o.customer_member_id
    having count(*) > 1

    union all

    -- D. Journeys, with their anchor. context_id must be the participation, never the Opportunity.
    select 'journeys'::text,
           json_build_object(
               'child', fm.first_name || ' ' || fm.last_name,
               'state', j.state,
               'stage', j.stage_key,
               'context_type', j.context_type,
               'anchored_to_participation', (j.context_id in (select id from fixture_ocm))
           )::text
    from fixture_journeys j
    join fixture_members fm on fm.id = j.subject_id

    union all

    -- D. An orphan is a fixture journey whose subject child no longer exists.
    select 'orphan_journeys'::text,
           json_build_object('journey_id', pi.id, 'subject_id', pi.subject_id)::text
    from public.process_instances pi
    where pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and pi.process_key = 'enrollment'
      and pi.subject_id is not null
      and not exists (select 1 from public.customer_members cm where cm.id = pi.subject_id)

    union all

    -- E. Forms. Duplicate submissions are what correction and repeated signing would produce.
    select 'forms'::text,
           json_build_object(
               'packet_sessions', (
                   select count(*) from public.form_packet_sessions s
                   where s.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                     and s.process_instance_id in (select id from fixture_journeys)
               ),
               'session_items', (
                   select count(*) from public.form_packet_session_items i
                   where i.session_id in (
                       select s.id from public.form_packet_sessions s
                       where s.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                         and s.process_instance_id in (select id from fixture_journeys)
                   )
               ),
               'submissions', (
                   select count(*) from public.form_submissions fs
                   where fs.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                     and fs.id in (
                         select i.form_submission_id from public.form_packet_session_items i
                         where i.form_submission_id is not null
                           and i.session_id in (
                               select s.id from public.form_packet_sessions s
                               where s.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                                 and s.process_instance_id in (select id from fixture_journeys)
                           )
                     )
               )
           )::text

    union all

    -- F. Exceptions: the grant/revoke history, and whether any is still ACTIVE. An exception left
    -- live would make a blocking requirement non-blocking for Kelly without anyone intending it.
    select 'exceptions'::text,
           json_build_object(
               'total', count(*),
               'active', count(*) filter (where e.revoked_at is null)
           )::text
    from public.enrollment_requirement_exceptions e
    where e.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and e.process_instance_id in (select id from fixture_journeys)

    union all

    -- G. Handoff. Zero rows is the CONFIGURED result while the org gate is off, so the gate is
    -- reported beside the counts — zero without the gate would be indistinguishable from a silent
    -- handoff failure, which is the exact confusion P_handoff exists to prevent.
    select 'handoff'::text,
           json_build_object(
               'operational_enrollment_v1_enabled', coalesce((
                   select (os.metadata -> 'childcare_operational_enrollment_v1' ->> 'enabled')::boolean
                   from public.org_settings os
                   where os.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
               ), false),
               'agreements', (
                   select count(*) from public.child_enrollment_agreements a
                   where a.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                     and a.customer_member_id in (select id from fixture_members)
               ),
               'placements', (
                   select count(*) from public.child_placements pl
                   where pl.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                     and pl.customer_member_id in (select id from fixture_members)
               ),
               'schedule_assignments', (
                   select count(*) from public.schedule_assignments sa
                   where sa.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                     and sa.customer_member_id in (select id from fixture_members)
               )
           )::text

    union all

    -- B. Path A must never fabricate an Enrollment Opportunity. Any fixture Opportunity should
    -- belong to the acquisition-backed family alone.
    select 'opportunities'::text,
           json_build_object(
               'opportunity_id', opp.id,
               'status', opp.status_key,
               'children_on_it', (
                   select count(*) from fixture_ocm o where o.opportunity_id = opp.id
               )
           )::text
    from public.opportunities opp
    where opp.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and opp.id in (select opportunity_id from fixture_ocm where opportunity_id is not null)
) census
order by question_id, payload
