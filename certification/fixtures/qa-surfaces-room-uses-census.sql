-- Surfaces c4 (OPWORK_FAACCA6079AD_SPRINT_6E76007E732B) — run-owned room-Uses fixture CENSUS (QA Shared only, read only).
-- The isolated executor's census contract: ONE line `census count=<n>`, where n is the fixture residue in QA Shared —
-- every ac000000- row in the two fixture tables plus every assignment that references either fixture row.
-- 2 after ensure (the category and the room, no assignment); 0 after reset. Runs in a READ ONLY transaction.
-- Runner owns :org. NOT REGISTERED in the installed toolkit: the executor issues no authority for it yet.
set transaction read only;
\if :{?org}
\else
do $$ begin
  raise exception 'this census is read in a governed organization: psql -v org=<uuid>.';
end $$;
\endif
select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as is_qa_shared \gset
\if :is_qa_shared
\else
do $$ begin
  raise exception 'the Surfaces room-Uses census is read in QA Shared only';
end $$;
\endif

select 'census count=' || (
    (select count(*) from public.locations l
      where l.org_id = :'org'::uuid and l.id::text like 'ac000000-%')
  + (select count(*) from public.operational_assignment_types t
      where t.org_id = :'org'::uuid and t.id::text like 'ac000000-%')
  + (select count(*) from public.schedule_assignments sa
      where sa.org_id = :'org'::uuid
        and (sa.room_location_id = 'ac000000-0000-4000-8000-000000000311'::uuid
             or sa.operational_assignment_type_id = 'ac000000-0000-4000-8000-000000000301'::uuid))
  )::text as census;
