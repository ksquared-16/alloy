-- Documents Q2 — TEST-ONLY malware-verdict fixture ENSURE (QA Shared only; proposed registered reconciliation
-- qa_documents_q2_verdict_fixture_ensure; plan certification/documents-v1/finish/Q2-VERDICT-FIXTURE-PLAN.md).
--
-- Seeds the states no product route can create while the scanner is off, so the hosted Q2 driver can exercise the
-- staff release and restore guards (POST /api/admin/documents/[id]/screening, /restore):
--   ae000000-…-0001  quarantined, current version INFECTED     → release refused 409 MALWARE_UNSAFE
--   ae000000-…-0002  quarantined, current version SUSPICIOUS   → release refused 409 MALWARE_UNSAFE
--   ae000000-…-0003  quarantined, held awaiting a verdict      → release refused 409 MALWARE_SCAN_PENDING
--   ae000000-…-0004  archived (was uploaded), version INFECTED → restore refused
--   ae000000-…-0005  quarantined, current version CLEAN        → release allowed (control)
-- Verdicts go through the DEPLOYED writer public.record_document_malware_verdict, after the audit row it requires
-- (document_malware_verdict_recorded, actor system / malware_scan_worker). No role, login or credential is created or
-- used beyond the trusted host's registered-fixture runner, and nothing enables a scanner. The audit rows say what they
-- are (payload.fixture = 'qa_documents_q2_verdict_fixture', payload.qa_run_id) and stay as retained history.
-- Owner subject: the registered authz subject OPP1 (aa000000-…-111, QA D1), which qa_authz_subject_fixture_ensure must
-- have seeded. No storage object: both routes refuse before any byte is read.
--
-- Namespace ae000000- is reserved to this fixture (aa000000- authz subjects, ab000000- D4, ac000000- R5 are distinct).
-- Refuses, changing nothing, when: the org is not QA Shared; the run id is missing or malformed; OPP1 is missing; an
-- ae000000- row exists in another organization or belongs to another QA run (reset first: one run at a time).
-- One transaction (psql ON_ERROR_STOP): a refusal or failure part-way leaves the database as it was.
-- Never touches: storage, the verdict writer's code, scanner flags, QA structure, QA Secondary or any other org.
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
do $$ begin raise exception 'the Q2 verdict fixture is seeded in QA Shared only'; end $$;
\endif
select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \gset
\if :qa_run_id_wellformed
\else
do $$ begin raise exception 'qa_run_id must be qar_ followed by 12 lowercase hex characters'; end $$;
\endif

\set family 'documents_q2_verdict'
\set opp1 'aa000000-0000-4000-8000-000000000111'
\set d_infected 'ae000000-0000-4000-8000-000000000001'
\set d_suspicious 'ae000000-0000-4000-8000-000000000002'
\set d_pending 'ae000000-0000-4000-8000-000000000003'
\set d_archived 'ae000000-0000-4000-8000-000000000004'
\set d_clean 'ae000000-0000-4000-8000-000000000005'
\set sha 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2'

select not exists (select 1 from public.opportunities where id = :'opp1'::uuid and org_id = :'org'::uuid) as opp1_missing \gset
\if :opp1_missing
do $$ begin raise exception 'OPP1 (qa_authz_subject_fixture_ensure) is missing; seed the authz subjects first'; end $$;
\endif
select exists (select 1 from public.documents where id::text like 'ae000000-%' and org_id <> :'org'::uuid) as q2_foreign_org \gset
\if :q2_foreign_org
do $$ begin raise exception 'a Q2 fixture id exists in another organization; refusing'; end $$;
\endif
select exists (select 1 from public.documents where id::text like 'ae000000-%' and org_id = :'org'::uuid
                and coalesce(metadata->>'qa_run_id', '') <> :'qa_run_id') as q2_other_run \gset
\if :q2_other_run
do $$ begin raise exception 'Q2 fixture rows belong to another QA run (or are not fixture rows); apply qa_documents_q2_verdict_fixture_reset first'; end $$;
\endif
select exists (select 1 from public.documents where id::text like 'ae000000-%' and org_id = :'org'::uuid) as q2_present \gset

begin;

\if :q2_present
-- Re-ensure for the same run: already seeded, nothing to change (the writer is idempotent per key, but rows exist).
\else
insert into public.documents (id, org_id, title, original_filename, mime_type, byte_size, checksum_sha256, bucket, storage_path,
                              status, entity_type, entity_id, metadata)
values
  (:'d_infected'::uuid, :'org'::uuid, 'qa-q2 infected ' || :'qa_run_id', 'qa-q2-infected.pdf', 'application/pdf', 10, :'sha',
   'org_documents', :'org' || '/qa-q2/' || :'qa_run_id' || '/infected.pdf', 'quarantined', 'opportunity', :'opp1'::uuid,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'infected')),
  (:'d_suspicious'::uuid, :'org'::uuid, 'qa-q2 suspicious ' || :'qa_run_id', 'qa-q2-suspicious.pdf', 'application/pdf', 10, :'sha',
   'org_documents', :'org' || '/qa-q2/' || :'qa_run_id' || '/suspicious.pdf', 'quarantined', 'opportunity', :'opp1'::uuid,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'suspicious')),
  (:'d_pending'::uuid, :'org'::uuid, 'qa-q2 pending ' || :'qa_run_id', 'qa-q2-pending.pdf', 'application/pdf', 10, :'sha',
   'org_documents', :'org' || '/qa-q2/' || :'qa_run_id' || '/pending.pdf', 'quarantined', 'opportunity', :'opp1'::uuid,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'pending',
                      'screening', jsonb_build_object('malware_hold', 'awaiting_verdict', 'structural_status', 'uploaded'))),
  (:'d_archived'::uuid, :'org'::uuid, 'qa-q2 archived ' || :'qa_run_id', 'qa-q2-archived.pdf', 'application/pdf', 10, :'sha',
   'org_documents', :'org' || '/qa-q2/' || :'qa_run_id' || '/archived.pdf', 'archived', 'opportunity', :'opp1'::uuid,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'archived',
                      'archive', jsonb_build_object('previous_status', 'uploaded', 'reason', 'QA Q2 fixture'))),
  (:'d_clean'::uuid, :'org'::uuid, 'qa-q2 clean ' || :'qa_run_id', 'qa-q2-clean.pdf', 'application/pdf', 10, :'sha',
   'org_documents', :'org' || '/qa-q2/' || :'qa_run_id' || '/clean.pdf', 'quarantined', 'opportunity', :'opp1'::uuid,
   jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_family', :'family', 'fixture_key', 'clean'));

-- One verdict per document that needs one, each after its own audit row, through the deployed writer.
select current_version_id as v_infected from public.documents where id = :'d_infected'::uuid \gset
select current_version_id as v_suspicious from public.documents where id = :'d_suspicious'::uuid \gset
select current_version_id as v_archived from public.documents where id = :'d_archived'::uuid \gset
select current_version_id as v_clean from public.documents where id = :'d_clean'::uuid \gset

insert into public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
values (:'org'::uuid, 'document_malware_verdict_recorded', 'documents', :'d_infected'::uuid,
        jsonb_build_object('version_id', :'v_infected', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker', 'verdict', 'infected',
                           'fixture', 'qa_documents_q2_verdict_fixture', 'qa_run_id', :'qa_run_id')) returning id as ev_infected \gset
select verdict_id from public.record_document_malware_verdict(:'org'::uuid, :'v_infected'::uuid, :'sha', 'infected', 'qa-fixture', 'q2-fixture-1', 'q2',
    now() - interval '2 hours', now(), 'qa-q2-' || :'qa_run_id', :'ev_infected'::uuid, 'qa-q2-' || :'qa_run_id' || '-infected');

insert into public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
values (:'org'::uuid, 'document_malware_verdict_recorded', 'documents', :'d_suspicious'::uuid,
        jsonb_build_object('version_id', :'v_suspicious', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker', 'verdict', 'suspicious',
                           'fixture', 'qa_documents_q2_verdict_fixture', 'qa_run_id', :'qa_run_id')) returning id as ev_suspicious \gset
select verdict_id from public.record_document_malware_verdict(:'org'::uuid, :'v_suspicious'::uuid, :'sha', 'suspicious', 'qa-fixture', 'q2-fixture-1', 'q2',
    now() - interval '2 hours', now(), 'qa-q2-' || :'qa_run_id', :'ev_suspicious'::uuid, 'qa-q2-' || :'qa_run_id' || '-suspicious');

insert into public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
values (:'org'::uuid, 'document_malware_verdict_recorded', 'documents', :'d_archived'::uuid,
        jsonb_build_object('version_id', :'v_archived', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker', 'verdict', 'infected',
                           'fixture', 'qa_documents_q2_verdict_fixture', 'qa_run_id', :'qa_run_id')) returning id as ev_archived \gset
select verdict_id from public.record_document_malware_verdict(:'org'::uuid, :'v_archived'::uuid, :'sha', 'infected', 'qa-fixture', 'q2-fixture-1', 'q2',
    now() - interval '2 hours', now(), 'qa-q2-' || :'qa_run_id', :'ev_archived'::uuid, 'qa-q2-' || :'qa_run_id' || '-archived');

insert into public.workflow_events (org_id, event_type, entity_type, entity_id, payload)
values (:'org'::uuid, 'document_malware_verdict_recorded', 'documents', :'d_clean'::uuid,
        jsonb_build_object('version_id', :'v_clean', 'actor_kind', 'system', 'actor_process', 'malware_scan_worker', 'verdict', 'clean',
                           'fixture', 'qa_documents_q2_verdict_fixture', 'qa_run_id', :'qa_run_id')) returning id as ev_clean \gset
select verdict_id from public.record_document_malware_verdict(:'org'::uuid, :'v_clean'::uuid, :'sha', 'clean', 'qa-fixture', 'q2-fixture-1', 'q2',
    now() - interval '2 hours', now(), 'qa-q2-' || :'qa_run_id', :'ev_clean'::uuid, 'qa-q2-' || :'qa_run_id' || '-clean');
\endif

-- The seeded states, re-read: anything else fails the transaction.
select (
    (select status from public.documents where id = :'d_infected'::uuid) = 'quarantined'
    and (select status from public.documents where id = :'d_suspicious'::uuid) = 'quarantined'
    and (select status from public.documents where id = :'d_pending'::uuid) = 'quarantined'
    and (select status from public.documents where id = :'d_archived'::uuid) = 'archived'
    and (select status from public.documents where id = :'d_clean'::uuid) = 'quarantined'
    and (select count(*) from public.document_malware_verdicts v
          where v.document_id::text like 'ae000000-%' and v.org_id = :'org'::uuid and v.kind = 'verdict') = 4
) as q2_seeded \gset
\if :q2_seeded
\else
do $$ begin raise exception 'the Q2 fixture states did not read back as seeded'; end $$;
\endif

commit;

select json_build_object(
    'q2_verdict_ensure', json_build_object(
        'qa_run_id', :'qa_run_id',
        'documents', json_build_object('infected', :'d_infected', 'suspicious', :'d_suspicious', 'pending', :'d_pending',
                                       'archived', :'d_archived', 'clean', :'d_clean'),
        'verdicts', 4
    )
)::text as q2_verdict_ensure_result;
