-- PROVE ownership of the twelve suspected residue journeys. Deletes nothing.
--
-- The enumeration showed all twelve created on 2026-09-02 inside the fixture-development window, with
-- shapes matching prior fixture runs. That is recognition, not proof, and recognition is not a
-- licence to delete rows in a tenant that holds real children.
--
-- The decisive test the Director set: if the subject child no longer exists and the row is otherwise
-- unreferenced, it is a FIXTURE_ORPHAN. If a child or any non-fixture durable record still exists,
-- the row stops and gets reported instead.
--
-- So this asks, per journey and by explicit id: does the subject child still exist; does its
-- household still exist; is the child still reachable from the reserved namespace; how many
-- participations, agreements, placements and participant sessions reference it; and what state and
-- stage the row itself holds.
--
-- Agreements and placements matter especially: both reference customer_members with ON DELETE
-- RESTRICT, so a child carrying either could not have been deleted at all. Their absence is part of
-- the orphan argument rather than a detail.
--
-- Ids only, no names, no e-mail addresses, nothing about the children themselves.
with residue(journey_id) as (
    values
        ('1083c667-2459-48f1-baee-ef5e86e4e042'::uuid),
        ('27ddbe72-5fa2-477a-86ef-a9ffb5a8f4b6'::uuid),
        ('2c98f351-96a2-49dd-8ac6-0e856e8c3f1e'::uuid),
        ('45775b36-e933-47a4-b028-63b96d761a73'::uuid),
        ('4c6a14c6-31aa-49fb-a6cb-23c5dd89537c'::uuid),
        ('7b0fd025-1055-43c8-9e81-4d566e7bbc0c'::uuid),
        ('80cdccdb-22ab-4046-9d87-a713a450c085'::uuid),
        ('8a3b6127-1108-4fa0-8e47-bab8bd50af0b'::uuid),
        ('9d70cfbd-d72d-4f12-b83d-34cd4f3b4c38'::uuid),
        ('ab786e52-187c-46c8-a32f-567c1f35b79f'::uuid),
        ('bdd4a7cd-3123-485a-9779-0468eb70bbcb'::uuid),
        ('ff7bbd77-b11c-4c0c-9af7-2f8078ff19cd'::uuid)
)
select question_id, 'data' as row_kind, payload
from (
    select 'residue_ownership'::text as question_id,
           json_build_object(
               'journey_id', r.journey_id,
               'journey_row_exists', (pi.id is not null),
               'subject_child_id', pi.subject_id,
               'child_exists', (cm.id is not null),
               'household_exists', (c.id is not null),
               'child_in_fixture_namespace', (p.id is not null),
               'participation_row_exists', (ocm.id is not null),
               'participations_for_child', (
                   select count(*) from public.opportunity_customer_members o
                   where o.customer_member_id = pi.subject_id
               ),
               'agreements_for_child', (
                   select count(*) from public.child_enrollment_agreements a
                   where a.customer_member_id = pi.subject_id
               ),
               'placements_for_child', (
                   select count(*) from public.child_placements pl
                   where pl.customer_member_id = pi.subject_id
               ),
               'sessions_bound', (
                   select count(*) from public.form_packet_sessions s
                   where s.process_instance_id = r.journey_id
               ),
               'stage_key', pi.stage_key,
               'state', pi.state,
               'intent', pi.metadata->>'source',
               'context_type', pi.context_type
           )::text as payload
    from residue r
    left join public.process_instances pi on pi.id = r.journey_id
    left join public.customer_members cm on cm.id = pi.subject_id
    left join public.customers c on c.id = cm.customer_id
    left join public.customer_persons cp on cp.customer_id = cm.customer_id
    left join public.persons p on p.id = cp.person_id
         and p.email like '%@enrollment-cert.alloy.invalid'
    left join public.opportunity_customer_members ocm on ocm.id = pi.context_id
) census
order by question_id, payload
