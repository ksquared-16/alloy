-- RLS TENANCY REPAIR V1 — CLOSEOUT gap census.
--
-- The first effect census (gar_f88ffd839c0be0) proved the defect gone, containment intact, the
-- survivors present and the ledger healthy. Three things it did NOT prove on the deployed database,
-- and the completion bar names all three:
--
--   1. the `current_org_id()` policy family is UNTOUCHED — this repair deliberately excluded it, and
--      "deliberately excluded" is a claim that has to be measured like any other;
--   2. NO RBAC or default-role change occurred — the slice moved tenant containment, not authority;
--   3. the capability invariant measured with a CORRECTED instrument. My first census used an
--      unanchored regex and returned 12, which were `record_overview_layouts.org_id` and siblings
--      matching "layouts.org_id" inside the table's OWN name. Word-anchored and quoted-literal forms
--      are asked here so the answer is about the state rather than about my regex.
--
-- Read-only. Output contract: question_id | kind | payload.
select question_id, kind, payload from (

    -- g1: the excluded family, proved untouched.
    select 'g1_current_org_id'::text as question_id, 'policies_total'::text as kind,
           count(*)::text as payload, '1a'::text as sort_key
      from pg_policies where schemaname='public'
        and (coalesce(qual,'')||coalesce(with_check,'')) like '%current_org_id()%'
    union all select 'g1_current_org_id','write_policy_tables', count(distinct tablename)::text,'1b'
      from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
        and (coalesce(qual,'')||coalesce(with_check,'')) like '%current_org_id()%'
    union all select 'g1_current_org_id','function_still_returns_null_multi_org',
           (public.current_org_id() is null)::text,'1c'
    union all select 'g1_current_org_id','orgs', count(*)::text,'1d' from public.orgs

    -- g2: authority did not move. Counts, so a change of any direction shows.
    union all select 'g2_rbac','permission_definitions', count(*)::text,'2a' from public.permission_definitions
    union all select 'g2_rbac','permission_definitions_active', count(*)::text,'2b' from public.permission_definitions where is_active
    union all select 'g2_rbac','role_permission_grants_allowed', count(*)::text,'2c' from public.role_permission_grants where allowed
    union all select 'g2_rbac','role_definitions_active', count(*)::text,'2d' from public.role_definitions where is_active
    union all select 'g2_rbac','distinct_role_keys', count(distinct role_key)::text,'2e' from public.role_definitions

    -- g3: the capability invariant, asked with an instrument that cannot match a table name.
    union all select 'g3_invariant','word_anchored_capability_matches', count(*)::text,'3a'
      from pg_policies where schemaname='public'
        and (coalesce(qual,'')||coalesce(with_check,'')) ~ '\m(fin|work|tours|crm|reports|business_process|ai|forms|processing|communications|layouts|fields|scheduling|option_sets|sections|settings)\.[a-z_]+'
    union all select 'g3_invariant','quoted_capability_literals', count(*)::text,'3b'
      from pg_policies where schemaname='public'
        and (coalesce(qual,'')||coalesce(with_check,'')) ~ '''[a-z_]+\.[a-z_.]+'''
    union all select 'g3_invariant','policies_referencing_grants_table', count(*)::text,'3c'
      from pg_policies where schemaname='public'
        and (coalesce(qual,'')||coalesce(with_check,'')) like '%role_permission_grants%'
        and tablename <> 'role_permission_grants'

    -- g4: the affected tables, proved still contained.
    union all select 'g4_contained','rls_enabled_public_tables', count(*)::text,'4a'
      from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
      where c.relkind='r' and c.relrowsecurity
    union all select 'g4_contained','rls_disabled_public_tables', count(*)::text,'4b'
      from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
      where c.relkind='r' and not c.relrowsecurity
    union all select 'g4_contained','specific_repaired_tables_rls_on', count(*)::text,'4c'
      from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
      where c.relrowsecurity and c.relname in
        ('jobs','locations','schedules','vendors','payments','assignments','quotes','pipelines',
         'pipeline_stages','job_statuses','vendor_users','opportunity_persons','app_users',
         'workflows','workflow_actions','workflow_conditions','work_units')
    union all select 'g4_contained','work_units_tautology_free',
           (not exists (select 1 from pg_policies where tablename='work_units'
                        and (qual ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)' or with_check ~ '\(([a-z_]+)\.([a-z_]+) = \1\.\2\)')))::text,'4d'
) rows order by sort_key;
