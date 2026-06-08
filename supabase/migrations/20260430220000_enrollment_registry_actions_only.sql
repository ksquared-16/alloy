-- Enrollment demo: prove actions are registry-configured by ensuring only intentional placements exist.
-- - Opportunity header: schedule_tour ONLY
-- - Inquiry children section: add_child / add_sibling (registry-backed open_form)
-- - Queue row: open_record only (or none besides row click)
-- - Remove schedule_tour from record_section lifecycle
-- Idempotent.

-- -----------------------------------------------------------------------------
-- Ensure action_definitions for inquiry children CTAs exist (global templates).
-- -----------------------------------------------------------------------------
INSERT INTO public.action_definitions (org_id, key, label, description, entity_type, action_type, priority, payload_schema, is_active)
SELECT v.org_id, v.key, v.label, v.description, v.entity_type, v.action_type, v.priority, v.payload_schema::jsonb, v.is_active
FROM (VALUES
  (NULL::uuid, 'add_child', 'Add child', 'Add a child to this inquiry (v1 form)', 'opportunity', 'open_form', 12,
   '{"form_key":"add_inquiry_child","mode":"add_child","required_fields":["first_name","last_name"]}', true),
  (NULL::uuid, 'add_sibling', 'Add sibling', 'Add a sibling to this inquiry (v1 form)', 'opportunity', 'open_form', 13,
   '{"form_key":"add_inquiry_child","mode":"add_sibling","required_fields":["first_name","last_name"]}', true)
) AS v(org_id, key, label, description, entity_type, action_type, priority, payload_schema, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.action_definitions x WHERE x.key = v.key AND x.org_id IS NOT DISTINCT FROM v.org_id
);

-- -----------------------------------------------------------------------------
-- record_header / opportunity: keep ONLY schedule_tour
-- -----------------------------------------------------------------------------
DELETE FROM public.action_placements p
USING public.action_definitions d
WHERE p.action_definition_id = d.id
  AND p.surface = 'record_header'
  AND p.entity_type = 'opportunity'
  AND d.org_id IS NULL
  AND d.key IN ('qualify_opportunity','start_quote','mark_lost','mark_won');

-- Also remove any queue_row placements for these keys (global templates).
DELETE FROM public.action_placements p
USING public.action_definitions d
WHERE p.action_definition_id = d.id
  AND p.surface = 'queue_row'
  AND p.entity_type = 'opportunity'
  AND d.org_id IS NULL
  AND d.key IN ('qualify_opportunity','start_quote','mark_lost','mark_won','schedule_tour');

-- Ensure schedule_tour is present on record_header secondary (global).
INSERT INTO public.action_placements (
  org_id, action_definition_id, surface, slot, entity_type,
  department_id, work_unit_id, section_key, order_index, display_style, is_active
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
  10,
  'button'::text,
  true
FROM public.action_definitions d
WHERE d.org_id IS NULL
  AND d.key = 'schedule_tour'
  AND NOT EXISTS (
    SELECT 1 FROM public.action_placements p
    WHERE p.org_id IS NULL
      AND p.surface = 'record_header'
      AND p.slot = 'secondary'
      AND p.entity_type = 'opportunity'
      AND p.action_definition_id = d.id
  );

-- -----------------------------------------------------------------------------
-- record_section / opportunity_lifecycle: remove schedule_tour placement
-- -----------------------------------------------------------------------------
DELETE FROM public.action_placements p
USING public.action_definitions d
WHERE p.action_definition_id = d.id
  AND d.key = 'schedule_tour'
  AND p.surface = 'record_section'
  AND p.entity_type = 'opportunity'
  AND p.section_key = 'opportunity_lifecycle';

-- -----------------------------------------------------------------------------
-- record_section / inquiry_children: add placements for add_child + add_sibling
-- -----------------------------------------------------------------------------
INSERT INTO public.action_placements (
  org_id, action_definition_id, surface, slot, entity_type,
  department_id, work_unit_id, section_key, order_index, display_style, is_active
)
SELECT
  NULL::uuid,
  d.id,
  'record_section'::text,
  'secondary'::text,
  'opportunity'::text,
  NULL::uuid,
  NULL::uuid,
  'inquiry_children'::text,
  CASE WHEN d.key = 'add_child' THEN 10 ELSE 20 END,
  'button'::text,
  true
FROM public.action_definitions d
WHERE d.org_id IS NULL
  AND d.key IN ('add_child','add_sibling')
  AND NOT EXISTS (
    SELECT 1 FROM public.action_placements p
    WHERE p.org_id IS NULL
      AND p.surface = 'record_section'
      AND p.slot = 'secondary'
      AND p.entity_type = 'opportunity'
      AND p.section_key = 'inquiry_children'
      AND p.action_definition_id = d.id
  );

