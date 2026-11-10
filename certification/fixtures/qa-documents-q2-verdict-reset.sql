-- Documents Q2 — TEST-ONLY malware-verdict fixture RESET (QA Shared only; proposed registered reconciliation
-- qa_documents_q2_verdict_fixture_reset; plan certification/documents-v1/finish/Q2-VERDICT-FIXTURE-PLAN.md).
--
-- Removes the ae000000- documents seeded by qa-documents-q2-verdict-ensure.sql for THIS QA run. Their versions,
-- primary subjects and verdict rows go with them by ON DELETE CASCADE (the verdict store refuses UPDATE, never the
-- cascade). No storage object exists for these documents. The fixture's document_malware_verdict_recorded audit rows
-- and any product audit the hosted run wrote (document_released …) stay as retained history, tagged by payload.
-- Then asserts, in the same transaction, that no ae000000- document, version, subject or verdict remains.
-- Refuses, changing nothing, when: the org is not QA Shared; the run id is malformed; an ae000000- row belongs to
-- another QA run or another organization.
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
do $$ begin raise exception 'the Q2 verdict fixture is reset in QA Shared only'; end $$;
\endif
select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \gset
\if :qa_run_id_wellformed
\else
do $$ begin raise exception 'qa_run_id must be qar_ followed by 12 lowercase hex characters'; end $$;
\endif
select exists (select 1 from public.documents where id::text like 'ae000000-%' and org_id <> :'org'::uuid) as q2_foreign_org \gset
\if :q2_foreign_org
do $$ begin raise exception 'a Q2 fixture id exists in another organization; refusing'; end $$;
\endif
select exists (select 1 from public.documents where id::text like 'ae000000-%' and org_id = :'org'::uuid
                and coalesce(metadata->>'qa_run_id', '') <> :'qa_run_id') as q2_other_run \gset
\if :q2_other_run
do $$ begin raise exception 'Q2 fixture rows belong to another QA run (or are not fixture rows); refusing'; end $$;
\endif

begin;

select count(*) as removed_documents from public.documents
 where id::text like 'ae000000-%' and org_id = :'org'::uuid and metadata->>'qa_run_id' = :'qa_run_id' \gset
select count(*) as removed_verdicts from public.document_malware_verdicts
 where document_id::text like 'ae000000-%' and org_id = :'org'::uuid \gset

delete from public.documents
 where id::text like 'ae000000-%' and org_id = :'org'::uuid and metadata->>'qa_run_id' = :'qa_run_id';

select (
      (select count(*) from public.documents where id::text like 'ae000000-%')
    + (select count(*) from public.document_versions where document_id::text like 'ae000000-%')
    + (select count(*) from public.document_subjects where document_id::text like 'ae000000-%')
    + (select count(*) from public.document_malware_verdicts where document_id::text like 'ae000000-%')
) as residue \gset
select (:residue = 0) as q2_empty \gset
\if :q2_empty
\else
do $$ begin raise exception 'Q2 fixture residue remains after the reset'; end $$;
\endif

commit;

select json_build_object(
    'q2_verdict_reset_counts', json_build_object(
        'qa_run_id', :'qa_run_id',
        'documents', :removed_documents,
        'verdicts', :removed_verdicts,
        'residue', :residue
    )
)::text as q2_verdict_reset_result;
