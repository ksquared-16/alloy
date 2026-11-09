-- Documents D9-H2 hosted HTTP proof — AGED API UPLOAD fixture ENSURE (proposed registered reconciliation
-- qa_d9_aged_upload_ensure; plan certification/documents-v1/D9-2-3-HOSTED-QA-PLAN.md §3, case W-ES).
-- PREPARED, NOT RUN, NOT REGISTERED. Draft for Host Capacity's documents_d9_write_v1 plan.
--
-- W-ES needs an /api/v1 upload that completed more than 24 hours ago and was never filed, so the scheduled wake
-- (web/lib/documents/external/unfiledApiUploadEscalation.ts, escalateUnfiledApiUploads) opens its Processing case.
-- A run cannot wait 24 hours, so this inserts ONE documents row in QA Shared shaped like completeDocumentUpload's
-- (web/lib/documents/external/externalDocumentWrites.ts) with created_at 25 hours back:
--   id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket 'org_documents',
--   storage_path '<org>/api_uploads/<id>/<sha256>', status 'uploaded' (decideIngestion's clean status),
--   metadata { screening {engine, verdict 'clean', kind 'pdf', screened_at}, source_format 'pdf',
--              source 'api_v1_upload', received_via {kind 'api_v1', installation_id, application_id, credential_id} }.
-- The D2 insert trigger adds its version 1 row, exactly as it does for the real upload.
-- Differences from a real upload, on purpose:
--   * no upload_audit_event_id: no document_upload_authorized audit is forged for an upload that never happened;
--   * fixture markers metadata.fixture_family / metadata.qa_run_id (removed by qa_d9_write_fixture_reset with the other D9 write rows);
--   * NO STORAGE OBJECT. SQL cannot write bucket bytes. Nothing on the W-ES path reads them: the wake reads only the
--     row (source, filing, received_via, status, created_at) and opens the case; a late new_document filing by T_W
--     copies no object (only new_version filings copy). The plan's "object uploaded by the same reconciliation" is
--     therefore not done, and W-ES must not download, preview or re-version this document.
--
-- received_via must name T_W, because a late filing is accepted only from the installation that received the upload
-- (documentFiling.ts receivedByInstallation). T_W exists only after the driver installs it, and the registered runner
-- passes only :org and :qa_run_id, so T_W is RESOLVED here: the single non-revoked installation of
-- 'd9-documents-write-cert' in QA Shared, and its single active credential. Zero or more than one refuses.
-- So this runs AFTER the driver's install step and BEFORE T_W is revoked (D9-H2-HOSTED-RUN-ORDER.md).
--
-- Namespace: d9000000-0000-4000-8000-0000000003xx is this fixture's (the external fixture uses …01xx / …02xx).
-- Refuses, changing nothing, when: the org is not QA Shared; the run id is missing or malformed; T_W or its credential
-- does not resolve to exactly one row; the aged id exists in another organization; a row with the aged id is not this
-- fixture's (marker); the row belongs to ANOTHER QA run (reset first).
-- Idempotent: the same run finds its row and changes nothing.
-- Never touches: storage, audit tables, processing cases, installations or credentials, the external fixture's rows,
-- or any organization other than QA Shared.
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
  raise exception 'the D9 aged upload fixture is applied with org = QA Shared only';
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
\set write_app 'd9-documents-write-cert'
\set sha 'd0e0e93e2e6206de3bf2b5ff96ed15d1e9a6f15e428386b580b3706f518e665d'

-- T_W: exactly one live installation of the write application in QA Shared, with exactly one active credential.
select count(*) = 1 as tw_one_installation
  from public.app_installations i
  join public.developer_applications a on a.id = i.application_id
 where a.slug = :'write_app' and i.org_id = :'org'::uuid and i.status <> 'revoked' \gset
\if :tw_one_installation
\else
do $$ begin
  raise exception 'T_W does not resolve: QA Shared must hold exactly one live d9-documents-write-cert installation (run the driver install step first)';
end $$;
\endif
select i.id as tw_installation, a.id as tw_application
  from public.app_installations i
  join public.developer_applications a on a.id = i.application_id
 where a.slug = :'write_app' and i.org_id = :'org'::uuid and i.status <> 'revoked' \gset
select count(*) = 1 as tw_one_credential
  from public.app_credentials c
 where c.installation_id = :'tw_installation'::uuid and c.status = 'active' \gset
\if :tw_one_credential
\else
do $$ begin
  raise exception 'T_W must hold exactly one active credential';
end $$;
\endif
select c.id as tw_credential
  from public.app_credentials c
 where c.installation_id = :'tw_installation'::uuid and c.status = 'active' \gset

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
select exists (select 1 from public.documents d where d.id = :'aged'::uuid and coalesce(d.metadata->>'qa_run_id', '') <> :'qa_run_id') as aged_other_run \gset
\if :aged_other_run
do $$ begin
  raise exception 'the D9 aged upload belongs to another QA run; run qa_d9_write_fixture_reset first';
end $$;
\endif

begin;

insert into public.documents (id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket,
                              storage_path, status, created_at, metadata)
select :'aged'::uuid, :'org'::uuid,
       'qa-d9w-' || :'qa_run_id' || '-aged-upload.pdf',
       'qa-d9w-' || :'qa_run_id' || '-aged-upload.pdf',
       'application/pdf', 1024, :'sha', 'org_documents',
       :'org' || '/api_uploads/' || :'aged' || '/' || :'sha',
       'uploaded',
       now() - interval '25 hours',
       jsonb_build_object(
           'screening', jsonb_build_object('engine', 'alloy-structural-screening-v1', 'verdict', 'clean', 'kind', 'pdf',
                                           'screened_at', to_char((now() - interval '25 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
           'source_format', 'pdf',
           'source', 'api_v1_upload',
           'received_via', jsonb_build_object('kind', 'api_v1', 'installation_id', :'tw_installation',
                                              'application_id', :'tw_application', 'credential_id', :'tw_credential'),
           'fixture_family', :'family',
           'qa_run_id', :'qa_run_id')
 where not exists (select 1 from public.documents d where d.id = :'aged'::uuid);
\set n_inserted :ROW_COUNT

commit;

select json_build_object(
    'd9_aged_upload_ensure', json_build_object(
        'qa_run_id', :'qa_run_id',
        'document_id', :'aged',
        'inserted', :n_inserted,
        'created_at', (select d.created_at from public.documents d where d.id = :'aged'::uuid),
        'received_via_installation', :'tw_installation',
        'received_via_credential', :'tw_credential',
        'storage_object', false
    )
)::text as d9_aged_upload_ensure_result;
