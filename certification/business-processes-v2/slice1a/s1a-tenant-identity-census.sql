-- BP V2 Slice 1A — which staging orgs exist, and which org(s) the deployed QA browser identity
-- (qa-slot1-product@example.com, the registered alloy_staging_web identity) can enter.
-- Read only. Emits org names/slugs, counts, and QA machine-identity rows only; no customer person data.
-- One statement, one row: question_id | kind | payload(json).
with qa as (
    select u.id as user_id, u.email
    from auth.users u
    where u.email like 'qa-%@example.com' or u.email like '%+qa%@%' or u.email like 'cert-%@example.com'
),
org_rows as (
    select o.id, o.name, o.slug, o.status, o.created_at,
           (select count(*) from public.departments d where d.org_id = o.id) as departments,
           (select count(*) from public.departments d where d.org_id = o.id and d.metadata ? 'lifecycle_builder_v1') as builder_departments,
           (select count(*) from public.user_roles r where r.org_id = o.id) as user_roles,
           (select count(*) from public.opportunities op where op.org_id = o.id) as opportunities,
           (select count(*) from public.customers c where c.org_id = o.id) as customers,
           (select count(*) from public.locations l where l.org_id = o.id and l.customer_id is null) as org_locations
    from public.orgs o
)
select
    'bp_v2_s1a_tenant_identity' as question_id,
    'row' as kind,
    json_build_object(
        'orgs', coalesce((select json_agg(row_to_json(org_rows) order by created_at) from org_rows), '[]'::json),
        'qa_identities', coalesce((select json_agg(json_build_object(
            'email', qa.email,
            'roles', (select json_agg(json_build_object('org_id', r.org_id, 'role', r.role)) from public.user_roles r where r.user_id = qa.user_id),
            'access_profiles', (select json_agg(json_build_object('org_id', p.org_id, 'department_scope', p.department_scope, 'site_scope', p.site_scope)) from public.user_access_profiles p where p.user_id = qa.user_id),
            'department_access', (select json_agg(json_build_object('org_id', a.org_id, 'department_id', a.department_id)) from public.user_department_access a where a.user_id = qa.user_id),
            'site_access', (select json_agg(json_build_object('org_id', a.org_id, 'location_id', a.location_id)) from public.user_site_access a where a.user_id = qa.user_id)
        ) order by qa.email) from qa), '[]'::json)
    )::text as payload;
