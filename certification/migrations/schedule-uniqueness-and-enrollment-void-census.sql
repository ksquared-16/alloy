select 'q1_duplicate_operational_primary_child' as question_id, 'row' as kind,
       json_build_object(
         'violating_agreements', count(*),
         'max_rows_for_one_agreement', coalesce(max(c), 0)
       ) as payload
from (
    select org_id, enrollment_agreement_id, count(*) as c
    from public.schedule_assignments
    where subject_type = 'child'
      and is_primary
      and enrollment_agreement_id is not null
      and status in ('planned', 'active', 'ending')
    group by 1, 2
    having count(*) > 1
) d
union all
select 'q2_assignment_shape', 'row',
       json_build_object(
         'subject_type', subject_type,
         'is_primary', is_primary,
         'commitment_kind', commitment_kind,
         'rows', count(*)
       )
from public.schedule_assignments
group by subject_type, is_primary, commitment_kind
union all
select 'q3_enrollment_status_distribution', 'row',
       json_build_object('status', status, 'rows', count(*))
from public.child_enrollment_agreements
group by status;
