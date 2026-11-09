-- Documents D9-H2 hosted HTTP proof — AGED API UPLOAD fixture RESET (proposed registered reconciliation
-- qa_d9_aged_upload_reset; pairs with qa_d9_aged_upload_ensure.sql in this directory).
-- PREPARED, NOT RUN, NOT REGISTERED. Draft for Host Capacity's documents_d9_write_v1 plan.
--
-- Removes what W-ES leaves in QA Shared, whatever run seeded it (this is also the recovery path):
--   * the Processing case the wake opened for the aged upload: by its primary source (source_kind 'upload',
--     source_id = the aged id) or by its escalation marker (metadata.api_upload_escalation.document_id). Its
--     processing_case_sources, facts, resolutions, plans, approvals, attempts and exceptions go by ON DELETE CASCADE;
--   * the aged documents row, if the harness's audited delete has not already removed it. Its versions and subject
--     links go by ON DELETE CASCADE (the version history guard admits a version deleted with its document). A late
--     new_document filing by T_W files this same row, so it is removed here either way.
-- Bytes: the ensure stores no object, and a new_document filing copies none, so this row has no bytes to orphan. If an
-- object exists at the row's or any version's path anyway, this REFUSES: bytes leave only through the audited
-- document delete, never by deleting a row.
-- Audit is history and stays: document_unfiled_upload_escalated, document_unfiled_upload_case_resolved,
-- document_filing_authorized / document_filed (workflow_events, mutation_events).
--
-- Refuses, changing nothing, when: the org is not QA Shared; the run id is missing or malformed; the aged id exists
-- in another organization; a row with the aged id is not this fixture's (marker); a stored object exists for it.
-- One transaction: after the deletes it asserts that no document with the aged id and no Processing case for it remain
-- in any organization, and raises (rolling everything back) if not. A second reset removes nothing and succeeds.
-- Never touches: storage, audit tables, installations or credentials, the external fixture's rows, any other document
-- or case, or any organization other than QA Shared.
-- Runner owns :org and :qa_run_id. Never assigns them here.
\if :{?org}
\else
do $$ begin
  raise exception 'this fixture is applied to a governed organization: psql -v org=<uuid>. It does not choose a tenant for itself.';
end $$;
\endif
\if :{?qa_run_id}
\else
do $$ begin
  raise exception 'this fixture requires psql -v qa_run_id=<qar_…>. Cross-run contamination is refused.';
end $$;
\endif

select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as is_qa_shared \gset
\if :is_qa_shared
\else
do $$ begin
  raise exception 'the D9 aged upload fixture is reset with org = QA Shared only';
end $$;
\endif
select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \gset
\if :qa_run_id_wellformed
\else
do $$ begin
  raise exception 'qa_run_id must be qar_ followed by 12 lowercase hex characters';
end $$;
\endif

\set aged 'd9000000-0000-4000-8000-000000000301'
\set family 'documents_d9_aged_upload'

select exists (select 1 from public.documents d where d.id = :'aged'::uuid and d.org_id <> :'org'::uuid) as aged_foreign_org \gset
\if :aged_foreign_org
do $$ begin
  raise exception 'the D9 aged upload id exists in another organization; refusing';
end $$;
\endif
select exists (select 1 from public.documents d where d.id = :'aged'::uuid and coalesce(d.metadata->>'fixture_family', '') <> :'family') as aged_not_ours \gset
\if :aged_not_ours
do $$ begin
  raise exception 'a document with the D9 aged upload id is not this fixture''s; refusing';
end $$;
\endif
select exists (
    select 1 from storage.objects so
     where so.bucket_id = 'org_documents'
       and so.name in (select d.storage_path from public.documents d where d.id = :'aged'::uuid and d.storage_path is not null
                       union
                       select v.storage_path from public.document_versions v where v.document_id = :'aged'::uuid and v.storage_path is not null)
  ) as aged_has_bytes \gset
\if :aged_has_bytes
do $$ begin
  raise exception 'a stored object exists for the D9 aged upload; delete it through the audited document delete first';
end $$;
\endif

-- Whose row this reset takes (reported only).
select coalesce((select d.metadata->>'qa_run_id' from public.documents d where d.id = :'aged'::uuid), '') as removed_run_id \gset

begin;

delete from public.processing_cases pc
 where pc.org_id = :'org'::uuid
   and (pc.id in (select s.processing_case_id from public.processing_case_sources s
                   where s.org_id = :'org'::uuid and s.source_kind = 'upload' and s.source_id = :'aged'::uuid and s.role = 'primary')
        or pc.metadata->'api_upload_escalation'->>'document_id' = :'aged');
\set n_cases :ROW_COUNT

delete from public.documents d
 where d.org_id = :'org'::uuid
   and d.id = :'aged'::uuid
   and d.metadata->>'fixture_family' = :'family';
\set n_documents :ROW_COUNT

-- Zero residue, measured inside the same transaction, in every organization.
select ((select count(*) from public.documents where id = :'aged'::uuid)
      + (select count(*) from public.processing_case_sources where source_kind = 'upload' and source_id = :'aged'::uuid)
      + (select count(*) from public.processing_cases where metadata->'api_upload_escalation'->>'document_id' = :'aged')) as aged_residue \gset
select (:aged_residue = 0) as aged_zero \gset
\if :aged_zero
\else
do $$ begin
  raise exception 'D9 aged upload residue remains after the reset; rolled back';
end $$;
\endif

commit;

select json_build_object(
    'd9_aged_upload_reset_counts', json_build_object(
        'qa_run_id', :'qa_run_id',
        'removed_run_id', :'removed_run_id',
        'documents', :n_documents,
        'processing_cases', :n_cases,
        'residue', :aged_residue,
        'storage_objects', 0,
        'audit_rows', 0
    )
)::text as d9_aged_upload_reset_result;
