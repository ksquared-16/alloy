-- Enrollment / Opportunity CRM cleanup:
-- - Move schedule_tour to record_header (top-right actions), remove from record_section lifecycle.
-- - Move mark_lost out of prominent placements (header/queue) into overflow (header only).
-- Idempotent + safe if some placements already missing.

-- Remove schedule_tour from lifecycle section placements (global + org-scoped).
DELETE FROM public.action_placements p
USING public.action_definitions d
WHERE p.action_definition_id = d.id
  AND d.key = 'schedule_tour'
  AND p.surface = 'record_section'
  AND (p.section_key IS NULL OR p.section_key = 'opportunity_lifecycle');

-- Ensure schedule_tour exists in record_header secondary (global placement, used as template;
-- org-scoped defs can reuse this placement via org_id filtering in resolver).
INSERT INTO public.action_placements (
  org_id,
  action_definition_id,
  surface,
  slot,
  entity_type,
  department_id,
  work_unit_id,
  section_key,
  order_index,
  display_style,
  is_active
)
SELECT
  NULL::uuid,
  d.id,
  'record_header'::text,
  'secondary'::text,
  'opportunity'::text,
  NULL::uuid,
  NULL::uuid,
  NULL::text,
  15,
  'button'::text,
  true
FROM public.action_definitions d
WHERE d.org_id IS NULL
  AND d.key = 'schedule_tour'
  AND NOT EXISTS (
    SELECT 1
    FROM public.action_placements p
    WHERE p.org_id IS NULL
      AND p.surface = 'record_header'
      AND p.slot = 'secondary'
      AND p.entity_type = 'opportunity'
      AND p.action_definition_id = d.id
  );

-- Remove mark_lost from record_header secondary + queue_row inline (global placements).
DELETE FROM public.action_placements p
USING public.action_definitions d
WHERE p.action_definition_id = d.id
  AND d.org_id IS NULL
  AND d.key = 'mark_lost'
  AND (
    (p.surface = 'record_header' AND p.slot = 'secondary')
    OR (p.surface = 'queue_row' AND p.slot = 'row_inline')
  );

-- Add mark_lost to record_header overflow (global placement).
INSERT INTO public.action_placements (
  org_id,
  action_definition_id,
  surface,
  slot,
  entity_type,
  department_id,
  work_unit_id,
  section_key,
  order_index,
  display_style,
  is_active
)
SELECT
  NULL::uuid,
  d.id,
  'record_header'::text,
  'overflow'::text,
  'opportunity'::text,
  NULL::uuid,
  NULL::uuid,
  NULL::text,
  90,
  'menu_item'::text,
  true
FROM public.action_definitions d
WHERE d.org_id IS NULL
  AND d.key = 'mark_lost'
  AND NOT EXISTS (
    SELECT 1
    FROM public.action_placements p
    WHERE p.org_id IS NULL
      AND p.surface = 'record_header'
      AND p.slot = 'overflow'
      AND p.entity_type = 'opportunity'
      AND p.action_definition_id = d.id
  );

