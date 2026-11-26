-- MOUNTED MIGRATION PROOF — one statement, catalog and ledger only.
--
-- IDENTITY IS PROVEN, NOT ASSERTED. "Runtime database == inspected database" cannot be settled by
-- reading a project ref from the app and a target name from the census request — those are two
-- labels, not the same fact. Instead this asks the CENSUSED database whether it carries migrations
-- that only the CURRENTLY DEPLOYED commit introduced (the safeguarding pair from c2b7e19163). A
-- database holding the deployed build's own migrations is the database that build is running on.
select 'm1_financials_three' as question_id, 'scalar' as kind,
       coalesce((select string_agg(version, ',' order by version)
                   from supabase_migrations.schema_migrations
                  where version in ('20261018120000','20261019120000','20261020120000')), 'NONE') as payload
union all
select 'm2_deployed_lineage_marker', 'scalar',
       coalesce((select string_agg(version, ',' order by version)
                   from supabase_migrations.schema_migrations
                  where version in ('20261016130000','20261016150000')), 'DEPLOYED_MIGRATIONS_ABSENT')
union all
select 'm3_current_database', 'scalar', current_database()
union all
select 'm4_physical_objects', 'scalar',
       concat_ws(',',
         case when to_regclass('public.commercial_policy_assignments') is null then 'assignments_ABSENT' else 'assignments_ok' end,
         case when to_regclass('public.commercial_policy_charge_exclusions') is null then 'exclusions_ABSENT' else 'exclusions_ok' end,
         coalesce((select 'charge_id_ok' from information_schema.columns
                    where table_schema='public' and table_name='financial_responsibility_arrangements'
                      and column_name='charge_id' limit 1), 'charge_id_ABSENT'))
union all
select 'm5_constraint_and_triggers', 'scalar',
       concat_ws(',',
         coalesce((select case when pg_get_constraintdef(oid) like '%charge_id%' then 'exclusion_constraint_ok'
                               else 'constraint_STALE' end
                     from pg_constraint where conname='financial_responsibility_arrangements_no_overlap' limit 1),
                  'constraint_ABSENT'),
         (select coalesce(string_agg(tgname, '|' order by tgname), 'triggers_ABSENT') from pg_trigger
           where tgname in ('financial_responsibility_charge_scope_parity_trg',
                            'commercial_policy_charge_exclusion_parity_trg',
                            'trg_enforce_commercial_policy_assignment_parity')))
union all
select 'm6_rls', 'scalar',
       concat_ws(',',
         coalesce((select case when relrowsecurity then 'assignments_rls_on' else 'assignments_rls_OFF' end
                     from pg_class where oid=to_regclass('public.commercial_policy_assignments')), 'n/a'),
         coalesce((select string_agg(policyname, '|' order by policyname) from pg_policies
                    where schemaname='public'
                      and tablename in ('commercial_policy_assignments','commercial_policy_charge_exclusions')), 'NO_POLICIES'));
