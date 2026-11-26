-- Documents D3 — audit and configuration evidence for authz_q1 run qar_ad7ca37df52f (opened 2026-10-23T21:14Z). READ-ONLY.
-- The run's Studio configuration (keys tagged qa_ad7ca37df52f_*) and its audit events in the QA organizations, and the
-- sensitivity the run's typed document received. Ids, keys and counts only.
-- One statement; question_id | row_kind | payload(json).
with qa as (select '4acc9386-c485-486f-aa1f-05d83499d142'::uuid as shared, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid as secondary),
ev as (select we.* from public.workflow_events we, qa where we.created_at >= '2026-10-23T21:14:00Z' and we.org_id in (qa.shared, qa.secondary)
         and we.event_type in ('document_category_changed', 'document_type_changed'))
select question_id, 'data' as row_kind, payload
from (
    select 'a00_configuration'::text as question_id,
           json_build_object('measured_at', now(),
               'tagged_categories', (select json_agg(json_build_object('key', c.key, 'status', c.status, 'parent_set', c.parent_id is not null) order by c.key)
                    from public.document_categories c, qa where c.org_id = qa.shared and c.key like 'qa_ad7ca37df52f_%'),
               'tagged_types', (select json_agg(json_build_object('key', t.key, 'status', t.status,
                    'versions', (select json_agg(json_build_object('n', v.version_number, 'status', v.status, 'sensitivity', v.default_sensitivity) order by v.version_number)
                                   from public.document_type_versions v where v.document_type_id = t.id)))
                    from public.document_types t, qa where t.org_id = qa.shared and t.key like 'qa_ad7ca37df52f_%'),
               'typed_documents', (select json_agg(json_build_object('document_id', d.id, 'sensitivity', d.sensitivity)) from public.documents d, qa
                    where d.org_id = qa.shared and d.doc_type like 'qa_ad7ca37df52f_%'),
               'tagged_configuration_outside_qa_shared', (select count(*) from public.document_categories c, qa where c.key like 'qa_ad7ca37df52f_%' and c.org_id <> qa.shared)
                    + (select count(*) from public.document_types t, qa where t.key like 'qa_ad7ca37df52f_%' and t.org_id <> qa.shared))::text as payload
    union all
    select 'a01_audit_count',
           json_build_object('event', event_type, 'action', payload ->> 'action', 'events', count(*), 'actor_present', bool_and((payload ->> 'actor_user_id') is not null))::text
    from ev group by event_type, payload ->> 'action'
    union all
    select 'a02_publish_detail',
           json_build_object('subject', entity_id, 'version_number', payload ->> 'version_number', 'from', payload ->> 'sensitivity_from', 'to', payload ->> 'sensitivity_to', 'at', created_at)::text
    from ev where event_type = 'document_type_changed' and payload ->> 'action' = 'publish'
) census
order by question_id, payload
