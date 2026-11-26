-- Documents authz_q1 — department-linked SUBJECT fixture RESET (G1, contract Revision 2 §5–§6).
-- Deletes the aa000000- subject fixtures in a registered QA org: opportunities, then work units, then the
-- fixture department (QA Secondary only). Never touches the permanent QA structure (QA D1 / QA D2).
-- Runner owns :org and :qa_run_id. Access revocation is Vacilando's qa_run_close.
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

-- Whitelist registered QA orgs only. Evaluated outside dollar quotes, where psql interpolates variables.
select (:'org' in (
    '4acc9386-c485-486f-aa1f-05d83499d142',
    'ad53fee2-2570-460f-9300-f0e106c473b6'
  )) as qa_org_registered \gset
\if :qa_org_registered
\else
do $$ begin
  raise exception 'organization is not a registered QA org';
end $$;
\endif

-- Documents attached to a subject must already be gone: SQL could delete their rows but never their
-- storage objects. They leave through the audited document delete (DELETE /api/admin/pos/documents/[id]).
select exists (
    select 1 from public.documents d
     where d.org_id = :'org'::uuid
       and d.entity_id::text like 'aa000000-%'
  ) as subject_documents_remaining \gset
\if :subject_documents_remaining
do $$ begin
  raise exception 'documents are still attached to QA fixture subjects; delete them through the audited document delete first';
end $$;
\endif

delete from public.opportunities
 where org_id = :'org'::uuid
   and id::text like 'aa000000-%';
delete from public.work_units
 where org_id = :'org'::uuid
   and id::text like 'aa000000-%';
delete from public.departments
 where org_id = :'org'::uuid
   and id::text like 'aa000000-%';
