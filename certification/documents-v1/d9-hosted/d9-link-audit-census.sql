-- Documents D9-H1, plan case 11 ("link audited before minting"): read-only census of the D9 download-link audit.
-- Plan: certification/documents-v1/D9-1-HOSTED-QA-PLAN.md §4 case 11. Run order: D9-H1-HOSTED-RUN-ORDER.md step 6.
-- Not the registered residue census (d9-residue-census.sql e7e8d3d1…) and never attached to a close: a generic
-- database.read_census (alloy_deployed_primary) read once, after `certify` and before the first qa_run_close. Audit rows
-- are retained by design and nothing here joins documents, so it reads the same before or after `cleanup`.
--   CHECKS (true for every D9 read run, so a later run cannot turn them false):
--     d9_l11_link_rows_present       at least one document_link_issued names a D9 read-cert installation (case 10 ran)
--     d9_l11_attribution_complete    every D9 link row names an application, installation and credential, the credential
--                                    belongs to that installation, the installation to that application and to the
--                                    event's organization
--     d9_l11_no_scope_cert_links     no link row from d9-documents-scope-cert (T_L is never asked; T_N is refused 403)
--     d9_l11_no_secondary_links      no D9 link row in qa_secondary (T_B's link call is a cross-org 404)
--   DATA d9_l11_rows: one entry per D9 link row (ids and timestamps only). Case 11's run-scoped verdict joins these
--     with the driver's receipts as D9-H1-HOSTED-RUN-ORDER.md §3 specifies.
-- Selects only by event type, the two QA org ids and the D9 application slugs. No PII column; no secret or hash column.
with apps as (
    select a.id, a.slug from public.developer_applications a
     where a.slug in ('d9-documents-read-cert', 'd9-documents-scope-cert')
),
links as (
    select we.id, we.org_id, we.entity_id, we.created_at,
           we.payload->>'actor_application_id' as application_id,
           we.payload->>'actor_installation_id' as installation_id,
           we.payload->>'actor_credential_id' as credential_id,
           apps.slug
      from public.workflow_events we
      join apps on apps.id::text = we.payload->>'actor_application_id'
     where we.event_type = 'document_link_issued'
       and we.org_id in ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid)
)
select question_id, kind, payload
from (
    select 'd9_l11_link_rows_present'::text as question_id, 'check'::text as kind,
           'workflow_events ~ d9_read_cert_document_link_issued ~ at_least_one ~ '
           || ((select count(*) from links where slug = 'd9-documents-read-cert') >= 1)::text as payload,
           '01'::text as sort_key
    union all
    select 'd9_l11_attribution_complete', 'check',
           'workflow_events ~ d9_link_rows_misattributed ~ zero ~ '
           || ((select count(*) from links l
                 where l.installation_id is null or l.credential_id is null
                    or not exists (select 1 from public.app_installations i
                                     join public.app_credentials c on c.installation_id = i.id
                                    where i.id::text = l.installation_id
                                      and c.id::text = l.credential_id
                                      and i.application_id::text = l.application_id
                                      and i.org_id = l.org_id)) = 0)::text,
           '02'
    union all
    select 'd9_l11_no_scope_cert_links', 'check',
           'workflow_events ~ d9_scope_cert_document_link_issued ~ zero ~ '
           || ((select count(*) from links where slug = 'd9-documents-scope-cert') = 0)::text,
           '03'
    union all
    select 'd9_l11_no_secondary_links', 'check',
           'workflow_events ~ d9_document_link_issued_in_qa_secondary ~ zero ~ '
           || ((select count(*) from links where org_id = 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) = 0)::text,
           '04'
    union all
    select 'd9_l11_rows', 'data',
           coalesce((select json_agg(json_build_object(
                                'event_id', l.id,
                                'created_at', l.created_at,
                                'document_id', l.entity_id,
                                'org', case when l.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid then 'qa_shared' else 'qa_secondary' end,
                                'application', l.slug,
                                'installation_id', l.installation_id,
                                'credential_id', l.credential_id
                            ) order by l.created_at, l.id)
                       from links l), '[]'::json)::text,
           '05'
) q
order by sort_key;
