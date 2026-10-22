-- Documents authz_q1 — vendor fixture ENSURE (B2).
-- Structure only: vendors V1/V2 in the registered QA Shared org.
-- Runner owns :org and :qa_run_id. Never assigns them here.
-- Ids use the aa000000- fixture namespace (hosted-fixture-safety).
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

-- Whitelist registered QA orgs only (Firefly and every other tenant are absent from this list).
-- Evaluated OUTSIDE dollar quotes: psql never interpolates the org variable inside a dollar-quoted DO body, so a
-- whitelist written there reaches the server as the literal variable text and fails with a syntax error.
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
select exists (select 1 from public.vendor_statuses where key = 'active') as vendor_status_active \gset
\if :vendor_status_active
\else
do $$ begin
  raise exception 'vendor_statuses has no active row; fixture cannot invent a status id';
end $$;
\endif

\set vendor_1 'aa000000-0000-4000-8000-000000000001'
\set vendor_2 'aa000000-0000-4000-8000-000000000002'

-- Idempotent: remove prior fixture-owned vendor rows for THIS run namespace first.
delete from public.vendors
 where org_id = :'org'::uuid
   and id in (:'vendor_1'::uuid, :'vendor_2'::uuid);

-- vendor_status_id is NOT NULL; resolve the global "active" status (never invent an id).
insert into public.vendors (
  id, org_id, name, status, status_key, vendor_status_id,
  external_source, external_id, metadata
)
select
  v.id,
  :'org'::uuid,
  v.name,
  vs.key,
  vs.key,
  vs.id,
  'alloy_qa_fixture',
  v.external_id,
  jsonb_build_object('qa_run_id', :'qa_run_id', 'fixture_key', v.fixture_key)
from (
  values
    (:'vendor_1'::uuid, 'QA Vendor V1', 'qa_authz_v1', 'v1'),
    (:'vendor_2'::uuid, 'QA Vendor V2', 'qa_authz_v2', 'v2')
) as v(id, name, external_id, fixture_key)
cross join lateral (
  select id, key from public.vendor_statuses where key = 'active' limit 1
) vs;
