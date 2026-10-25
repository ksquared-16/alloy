-- Documents V1 D4 — household library SUBJECT fixture RESET (QA Shared only). Removes every ab000000- fixture row.
-- Documents attached to a subject must already be gone: SQL could delete their rows but never their storage objects.
-- They leave through the audited document delete (DELETE /api/admin/pos/documents/[id]).
\if :{?org}
\else
do $$ begin
  raise exception 'this fixture is applied to a governed organization: psql -v org=<uuid>.';
end $$;
\endif
\if :{?qa_run_id}
\else
do $$ begin
  raise exception 'this fixture requires psql -v qa_run_id=<qar_…>.';
end $$;
\endif
select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as is_qa_shared \gset
\if :is_qa_shared
\else
do $$ begin
  raise exception 'the household library fixture is reset in QA Shared only';
end $$;
\endif

select exists (
    select 1 from public.documents d
     where d.org_id = :'org'::uuid
       and d.entity_id::text like 'ab000000-%'
  ) as subject_documents_remaining \gset
\if :subject_documents_remaining
do $$ begin
  raise exception 'documents are still attached to household fixture subjects; delete them through the audited document delete first';
end $$;
\endif

delete from public.customer_persons where org_id = :'org'::uuid and customer_id::text like 'ab000000-%';
delete from public.customer_members where org_id = :'org'::uuid and id::text like 'ab000000-%';
delete from public.opportunities where org_id = :'org'::uuid and id::text like 'ab000000-%';
delete from public.work_units where org_id = :'org'::uuid and id::text like 'ab000000-%';
delete from public.persons where org_id = :'org'::uuid and id::text like 'ab000000-%';
delete from public.customers where org_id = :'org'::uuid and id::text like 'ab000000-%';
