-- Documents D3 — zero configuration residue after authz_q1 run qar_ad7ca37df52f. READ-ONLY.
-- The run's Studio configuration (keys tagged qa_ad7ca37df52f_*) and any document typed with it must be gone; the
-- QA organizations' starter vocabulary must be intact (seeded rows are product configuration, not residue).
-- One statement; question_id | row_kind | payload(json).
select 'r00_d3_residue'::text as question_id, 'data' as row_kind,
       json_build_object('measured_at', now(),
           'tagged_categories', (select count(*) from public.document_categories where key like 'qa_ad7ca37df52f_%'),
           'tagged_types', (select count(*) from public.document_types where key like 'qa_ad7ca37df52f_%'),
           'tagged_type_versions', (select count(*) from public.document_type_versions v join public.document_types t on t.id = v.document_type_id where t.key like 'qa_ad7ca37df52f_%'),
           'typed_documents', (select count(*) from public.documents where doc_type like 'qa_ad7ca37df52f_%'),
           'qa_shared_seeded_types', (select count(*) from public.document_types where org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and seeded and status = 'active'),
           'qa_shared_seeded_categories', (select count(*) from public.document_categories where org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and seeded and status = 'active'),
           'qa_shared_open_drafts', (select count(*) from public.document_type_versions where org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and status in ('draft', 'validated')),
           'qa_shared_non_seeded_configuration', (select count(*) from public.document_types where org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and not seeded)
                + (select count(*) from public.document_categories where org_id = '4acc9386-c485-486f-aa1f-05d83499d142' and not seeded))::text as payload
