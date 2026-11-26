-- FINAL certification census for REAL ENROLLMENT V1. Run BEFORE the automation fixture reset.
--
-- WHY BEFORE. The census must inspect the state that actually produced the certification. Reset
-- first and it inspects an empty namespace and reports "clean" about nothing.
--
-- EVERY COLUMN BELOW IS VERIFIED against information_schema by the catalog census
-- (certification-schema-catalog.sql, gar_53bc031afc38fc). The previous version of this file failed
-- `execution_failed` on two columns that do not exist, and guessing a third time was not an option:
--
--   enrollment_requirement_exceptions   anchors on `enrollment_participation_id`, NOT
--                                       `process_instance_id`. Exceptions hang off the PARTICIPATION,
--                                       which is consistent with the OCM being the durable Enrollment
--                                       subject — the earlier guess had them hanging off the journey.
--   form_packet_session_items           uses `packet_session_id`, not `session_id`.
--
-- (Two runs earlier the same class of guess cost `status_key` and `location_id` on the operational
-- tables; those are really `status` and `site_location_id`, also confirmed here.)
--
-- SCOPED TO THE FIXTURE OWNERSHIP GRAPH, never to the tenant. Ownership is rooted in the reserved
-- RFC-2606 namespace `enrollment-cert.alloy.invalid` and walked through real foreign keys:
--
--   persons(email @ namespace) -> customer_persons -> customers -> customer_members -> OCM -> journeys
--
-- No timestamps as ownership, no surname matching, no orphan sweep. A census that swept the tenant
-- would find real Firefly families it has no business explaining, and "unexplained row" would stop
-- meaning anything.
--
-- Observational only. No writes.
with fixture_persons as (
    select p.id
    from public.persons p
    where p.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and p.email like '%@enrollment-cert.alloy.invalid'
),
fixture_customers as (
    select distinct cp.customer_id
    from public.customer_persons cp
    join fixture_persons fp on fp.id = cp.person_id
    where cp.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
),
fixture_members as (
    select cm.id, cm.customer_id, cm.display_name, cm.relationship
    from public.customer_members cm
    join fixture_customers fc on fc.customer_id = cm.customer_id
    where cm.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
),
fixture_ocm as (
    select o.id, o.customer_member_id, o.opportunity_id, o.outcome_status_key, o.stage_key
    from public.opportunity_customer_members o
    join fixture_members fm on fm.id = o.customer_member_id
    where o.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
),
fixture_journeys as (
    select pi.id, pi.subject_id, pi.context_id, pi.context_type, pi.state, pi.stage_key,
           pi.business_process_revision_id
    from public.process_instances pi
    join fixture_members fm on fm.id = pi.subject_id
    where pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and pi.process_key = 'enrollment'
),
fixture_sessions as (
    select s.id, s.process_instance_id, s.status, s.started_via_public_link_id
    from public.form_packet_sessions s
    join fixture_journeys j on j.id = s.process_instance_id
    where s.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
)
select question_id, 'data' as row_kind, payload
from (
    -- ALWAYS ONE ROW. The shape of the whole fixture graph, so zero can never read as unread.
    select 'fixture_totals'::text as question_id,
           json_build_object(
               'persons', (select count(*) from fixture_persons),
               'households', (select count(*) from fixture_customers),
               'members', (select count(*) from fixture_members),
               'children', (select count(*) from fixture_members where relationship = 'child'),
               'participations', (select count(*) from fixture_ocm),
               'journeys', (select count(*) from fixture_journeys),
               'opportunities', (select count(distinct opportunity_id) from fixture_ocm where opportunity_id is not null),
               'packet_sessions', (select count(*) from fixture_sessions)
           )::text as payload

    union all

    -- PARTICIPATIONS. Path A is expected to hold TWO context-free rows — Episode A enrolled history
    -- and Episode B active — and Path B exactly one acquisition-backed row.
    select 'participations'::text,
           json_build_object(
               'child', fm.display_name,
               'status', o.outcome_status_key,
               'stage', o.stage_key,
               'acquisition_backed', (o.opportunity_id is not null)
           )::text
    from fixture_ocm o
    join fixture_members fm on fm.id = o.customer_member_id

    union all

    -- THE INVARIANT THAT MATTERS: at most one ACTIVE context-free episode per child. Two concluded
    -- ones are intentional; two active ones are the duplicate-episode defect.
    select 'active_context_free_per_child'::text,
           json_build_object('child', fm.display_name, 'active', count(*))::text
    from fixture_ocm o
    join fixture_members fm on fm.id = o.customer_member_id
    where o.opportunity_id is null
      and coalesce(o.outcome_status_key, '') not in ('enrolled', 'withdrawn', 'not_enrolling')
    group by fm.display_name

    union all

    -- JOURNEYS and their anchor. context_id must be the participation, never the Opportunity.
    select 'journeys'::text,
           json_build_object(
               'child', fm.display_name,
               'state', j.state,
               'stage', j.stage_key,
               'context_type', j.context_type,
               'anchored_to_participation', (j.context_id in (select id from fixture_ocm)),
               'revision_pinned', (j.business_process_revision_id is not null)
           )::text
    from fixture_journeys j
    join fixture_members fm on fm.id = j.subject_id

    union all

    -- An orphan journey is one whose subject child no longer exists at all.
    select 'orphan_journeys'::text,
           json_build_object('journey_id', pi.id, 'subject_id', pi.subject_id)::text
    from public.process_instances pi
    where pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and pi.process_key = 'enrollment'
      and pi.subject_id is not null
      and not exists (select 1 from public.customer_members cm where cm.id = pi.subject_id)

    union all

    -- OPPORTUNITIES. Path A must have fabricated none; Path B exactly its acquisition episode.
    select 'opportunities'::text,
           json_build_object(
               'status', opp.status_key,
               'children_on_it', (select count(*) from fixture_ocm o where o.opportunity_id = opp.id)
           )::text
    from public.opportunities opp
    where opp.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and opp.id in (select opportunity_id from fixture_ocm where opportunity_id is not null)

    union all

    -- FORMS. Duplicate submissions are what a correction or a re-signature would leave behind.
    select 'forms'::text,
           json_build_object(
               'sessions', (select count(*) from fixture_sessions),
               'sessions_in_progress', (select count(*) from fixture_sessions where status = 'in_progress'),
               'sessions_completed', (select count(*) from fixture_sessions where status = 'completed'),
               'items', (
                   select count(*) from public.form_packet_session_items i
                   where i.packet_session_id in (select id from fixture_sessions)
               ),
               'items_with_submission', (
                   select count(*) from public.form_packet_session_items i
                   where i.packet_session_id in (select id from fixture_sessions)
                     and i.form_submission_id is not null
               ),
               'distinct_submissions', (
                   select count(distinct i.form_submission_id) from public.form_packet_session_items i
                   where i.packet_session_id in (select id from fixture_sessions)
                     and i.form_submission_id is not null
               )
           )::text

    union all

    -- One row per session so Episode A's completed evidence is visibly separate from Episode B's.
    select 'session_by_journey'::text,
           json_build_object(
               'child', fm.display_name,
               'journey_state', j.state,
               'session_status', s.status,
               'submissions', (
                   select count(*) from public.form_packet_session_items i
                   where i.packet_session_id = s.id and i.form_submission_id is not null
               )
           )::text
    from fixture_sessions s
    join fixture_journeys j on j.id = s.process_instance_id
    join fixture_members fm on fm.id = j.subject_id

    union all

    -- EXCEPTIONS anchor on the PARTICIPATION. `state`/`revoked_at` carry the grant/revoke history,
    -- and an exception still live would silently unblock a requirement for Kelly.
    select 'exceptions'::text,
           json_build_object(
               'total', count(*),
               'active', count(*) filter (where e.revoked_at is null),
               'revoked', count(*) filter (where e.revoked_at is not null)
           )::text
    from public.enrollment_requirement_exceptions e
    where e.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      and e.enrollment_participation_id in (select id from fixture_ocm)

    union all

    -- HANDOFF. Zero rows is the CONFIGURED result while the org gate is off, so the gate is read
    -- beside the counts: zero without the gate is indistinguishable from a silent handoff failure.
    select 'handoff'::text,
           json_build_object(
               'operational_enrollment_v1_enabled', coalesce((
                   select (os.metadata -> 'childcare_operational_enrollment_v1' ->> 'enabled')
                   from public.org_settings os
                   where os.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                   limit 1
               ), 'absent'),
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
) census
order by question_id, payload
