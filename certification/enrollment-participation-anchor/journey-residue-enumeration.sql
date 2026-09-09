-- Enumerate the participation-anchored journeys that are NOT fixture-owned.
--
-- The post-promotion census put participation-anchored journeys at 16 while measuring the fixture's
-- entire footprint as 2 people, 2 households and 2 children. Two more belonged to the pre-fixture
-- baseline. The remainder are residue from earlier certification attempts, before the fixture existed,
-- when certification ran against whichever tenant children were to hand.
--
-- WHY IDS. Every predicate available for removing them -- "created after some time", "anchored to a
-- participation", "has no completed enrollment" -- has no namespace behind it and would reach real
-- children. An explicit list of ids is the only selector that cannot over-reach, and a list cannot be
-- reviewed before it is produced. So this produces it, and nothing else: this file DELETES NOTHING.
--
-- Returns ids, timestamps, stage/state/context and a namespace flag. No names, no e-mail addresses,
-- no date of birth -- nothing about the children themselves beyond the fact that a row points at one.
select question_id, 'data' as row_kind, payload
from (
    select 'participation_anchored_journeys'::text as question_id,
           json_build_object(
               'journey_id', pi.id,
               'subject_child_id', pi.subject_id,
               'participation_id', pi.context_id,
               'stage_key', pi.stage_key,
               'state', pi.state,
               'intent', pi.metadata->>'source',
               'created_at', pi.created_at::text,
               'in_fixture_namespace', (p.id is not null),
               'created_before_baseline', (pi.created_at < timestamptz '2026-09-02T16:49:40Z'),
               'sessions_bound', (
                   select count(*) from public.form_packet_sessions s
                   where s.process_instance_id = pi.id
               )
           )::text as payload
    from public.process_instances pi
    left join public.customer_members cm on cm.id = pi.subject_id and cm.org_id = pi.org_id
    left join public.customer_persons cp on cp.customer_id = cm.customer_id and cp.org_id = pi.org_id
    left join public.persons p on p.id = cp.person_id and p.org_id = pi.org_id
         and p.email like '%@enrollment-cert.alloy.invalid'
    where pi.process_key = 'enrollment'
      and pi.context_type = 'enrollment_participation'
) census
order by question_id, payload
