-- Documents authz_q1 — vendor / run-scoped fixture RESET (B2).
-- Deletes fixture-owned vendor rows in registered QA orgs for the named qa_run_id,
-- and any aa000000- namespace vendors in those orgs (idempotent recovery).
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

do $$
begin
  if :'org'::uuid not in (
    '4acc9386-c485-486f-aa1f-05d83499d142'::uuid,
    'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid
  ) then
    raise exception 'organization % is not a registered QA org', :'org';
  end if;
end $$;

\set vendor_1 'aa000000-0000-4000-8000-000000000001'
\set vendor_2 'aa000000-0000-4000-8000-000000000002'

-- Run-scoped residue (metadata.qa_run_id) in this org only.
delete from public.vendors
 where org_id = :'org'::uuid
   and external_source = 'alloy_qa_fixture'
   and (
     metadata ->> 'qa_run_id' = :'qa_run_id'
     or id in (:'vendor_1'::uuid, :'vendor_2'::uuid)
   );
