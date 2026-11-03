-- Documents D9.1 hosted HTTP proof — subject fixture RESET (pairs with qa-d9-external-fixture-ensure.sql).
-- PREPARED, NOT RUN, NOT REGISTERED. Intended as `qa_d9_external_fixture_reset` (handoff H2). Removes ONLY rows whose id
-- starts with d9000000- in the named QA organization, after the tagged documents were deleted through the audited
-- document delete (it refuses otherwise). Prints `reset namespace=qa-d9-external removed=<n>`.

\if :{?org}
\else
do $$ begin raise exception 'this fixture is applied to a governed organization: psql -v org=<uuid>'; end $$;
\endif

select (:'org' in ('4acc9386-c485-486f-aa1f-05d83499d142', 'ad53fee2-2570-460f-9300-f0e106c473b6')) as is_qa_org \gset
\if :is_qa_org
\else
do $$ begin raise exception 'the D9 external fixture lives in QA Shared or QA Secondary only'; end $$;
\endif

select exists (select 1 from public.documents d where d.org_id = :'org'::uuid and d.entity_id::text like 'd9000000-%')
    as subject_documents_remaining \gset
\if :subject_documents_remaining
do $$ begin raise exception 'documents are still attached to D9 fixture subjects; delete them through the audited document delete first'; end $$;
\endif

with a as (delete from public.child_enrollment_agreements where org_id = :'org'::uuid and id::text like 'd9000000-%' returning 1),
     r as (delete from public.person_child_relationships where org_id = :'org'::uuid and id::text like 'd9000000-%' returning 1),
     p as (delete from public.customer_persons where org_id = :'org'::uuid and customer_id::text like 'd9000000-%' returning 1)
select (select count(*) from a) + (select count(*) from r) + (select count(*) from p) as removed_links \gset

with m as (delete from public.customer_members where org_id = :'org'::uuid and id::text like 'd9000000-%' returning 1),
     s as (delete from public.persons where org_id = :'org'::uuid and id::text like 'd9000000-%' returning 1)
select (select count(*) from m) + (select count(*) from s) as removed_people \gset

with c as (delete from public.customers where org_id = :'org'::uuid and id::text like 'd9000000-%' returning 1)
select count(*) as removed_households from c \gset

select 'reset namespace=qa-d9-external removed=' || (:removed_links + :removed_people + :removed_households) as result;
