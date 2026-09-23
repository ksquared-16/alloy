-- POST-APPLY CERTIFICATION — one statement, catalog-only.
--
-- The ledger says the three migrations ran. That is a claim about bookkeeping; this asks the
-- catalog whether the OBJECTS they were supposed to produce are actually there, because a ledger
-- row and a schema are two different facts and the whole point of this convergence is truthfulness.
select 'c1_exclusion_constraint_carries_charge' as question_id, 'scalar' as kind,
       coalesce((select case when pg_get_constraintdef(oid) like '%charge_id%'
                             then 'redefined_with_charge_id' else 'STALE_WITHOUT_CHARGE_ID' end
                   from pg_constraint
                  where conname = 'financial_responsibility_arrangements_no_overlap' limit 1),
                'CONSTRAINT_MISSING') as payload
union all
select 'c2_triggers', 'scalar',
       concat_ws(',',
         coalesce((select 'scope_parity_ok' from pg_trigger
                    where tgname = 'financial_responsibility_charge_scope_parity_trg' limit 1), 'scope_parity_MISSING'),
         coalesce((select 'exclusion_parity_ok' from pg_trigger
                    where tgname = 'commercial_policy_charge_exclusion_parity_trg' limit 1), 'exclusion_parity_MISSING'),
         coalesce((select 'assignment_parity_ok' from pg_trigger
                    where tgname = 'trg_enforce_commercial_policy_assignment_parity' limit 1), 'assignment_parity_MISSING'))
union all
select 'c3_rls_enabled', 'scalar',
       concat_ws(',',
         coalesce((select case when relrowsecurity then 'exclusions_rls_on' else 'exclusions_rls_OFF' end
                     from pg_class where oid = to_regclass('public.commercial_policy_charge_exclusions')), 'exclusions_missing'),
         coalesce((select case when relrowsecurity then 'assignments_rls_on' else 'assignments_rls_OFF' end
                     from pg_class where oid = to_regclass('public.commercial_policy_assignments')), 'assignments_missing'))
union all
select 'c4_rls_policies', 'scalar',
       coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies
                  where schemaname='public'
                    and tablename in ('commercial_policy_charge_exclusions','commercial_policy_assignments')), 'NO_POLICIES')
union all
select 'c5_unique_indexes', 'scalar',
       coalesce((select string_agg(indexname, ',' order by indexname) from pg_indexes
                  where schemaname='public'
                    and indexname in ('ux_commercial_policy_assignments_live',
                                      'financial_responsibility_arrangements_charge_idx')), 'NO_INDEXES')
union all
select 'c6_reason_not_null', 'scalar',
       coalesce((select case when is_nullable='NO' then 'exclusion_reason_not_null' else 'exclusion_reason_NULLABLE' end
                   from information_schema.columns
                  where table_schema='public' and table_name='commercial_policy_charge_exclusions'
                    and column_name='reason' limit 1), 'exclusions_missing');
