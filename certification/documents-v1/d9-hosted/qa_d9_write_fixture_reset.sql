-- Documents D9-H2 hosted HTTP proof — WRITE fixture RESET (proposed registered reconciliation qa_d9_write_fixture_reset;
-- runner web/scripts/qaDocumentsD9WriteFixture.mjs, mode write-reset). PREPARED, NOT RUN, NOT REGISTERED.
-- Supersedes qa_d9_aged_upload_reset.sql (draft 6ddad4daa): the aged upload is one of the documents removed here.
--
-- WHY IT EXISTS. The D9-H2 driver removes its documents through the audited staff delete
-- (DELETE /api/admin/pos/documents/{id}), which refuses three of them by design: an unfiled or quarantined API upload
-- and a superseded replacement upload (404: not readable by staff), and the aged upload once its Processing case is
-- completed (409). This reset removes whatever D9 write residue is left, so the run can close ZERO_RESIDUE.
--
-- WHAT IT REMOVES, in QA Shared and QA Secondary only — exactly what the registered residue census (d9-residue-census.sql
-- e7e8d3d1) counts as D9 write residue, so a successful reset leaves d9w_zr_tagged_documents and d9w_zr_escalation_cases
-- at zero:
--   * documents tagged qa-d9w- (title, original_filename or storage_path) or with metadata.source = 'api_v1_upload';
--     their document_versions, document_subjects and document_version_review_events go by ON DELETE CASCADE (the
--     version guard admits a version deleted with its document; the review-event guard admits the cascade);
--   * Processing cases sourced from those documents (source_kind upload / document / recreated_document /
--     email_attachment) or carrying the API-upload escalation marker or a qa-d9w source name; their sources and child
--     rows go by ON DELETE CASCADE.
-- WHOSE ROWS: any run's. Like qa_d9_external_fixture_reset this is also the recovery path for a run that never reached
-- its reset; it returns the run ids it took (qa-d9w-<qar> in the name, or metadata.qa_run_id).
--
-- STORED BYTES ARE NOT DELETED BY SQL. Deleting storage.objects rows orphans the bytes in the bucket; bytes leave only
-- through the Storage API. So this file lists, in its result, every stored object of the removed documents (the row's
-- and every version's) plus any D9 write object left without a row (the residue census's object predicate, inside the
-- QA org prefixes), and the RUNNER removes exactly those through the Storage API after this transaction commits — the
-- same order as the audited delete (row first, then its files) — and then re-reads storage.objects to prove none remain.
--
-- Audit is history and stays: workflow_events, mutation_events, app_security_audit (document_upload_authorized,
-- document_filing_authorized, document_filed, document_archived, document_restored, document_unfiled_upload_*).
--
-- Refuses, changing nothing, when: the org is not QA Shared; the run id is missing or malformed; a qa-d9w- document or
-- object exists outside the two QA orgs (a security stop, never cleaned silently); a target document is under legal hold
-- or retention, has a stored path outside its own organization or outside the org_documents bucket, or is referenced
-- by an inbound message attachment or staff qualification evidence (ON DELETE RESTRICT links kept on purpose).
-- One transaction: after the deletes it asserts that no D9 write document, no escalation case and no case source for a
-- removed document remain in any organization, and raises (rolling everything back) if not. A second reset removes
-- nothing and succeeds.
-- Never touches: storage.objects rows, audit tables, installations or credentials, the external fixture's people rows
-- (qa_d9_external_fixture_reset, which runs AFTER this one: it refuses while a document references a fixture subject),
-- D9 read documents (qa-d9r-), or any organization other than QA Shared and QA Secondary.
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
  raise exception 'the D9 write fixture is reset with org = QA Shared only (QA Secondary is fixed by this file)';
end $$;
\endif
select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \gset
\if :qa_run_id_wellformed
\else
do $$ begin
  raise exception 'qa_run_id must be qar_ followed by 12 lowercase hex characters';
end $$;
\endif

\set qa_shared '4acc9386-c485-486f-aa1f-05d83499d142'
\set qa_secondary 'ad53fee2-2570-460f-9300-f0e106c473b6'

begin;

create temporary table d9w_target on commit drop as
select d.id, d.org_id, d.bucket, d.storage_path, d.legal_hold, d.retention_until,
       coalesce(substring(coalesce(d.title, '') || ' ' || coalesce(d.original_filename, '') || ' ' || coalesce(d.storage_path, '')
                          from 'qa-d9w-(qar_[0-9a-f]{12})'),
                d.metadata->>'qa_run_id') as run_id
  from public.documents d
 where d.org_id in (:'qa_shared'::uuid, :'qa_secondary'::uuid)
   and (d.title ilike '%qa-d9w-%' or d.original_filename ilike '%qa-d9w-%' or d.storage_path ilike '%qa-d9w-%'
        or d.metadata->>'source' = 'api_v1_upload');

-- Security stop: D9 write material outside the QA orgs is reported by the census, never cleaned here.
select exists (
    select 1 from public.documents d
     where d.org_id not in (:'qa_shared'::uuid, :'qa_secondary'::uuid)
       and (d.title ilike '%qa-d9w-%' or d.original_filename ilike '%qa-d9w-%' or d.storage_path ilike '%qa-d9w-%')
  ) or exists (
    select 1 from storage.objects so
     where so.name ilike '%qa-d9w-%'
       and so.name not like :'qa_shared' || '/%' and so.name not like :'qa_secondary' || '/%'
  ) as foreign_residue \gset
\if :foreign_residue
do $$ begin
  raise exception 'qa-d9w- material exists outside QA Shared / QA Secondary; refusing (security stop: report, do not clean)';
end $$;
\endif

select exists (
    select 1 from d9w_target t
     where t.legal_hold is true or (t.retention_until is not null and t.retention_until > now())
  ) as target_retained \gset
\if :target_retained
do $$ begin
  raise exception 'a D9 write document is under legal hold or retention; refusing';
end $$;
\endif

select exists (
    select 1 from (
        select t.org_id, t.bucket, t.storage_path from d9w_target t where t.storage_path is not null
        union all
        select v.org_id, v.bucket, v.storage_path from public.document_versions v join d9w_target t on t.id = v.document_id
         where v.storage_path is not null
    ) p
     where coalesce(p.bucket, '') <> 'org_documents' or p.storage_path not like p.org_id::text || '/%'
  ) as target_path_outside \gset
\if :target_path_outside
do $$ begin
  raise exception 'a D9 write document stores a file outside org_documents or outside its own organization; refusing';
end $$;
\endif

select exists (select 1 from public.communication_message_attachments a join d9w_target t on t.id = a.document_id)
    or exists (select 1 from public.staff_qualification_evidence e join d9w_target t on t.id = e.document_id) as target_linked \gset
\if :target_linked
do $$ begin
  raise exception 'a D9 write document is linked to an inbound message or staff qualification evidence; refusing';
end $$;
\endif

-- The objects the runner removes after commit: every stored file of the target documents, plus any D9 write object left
-- without a row (the census's object predicate, inside the two QA org prefixes only).
create temporary table d9w_objects on commit drop as
select distinct o.bucket, o.storage_path
  from (
    select t.bucket, t.storage_path from d9w_target t where t.storage_path is not null
    union all
    select v.bucket, v.storage_path from public.document_versions v join d9w_target t on t.id = v.document_id
     where v.storage_path is not null
    union all
    select so.bucket_id, so.name from storage.objects so
     where so.bucket_id = 'org_documents'
       and (so.name like :'qa_shared' || '/%' or so.name like :'qa_secondary' || '/%')
       and (so.name ilike '%qa-d9w-%'
            or so.name like :'qa_shared' || '/api_uploads/%' or so.name like :'qa_secondary' || '/api_uploads/%'
            or so.name like :'qa_shared' || '/filed/d9000000-%' or so.name like :'qa_secondary' || '/filed/d9000000-%')
  ) o;

select count(*) as n_versions from public.document_versions v join d9w_target t on t.id = v.document_id \gset
select coalesce(string_agg(distinct t.run_id, ',' order by t.run_id), '') as removed_run_ids from d9w_target t where t.run_id is not null \gset

delete from public.processing_cases pc
 where pc.org_id in (:'qa_shared'::uuid, :'qa_secondary'::uuid)
   and (pc.id in (select s.processing_case_id from public.processing_case_sources s join d9w_target t
                    on t.id = s.source_id and t.org_id = s.org_id
                   where s.source_kind in ('upload', 'document', 'recreated_document', 'email_attachment'))
        or pc.metadata->'api_upload_escalation' is not null
        or pc.metadata->>'source_document_filename' ilike '%qa-d9w-%'
        or pc.metadata->>'source_document_display_name' ilike '%qa-d9w-%');
\set n_cases :ROW_COUNT

delete from public.documents d using d9w_target t where d.id = t.id and d.org_id = t.org_id;
\set n_documents :ROW_COUNT

-- Zero row residue, measured inside the same transaction, in every organization (the census's predicates).
select ((select count(*) from public.documents d
          where d.title ilike '%qa-d9w-%' or d.original_filename ilike '%qa-d9w-%' or d.storage_path ilike '%qa-d9w-%'
             or (d.org_id in (:'qa_shared'::uuid, :'qa_secondary'::uuid) and d.metadata->>'source' = 'api_v1_upload'))
      + (select count(*) from public.processing_cases pc
          where pc.org_id in (:'qa_shared'::uuid, :'qa_secondary'::uuid)
            and (pc.metadata->'api_upload_escalation' is not null
                 or pc.metadata->>'source_document_filename' ilike '%qa-d9w-%'
                 or pc.metadata->>'source_document_display_name' ilike '%qa-d9w-%'))
      + (select count(*) from public.processing_case_sources s join d9w_target t on t.id = s.source_id)
      + (select count(*) from public.document_versions v join d9w_target t on t.id = v.document_id)) as row_residue \gset
select (:row_residue = 0) as rows_zero \gset
\if :rows_zero
\else
do $$ begin
  raise exception 'D9 write row residue remains after the reset; rolled back';
end $$;
\endif

select coalesce(json_agg(json_build_object('bucket', o.bucket, 'path', o.storage_path) order by o.storage_path), '[]'::json)::text
       as objects_json from d9w_objects o \gset

commit;

select json_build_object(
    'd9_write_fixture_reset_counts', json_build_object(
        'qa_run_id', :'qa_run_id',
        'removed_run_ids', :'removed_run_ids',
        'documents', :n_documents,
        'document_versions', :n_versions,
        'processing_cases', :n_cases,
        'residue', :row_residue,
        'objects_to_remove', :'objects_json'::json,
        'audit_rows', 0
    )
)::text as d9_write_fixture_reset_result;
