begin;

with ocm_counts as (
  select
    ocm.opportunity_id,
    count(*) as child_count,
    count(*) filter (where ocm.outcome_status_key is null) as missing_count
  from public.opportunity_customer_members ocm
  group by ocm.opportunity_id
),

safe_updates as (
  select
    ocm.id as ocm_id,
    ocm.opportunity_id,
    o.status_key as opportunity_status_key,
    case
      when o.status_key = 'waitlisted' then 'waitlisted'
      when o.status_key = 'ready_to_enroll' then 'offer_pending'
      when o.status_key = 'enrolled' then 'enrolled'
      else null
    end as next_outcome_status_key
  from public.opportunity_customer_members ocm
  join public.opportunities o
    on o.id = ocm.opportunity_id
  join ocm_counts c
    on c.opportunity_id = ocm.opportunity_id
  where ocm.outcome_status_key is null
    and c.missing_count = 1
    and o.status_key in ('waitlisted', 'ready_to_enroll', 'enrolled')
),

updated as (
  update public.opportunity_customer_members ocm
  set
    outcome_status_key = s.next_outcome_status_key,
    updated_at = now()
  from safe_updates s
  where ocm.id = s.ocm_id
    and s.next_outcome_status_key is not null
  returning
    ocm.id,
    ocm.opportunity_id,
    ocm.outcome_status_key
)

select
  count(*) as updated_ocm_count
from updated;

commit;
