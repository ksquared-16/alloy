begin;

-- -------------------------------------------------------------------
-- Org
-- -------------------------------------------------------------------
-- Alloy Bend / cleaning org
-- -------------------------------------------------------------------

-- 1) Ensure the job lifecycle statuses exist
insert into public.status_definitions (
  id,
  org_id,
  entity_type,
  status_key,
  status_label,
  sort_order,
  is_active,
  is_system,
  is_default
)
select
  gen_random_uuid(),
  '7803388d-cdee-4afb-89cf-23a137f39423',
  'jobs',
  s.status_key,
  s.status_label,
  s.sort_order,
  true,
  false,
  false
from (
  values
    ('pending_assignment', 'Pending Assignment', 15),
    ('assigned', 'Assigned', 25),
    ('in_progress', 'In Progress', 35)
) as s(status_key, status_label, sort_order)
where not exists (
  select 1
  from public.status_definitions sd
  where sd.org_id = '7803388d-cdee-4afb-89cf-23a137f39423'
    and sd.entity_type = 'jobs'
    and sd.status_key = s.status_key
);

-- Ensure "new" is the default job status
update public.status_definitions
set is_default = (status_key = 'new')
where org_id = '7803388d-cdee-4afb-89cf-23a137f39423'
  and entity_type = 'jobs';

-- Normalize sort order for jobs
update public.status_definitions
set sort_order = case status_key
  when 'new' then 10
  when 'pending_assignment' then 15
  when 'confirmed' then 20
  when 'assigned' then 25
  when 'in_progress' then 35
  when 'completed' then 90
  when 'canceled' then 99
  else sort_order
end
where org_id = '7803388d-cdee-4afb-89cf-23a137f39423'
  and entity_type = 'jobs';

-- 2) Booking confirmed should move job into pending_assignment
update public.workflow_actions
set payload = jsonb_build_object