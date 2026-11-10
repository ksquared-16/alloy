-- Documents Q2 TEST-ONLY malware-verdict fixture — read-only residue census (proposed fixture census, attached
-- beside an authz_q1 close the way the R5 shared-child census is; plan
-- certification/documents-v1/finish/Q2-VERDICT-FIXTURE-PLAN.md). A separate file on purpose: the registered 20-check
-- census (documents-zero-residue-census.sql, 7957a51a) keeps its pinned bytes.
-- Every check must answer `~ true` after qa_documents_q2_verdict_fixture_reset. The fixture's audit rows
-- (document_malware_verdict_recorded, payload.fixture = 'qa_documents_q2_verdict_fixture') are retained history,
-- reported as data, never as residue. Selects by the ae000000- namespace and the fixture marker only. No PII.
select question_id, kind, payload
from (
    select 'q2vf_00'::text as question_id, 'data'::text as kind,
           json_build_object('fixture', 'qa_documents_q2_verdict_fixture', 'namespace', 'ae000000-',
                             'qa_shared', '4acc9386-c485-486f-aa1f-05d83499d142', 'cleanup', 'zero_residue')::text as payload,
           '00'::text as sort_key
    union all
    select 'q2vf_documents', 'check',
           'documents ~ ae000000_fixture ~ zero ~ '
           || ((select count(*) from public.documents d where d.id::text like 'ae000000-%') = 0)::text,
           '01'
    union all
    select 'q2vf_versions_subjects', 'check',
           'document_versions_document_subjects ~ ae000000_fixture ~ zero ~ '
           || (((select count(*) from public.document_versions v where v.document_id::text like 'ae000000-%')
              + (select count(*) from public.document_subjects s where s.document_id::text like 'ae000000-%')) = 0)::text,
           '02'
    union all
    select 'q2vf_verdicts', 'check',
           'document_malware_verdicts ~ ae000000_fixture ~ zero ~ '
           || ((select count(*) from public.document_malware_verdicts m where m.document_id::text like 'ae000000-%') = 0)::text,
           '03'
    union all
    select 'q2vf_fixture_audit_outside_qa_shared', 'check',
           'workflow_events ~ q2_fixture_audit_outside_qa_shared ~ zero ~ '
           || ((select count(*) from public.workflow_events we
                 where we.payload->>'fixture' = 'qa_documents_q2_verdict_fixture'
                   and we.org_id <> '4acc9386-c485-486f-aa1f-05d83499d142'::uuid) = 0)::text,
           '04'
    union all
    select 'q2vf_retained_audit', 'data',
           json_build_object(
               'artifact', 'Q2 fixture verdict audit history',
               'status', 'retained_by_design',
               'not_residue', true,
               'fixture_audit_rows', coalesce((
                 select count(*)::int from public.workflow_events we
                  where we.payload->>'fixture' = 'qa_documents_q2_verdict_fixture'
               ), 0)
           )::text,
           '05'
) q
order by sort_key;
