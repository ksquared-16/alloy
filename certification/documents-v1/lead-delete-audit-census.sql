-- Documents lead-deletion repair -- audit evidence for the hosted lead deletion in authz_q1 run qar_67af1242d8c9. READ-ONLY.
-- The document_delete_authorized events written by the lead-deletion route in QA Shared since the run opened, and whether
-- each named document is gone. Emits ids and booleans only. One statement; question_id | row_kind | payload(json).
select question_id, 'data' as row_kind, payload
from (
    select 'a00_identity'::text as question_id,
           json_build_object('measured_at', now(),
               'events', (select count(*) from public.workflow_events we
                          where we.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                            and we.event_type = 'document_delete_authorized'
                            and we.payload ->> 'route' = 'admin/opportunities/delete'
                            and we.created_at >= '2026-10-23T13:12:00Z'))::text as payload
    union all
    select 'a01_event',
           json_build_object(
               'document_id', we.entity_id,
               'reason', we.payload ->> 'reason',
               'document_entity_id', we.payload ->> 'document_entity_id',
               'stored_objects', we.payload ->> 'stored_objects',
               'actor_present', (we.payload ->> 'actor_user_id') is not null,
               'document_row_gone', not exists (select 1 from public.documents d where d.id::text = we.entity_id::text),
               'at', we.created_at
           )::text
    from public.workflow_events we
    where we.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
      and we.event_type = 'document_delete_authorized'
      and we.payload ->> 'route' = 'admin/opportunities/delete'
      and we.created_at >= '2026-10-23T13:12:00Z'
) census
order by question_id, payload
