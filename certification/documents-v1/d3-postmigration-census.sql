-- Documents D3 — post-migration census of the deployed primary. READ-ONLY. Aggregates only.
-- Ledger; the starter vocabulary in every organization; valid published versions; the medical floor; the two
-- sensitive-read keys on admin roles only (and in the new-org seed's admin region only); no document reclassified;
-- client roles reach no D3 table.
-- One statement; question_id | row_kind | payload(json).
select question_id, 'data' as row_kind, payload
from (
    select 'c00_ledger'::text as question_id,
           json_build_object('measured_at', now(),
               'ledger', (select json_agg(version order by version) from supabase_migrations.schema_migrations where version in ('20261209090000', '20261209090100')),
               'tables', (select count(*) from pg_class where oid in (to_regclass('public.document_categories'), to_regclass('public.document_types'), to_regclass('public.document_type_versions'))),
               'client_privilege_on_d3', (select count(*) from (values ('anon'), ('authenticated')) r(role)
                    where has_table_privilege(r.role, 'public.document_categories', 'SELECT,INSERT,UPDATE,DELETE')
                       or has_table_privilege(r.role, 'public.document_types', 'SELECT,INSERT,UPDATE,DELETE')
                       or has_table_privilege(r.role, 'public.document_type_versions', 'SELECT,INSERT,UPDATE,DELETE')))::text as payload
    union all
    select 'c01_vocabulary',
           json_build_object('orgs', (select count(*) from public.orgs),
               'orgs_with_full_starter', (select count(*) from public.orgs o
                    where (select count(*) from public.document_categories c where c.org_id = o.id and c.seeded) >= 10
                      and (select count(*) from public.document_types t where t.org_id = o.id and t.seeded) >= 13),
               'categories', (select count(*) from public.document_categories),
               'types', (select count(*) from public.document_types),
               'versions_by_status', (select json_object_agg(status, n) from (select status, count(*) n from public.document_type_versions group by status) s),
               'types_without_valid_published', (select count(*) from public.document_types t
                    where t.published_version_id is null
                       or jsonb_array_length(public.document_type_version_problems(t.published_version_id)) > 0),
               'medical_types_not_medical', (select count(*) from public.document_types t join public.document_type_versions v on v.id = t.published_version_id
                    where t.key = any (public.document_medical_type_keys()) and v.default_sensitivity <> 'medical'))::text
    union all
    select 'c02_capabilities',
           json_build_object(
               'catalogued', (select count(*) from public.permission_definitions where key in ('documents.identity.read', 'documents.restricted.read') and is_active),
               'admin_roles', (select count(*) from public.role_definitions where role_key = 'admin' and is_active),
               'admin_grants', (select count(*) from public.role_permission_grants g join public.role_definitions rd on rd.org_id = g.org_id and rd.role_key = g.role_key
                    where rd.role_key = 'admin' and rd.is_active and g.allowed and g.permission_key in ('documents.identity.read', 'documents.restricted.read')),
               'non_admin_grants', (select count(*) from public.role_permission_grants where permission_key in ('documents.identity.read', 'documents.restricted.read') and allowed and role_key <> 'admin'),
               'seed_admin_region_has_keys', (select strpos(substr(f, strpos(f, 'W12:ADMIN-GRANTS:BEGIN'), strpos(f, 'W12:ADMIN-GRANTS:END') - strpos(f, 'W12:ADMIN-GRANTS:BEGIN')), '''documents.restricted.read''') > 0
                    from (select pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) f) x),
               'seed_ops_region_has_keys', (select strpos(substr(f, strpos(f, 'W12:OPS-GRANTS:BEGIN'), strpos(f, 'W12:OPS-GRANTS:END') - strpos(f, 'W12:OPS-GRANTS:BEGIN')), '''documents.restricted.read''') > 0
                    from (select pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure) f) x),
               'new_org_triggers', (select count(*) from pg_trigger where tgrelid = 'public.orgs'::regclass and tgname in ('orgs_seed_default_rbac', 'orgs_seed_document_configuration') and not tgisinternal))::text
    union all
    select 'c03_documents',
           json_build_object('documents', (select count(*) from public.documents),
               'by_sensitivity', (select json_object_agg(sensitivity, n) from (select sensitivity, count(*) n from public.documents group by sensitivity) s),
               'medical_type_declared_standard', (select count(*) from public.documents where sensitivity = 'standard' and doc_type = any (public.document_medical_type_keys())),
               'doc_types_registered', (select count(distinct d.doc_type) from public.documents d where exists (select 1 from public.document_types t where t.org_id = d.org_id and t.key = d.doc_type)),
               'doc_types_unregistered', (select json_agg(x) from (select coalesce(d.doc_type, '<null>') as x, count(*) n from public.documents d
                    where not exists (select 1 from public.document_types t where t.org_id = d.org_id and t.key = d.doc_type) group by 1 order by 1) u))::text
) census
order by question_id, payload
