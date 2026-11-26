-- Documents D1b/D1c-1 — audit evidence for authz_q1 run qar_efe9bd0d1d9c (opened 2026-10-23T14:24Z). READ-ONLY.
-- D1a/D1c-1 document audit events in the two QA organizations since the run opened: counts per event, organization and
-- route, and the quarantine/release events in full shape (no titles, names, paths or contents). Also checks that every
-- released document had first been quarantined, and that nothing outside the QA organizations was written.
-- One statement; question_id | row_kind | payload(json).
with ev as (
    select we.* from public.workflow_events we
    where we.created_at >= '2026-10-23T14:24:00Z'
      and we.event_type in ('document_link_issued', 'document_delete_authorized', 'document_delete_failed',
                            'document_quarantined', 'document_released', 'document_uploaded')
)
select question_id, 'data' as row_kind, payload
from (
    select 'v00_identity'::text as question_id,
           json_build_object('measured_at', now(),
               'events_qa_orgs', (select count(*) from ev where org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)),
               'quarantine_or_release_outside_qa_orgs', (select count(*) from ev where event_type in ('document_quarantined', 'document_released')
                                                          and org_id not in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)))::text as payload
    union all
    select 'v01_count',
           json_build_object('event', event_type,
               'org', case org_id when '4acc9386-c485-486f-aa1f-05d83499d142'::uuid then 'qa_shared' when 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid then 'qa_secondary' else 'other' end,
               'route', payload ->> 'route', 'events', count(*))::text
    from ev
    where org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
    group by event_type, org_id, payload ->> 'route'
    union all
    select 'v02_screening_event',
           json_build_object('event', event_type, 'document_id', entity_id, 'route', payload ->> 'route',
               'engine', payload ->> 'engine', 'reason', payload ->> 'reason', 'findings', payload -> 'findings',
               'screening_reason', payload ->> 'screening_reason', 'release_reason_present', coalesce(length(payload ->> 'reason'), 0) >= 10,
               'actor_present', (payload ->> 'actor_user_id') is not null, 'at', created_at)::text
    from ev
    where event_type in ('document_quarantined', 'document_released')
      and org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
    union all
    select 'v03_release_follows_quarantine',
           json_build_object('released', (select count(*) from ev r where r.event_type = 'document_released'),
               'released_without_prior_quarantine', (select count(*) from ev r where r.event_type = 'document_released'
                   and not exists (select 1 from ev q where q.event_type = 'document_quarantined' and q.entity_id = r.entity_id and q.created_at < r.created_at)))::text
) census
order by question_id, payload
