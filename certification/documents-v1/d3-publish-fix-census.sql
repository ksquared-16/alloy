-- Documents D3 — the publish-conflict fix reached the deployed primary. READ-ONLY, catalog only.
-- One statement; question_id | row_kind | payload(json).
select 'f00_publish_fix'::text as question_id, 'data' as row_kind,
       json_build_object('measured_at', now(),
           'ledger_20261209090200', (select count(*) from supabase_migrations.schema_migrations where version = '20261209090200'),
           'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
           'publish_raises_retryable', strpos(pg_get_functiondef('public.document_type_publish(uuid, uuid, uuid, uuid, uuid)'::regprocedure), 'serialization_failure') > 0,
           'publish_raises_55000', strpos(pg_get_functiondef('public.document_type_publish(uuid, uuid, uuid, uuid, uuid)'::regprocedure), 'object_not_in_prerequisite_state') > 0)::text as payload
