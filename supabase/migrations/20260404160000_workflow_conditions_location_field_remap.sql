-- Remap workflow_conditions from legacy job-scoped / booking_* paths to location.* semantics.
-- Runtime also resolves these aliases (see web/lib/workflowRun.ts); this keeps DB rows aligned.

UPDATE public.workflow_conditions c
SET
  target_entity = 'location',
  field_path = 'beds'
WHERE trim(lower(coalesce(c.field_path, ''))) IN ('bedrooms', 'booking_bedrooms')
  AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

UPDATE public.workflow_conditions c
SET
  target_entity = 'location',
  field_path = 'baths'
WHERE trim(lower(coalesce(c.field_path, ''))) IN ('bathrooms', 'booking_bathrooms')
  AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

UPDATE public.workflow_conditions c
SET
  target_entity = 'location',
  field_path = 'square_footage_tier_key'
WHERE trim(lower(coalesce(c.field_path, ''))) IN ('square_footage', 'booking_square_footage')
  AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

UPDATE public.workflow_conditions c
SET
  target_entity = 'location',
  field_path = 'home_type_key'
WHERE trim(lower(coalesce(c.field_path, ''))) IN ('home_type', 'home_type_label')
  AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');

UPDATE public.workflow_conditions c
SET
  target_entity = 'location',
  field_path = 'access_method_key'
WHERE trim(lower(coalesce(c.field_path, ''))) IN ('access_method', 'access_method_id')
  AND trim(lower(coalesce(c.target_entity, 'job'))) IN ('job', 'jobs', 'schedule', 'schedules', 'opportunity', 'opportunities');
