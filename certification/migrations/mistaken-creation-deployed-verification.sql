select 'q1_enrollment_voided_accepted' as question_id, 'row' as kind,
       json_build_object(
         'check_admits_voided', (pg_get_constraintdef(oid) like '%voided%'),
         'definition', pg_get_constraintdef(oid)
       ) as payload
from pg_constraint
where conrelid = 'public.child_enrollment_agreements'::regclass
  and conname = 'child_enrollment_agreements_status_check'
union all
select 'q2_enrollment_status_comment', 'row',
       json_build_object('comment', col_description('public.child_enrollment_agreements'::regclass,
           (select attnum from pg_attribute where attrelid='public.child_enrollment_agreements'::regclass and attname='status')))
union all
select 'q3_operational_index_excludes_voided', 'row',
       json_build_object('index', indexname, 'mentions_voided', (indexdef like '%voided%'), 'def', indexdef)
from pg_indexes
where schemaname='public' and indexname = 'ux_child_enrollment_agreements_one_operational_per_member_site'
union all
select 'q4_shared_visibility_predicate', 'row',
       json_build_object(
         'excludes_canceled', (pg_get_functiondef(p.oid) like '%canceled%'),
         'excludes_voided', (pg_get_functiondef(p.oid) like '%voided%')
       )
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='external_child_service_commitment_exists'
union all
select 'q5_schedule_uniqueness_index', 'row',
       json_build_object('index', indexname, 'def', indexdef)
from pg_indexes
where schemaname='public' and indexname = 'ux_schedule_assignments_one_operational_primary_child'
union all
select 'q6_no_violations', 'row',
       json_build_object('duplicate_operational_primary_child', count(*))
from (
    select 1 from public.schedule_assignments
    where subject_type='child' and is_primary and enrollment_agreement_id is not null
      and status in ('planned','active','ending')
    group by org_id, enrollment_agreement_id having count(*) > 1
) d;
