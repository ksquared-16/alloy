-- HOSTED PRIMARY LEDGER + PRECONDITION CENSUS — one statement, catalog and ledger only.
--
-- Catalog-only by necessity as well as doctrine: a FROM against any of the three tables this
-- convergence is about would fail on a primary that does not have them yet, which is exactly the
-- state being measured, and the census would report an execution failure instead of an answer.
select 'q1_three_in_ledger' as question_id, 'scalar' as kind,
       coalesce((select string_agg(version, ',' order by version)
                   from supabase_migrations.schema_migrations
                  where version in ('20261018120000','20261019120000','20261020120000')), 'none') as payload
union all
select 'q2_ledger_high_water', 'scalar',
       coalesce((select max(version) from supabase_migrations.schema_migrations), 'none')
union all
select 'q3_arrangements_precondition', 'scalar',
       case when to_regclass('public.financial_responsibility_arrangements') is null
            then 'arrangements_table_ABSENT'
            else 'arrangements_present:' || coalesce((select string_agg(conname, ',') from pg_constraint
                   where conname = 'financial_responsibility_arrangements_no_overlap'), 'no_overlap_absent')
       end
union all
select 'q4_charge_id_column', 'scalar',
       coalesce((select 'charge_id_present' from information_schema.columns
                  where table_schema='public' and table_name='financial_responsibility_arrangements'
                    and column_name='charge_id' limit 1), 'charge_id_absent')
union all
select 'q5_new_tables', 'scalar',
       concat_ws(',',
         case when to_regclass('public.commercial_policy_charge_exclusions') is null
              then 'exclusions_absent' else 'exclusions_present' end,
         case when to_regclass('public.commercial_policy_assignments') is null
              then 'assignments_absent' else 'assignments_present' end)
union all
select 'q6_dependencies', 'scalar',
       concat_ws(',',
         case when to_regclass('public.charges') is null then 'charges_ABSENT' else 'charges_ok' end,
         case when to_regclass('public.commercial_policies') is null then 'policies_ABSENT' else 'policies_ok' end,
         case when to_regclass('public.opportunity_customer_members') is null then 'ocm_ABSENT' else 'ocm_ok' end,
         case when to_regclass('public.orgs') is null then 'orgs_ABSENT' else 'orgs_ok' end);
