-- ENROLLMENT RECORD AUTHORITY V1 — SLICE 1: independent effect proof of 20260916050000
-- on the deployed database.
--
-- The apply returned ok=true / ledger="applied". That is its own success label, and a label is not
-- evidence: a migration that catalogued the keys but never reached the backfill would report the
-- same thing, and so would one that granted them to every role in the tenant.
--
-- So every claim Slice 1 makes is measured here, in BOTH directions — what must be present, and
-- what must be absent. The absences are the half most likely to rot: the Slice-2 delete key, the
-- configuration key the Director ruled out, and any role outside admin/ops holding either capability.
--
-- Output contract: question_id | kind | payload.
select question_id, kind, payload from (

    -- e1: THE TWO KEYS EXIST, EXACTLY ONCE EACH, ACTIVE, AND FILED UNDER ENROLLMENT.
    select 'e1_catalog'::text as question_id, 'record_manage_rows'::text as kind,
           count(*)::text as payload, '1a'::text as sort_key
      from public.permission_definitions where key = 'enrollment.record.manage'
    union all select 'e1_catalog','decide_rows', count(*)::text,'1b'
      from public.permission_definitions where key = 'enrollment.decide'
    union all select 'e1_catalog','both_active_and_grouped_enrollment', count(*)::text,'1c'
      from public.permission_definitions
     where key in ('enrollment.record.manage','enrollment.decide')
       and is_active and group_key = 'enrollment'

    -- e2: THE EXCLUSIONS. Slice 2's key and the key the Director ruled out must not exist at all.
    union all select 'e2_exclusions','record_delete_key_rows', count(*)::text,'2a'
      from public.permission_definitions where key = 'enrollment.record.delete'
    union all select 'e2_exclusions','enrollment_configure_key_rows', count(*)::text,'2b'
      from public.permission_definitions where key = 'enrollment.configure'
    union all select 'e2_exclusions','any_grant_of_either_excluded_key', count(*)::text,'2c'
      from public.role_permission_grants
     where permission_key in ('enrollment.record.delete','enrollment.configure')

    -- e3: THE APPROVED PACKAGE. Admin and ops each hold BOTH, in every organization that has the role.
    union all select 'e3_package','orgs_total', count(*)::text,'3a' from public.orgs
    union all select 'e3_package','admin_roles_active', count(*)::text,'3b'
      from public.role_definitions where role_key='admin' and is_active
    union all select 'e3_package','ops_roles_active', count(*)::text,'3c'
      from public.role_definitions where role_key='ops' and is_active
    union all select 'e3_package','admin_grants_expect_2x_admin_roles', count(*)::text,'3d'
      from public.role_definitions rd
      join public.role_permission_grants g
        on g.org_id=rd.org_id and g.role_key=rd.role_key and g.allowed
     where rd.role_key='admin' and rd.is_active
       and g.permission_key in ('enrollment.record.manage','enrollment.decide')
    union all select 'e3_package','ops_grants_expect_2x_ops_roles', count(*)::text,'3e'
      from public.role_definitions rd
      join public.role_permission_grants g
        on g.org_id=rd.org_id and g.role_key=rd.role_key and g.allowed
     where rd.role_key='ops' and rd.is_active
       and g.permission_key in ('enrollment.record.manage','enrollment.decide')

    -- e4: NO ONE ELSE. D3 — a custom role receives nothing, and no system role was inferred from a
    -- label. This is the assertion that would catch a backfill written against role NAMES.
    union all select 'e4_no_other_roles','roles_outside_admin_ops_holding_either', count(*)::text,'4a'
      from public.role_permission_grants
     where permission_key in ('enrollment.record.manage','enrollment.decide')
       and allowed and role_key not in ('admin','ops')
    union all select 'e4_no_other_roles','distinct_role_keys_holding_either', count(distinct role_key)::text,'4b'
      from public.role_permission_grants
     where permission_key in ('enrollment.record.manage','enrollment.decide') and allowed
    union all select 'e4_no_other_roles','school_director_or_regional_lead_holding_either', count(*)::text,'4c'
      from public.role_permission_grants
     where permission_key in ('enrollment.record.manage','enrollment.decide')
       and allowed and role_key in ('school_director','regional_lead')

    -- e5: NO DUPLICATES. The grant table is keyed, so a duplicate would be a constraint failure —
    -- assert the key still holds rather than trusting that it does.
    union all select 'e5_duplicates','duplicate_grant_rows', count(*)::text,'5a'
      from (select org_id, role_key, permission_key
              from public.role_permission_grants
             where permission_key in ('enrollment.record.manage','enrollment.decide')
             group by 1,2,3 having count(*) > 1) dupes

    -- e6: THE NEW-ORG SEED. The function a NEW tenant is born from must name both keys in both
    -- regions, and must NOT name the Slice-2 key anywhere.
    union all select 'e6_new_org_seed','admin_region_names_both', (
        select count(*) from unnest(array['enrollment.record.manage','enrollment.decide']) k
         where strpos(
                 substr(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                        strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),'W12:ADMIN-GRANTS:BEGIN'),
                        strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),'W12:ADMIN-GRANTS:END')
                          - strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),'W12:ADMIN-GRANTS:BEGIN')),
                 '''' || k || '''') > 0)::text,'6a'
    union all select 'e6_new_org_seed','ops_region_names_both', (
        select count(*) from unnest(array['enrollment.record.manage','enrollment.decide']) k
         where strpos(
                 substr(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                        strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),'W12:OPS-GRANTS:BEGIN'),
                        strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),'W12:OPS-GRANTS:END')
                          - strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),'W12:OPS-GRANTS:BEGIN')),
                 '''' || k || '''') > 0)::text,'6b'
    union all select 'e6_new_org_seed','seed_mentions_delete_key_anywhere', (
        select (strpos(pg_get_functiondef('public.seed_default_rbac(uuid)'::regprocedure),
                       'enrollment.record.delete') > 0)::int)::text,'6c'
    union all select 'e6_new_org_seed','orgs_trigger_present', count(*)::text,'6d'
      from pg_trigger where tgname='orgs_seed_default_rbac' and not tgisinternal

    -- e7: THE LEGACY OPPORTUNITY KEYS ARE UNTOUCHED — still catalogued, still granted, still inert.
    -- This slice must neither activate nor delete them.
    union all select 'e7_legacy_inert','crm_opportunities_keys_catalogued', count(*)::text,'7a'
      from public.permission_definitions
     where key in ('crm.opportunities.read','crm.opportunities.write')
    union all select 'e7_legacy_inert','ops_opportunities_keys_catalogued', count(*)::text,'7b'
      from public.permission_definitions
     where key in ('ops.opportunities.read','ops.opportunities.write')
    union all select 'e7_legacy_inert','all_four_legacy_grants_still_present', count(*)::text,'7c'
      from public.role_permission_grants
     where permission_key in ('crm.opportunities.read','crm.opportunities.write',
                              'ops.opportunities.read','ops.opportunities.write')
       and allowed

    -- e8: LEDGER IDENTITY. The migration is recorded exactly once, and not twice.
    union all select 'e8_ledger','version_rows_expect_1', count(*)::text,'8a'
      from supabase_migrations.schema_migrations where version = '20260916050000'
    union all select 'e8_ledger','versions_at_or_after_this_slice', count(*)::text,'8b'
      from supabase_migrations.schema_migrations where version >= '20260916050000'

    -- e9: THE NARROW EXCEPTION KEYS ARE UNCHANGED. Slice 1 must not have widened ops into the two
    -- admin-only enrollment exceptions it never held.
    union all select 'e9_exceptions','ops_holding_pricing_override', count(*)::text,'9a'
      from public.role_permission_grants
     where permission_key='enrollment.pricing.override' and allowed and role_key='ops'
    union all select 'e9_exceptions','ops_holding_requirement_exception', count(*)::text,'9b'
      from public.role_permission_grants
     where permission_key='enrollment.requirement_exception.manage' and allowed and role_key='ops'

) census order by sort_key;
