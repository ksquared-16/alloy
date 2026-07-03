-- =============================================================================
-- Enrollment Alignment S2 — canonical participation fields
-- =============================================================================
-- Doctrine (docs/sprints/07_2026/enrollment_alignment_data_model_audit.md):
-- a field exists once; the process stage determines requiredness/interpretation.
--   desired_start_date          → start_date
--   desired_schedule_type       → schedule_type
--   desired_program_category_id → program_category_id
--   desired_program_type        → dropped (legacy text duplicate of program_category_id)
-- Correctness over backwards compatibility: legacy keys are migrated, not aliased.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Backfill program_category FK from the legacy text key before dropping it
-- -----------------------------------------------------------------------------

-- Pass 1: location-scoped resolution.
UPDATE public.opportunity_customer_members ocm
SET desired_program_category_id = lpc.id
FROM public.location_program_categories lpc
WHERE ocm.desired_program_category_id IS NULL
  AND ocm.desired_program_type IS NOT NULL
  AND ocm.location_id IS NOT NULL
  AND lpc.org_id = ocm.org_id
  AND lpc.location_id = ocm.location_id
  AND lpc.key = ocm.desired_program_type;

-- Pass 2: org-level resolution when the key is unambiguous across locations.
UPDATE public.opportunity_customer_members ocm
SET desired_program_category_id = resolved.category_id
FROM (
    SELECT org_id, key, min(id::text)::uuid AS category_id
    FROM public.location_program_categories
    GROUP BY org_id, key
    HAVING count(DISTINCT id) = 1
) resolved
WHERE ocm.desired_program_category_id IS NULL
  AND ocm.desired_program_type IS NOT NULL
  AND resolved.org_id = ocm.org_id
  AND resolved.key = ocm.desired_program_type;

-- -----------------------------------------------------------------------------
-- 2. Column renames + legacy drop (opportunity_customer_members)
-- -----------------------------------------------------------------------------

ALTER TABLE public.opportunity_customer_members
    RENAME COLUMN desired_start_date TO start_date;
ALTER TABLE public.opportunity_customer_members
    RENAME COLUMN desired_schedule_type TO schedule_type;
ALTER TABLE public.opportunity_customer_members
    RENAME COLUMN desired_program_category_id TO program_category_id;
ALTER TABLE public.opportunity_customer_members
    DROP COLUMN IF EXISTS desired_program_type;

COMMENT ON COLUMN public.opportunity_customer_members.start_date IS
    'Canonical per-child start date for this enrollment participation. Stage determines interpretation (inquiry = requested start; approve_enrollment copies to child_enrollment_agreements.start_date as the committed value).';
COMMENT ON COLUMN public.opportunity_customer_members.schedule_type IS
    'Canonical per-child schedule (option set childcare_schedule_type). Stage determines requiredness.';
COMMENT ON COLUMN public.opportunity_customer_members.program_category_id IS
    'Canonical per-child program (FK location_program_categories). Sole program field — legacy desired_program_type text key dropped.';

ALTER INDEX IF EXISTS idx_opportunity_customer_members_desired_program_category
    RENAME TO idx_opportunity_customer_members_program_category;

-- Waitlist candidate projection keeps the same canonical vocabulary.
ALTER TABLE public.placement_candidates
    RENAME COLUMN desired_start_date TO start_date;

-- -----------------------------------------------------------------------------
-- 3. Field registry vocabulary (field_definitions / field_values)
-- -----------------------------------------------------------------------------

-- Drop the legacy Program text field definition + its stored values.
-- `field_values` is NORMALIZED: it references `field_definitions` via `field_definition_id`
-- (there is no `field_values.field_key` column), so delete values via a subselect.
DELETE FROM public.field_values
WHERE field_definition_id IN (
    SELECT id FROM public.field_definitions
    WHERE entity_type = 'inquiry_child' AND field_key = 'desired_program_type'
);
DELETE FROM public.field_definitions
WHERE entity_type = 'inquiry_child' AND field_key = 'desired_program_type';

-- Rename remaining canonical field keys on field_definitions (guarded against pre-existing targets).
-- No field_values update is needed: values reference the definition by field_definition_id, so the
-- key rename applies automatically to every stored value.
UPDATE public.field_definitions fd
SET field_key = m.new_key,
    label = m.new_label
FROM (VALUES
    ('desired_start_date', 'start_date', 'Start date'),
    ('desired_schedule_type', 'schedule_type', 'Schedule'),
    ('desired_program_category_id', 'program_category_id', 'Program')
) AS m(old_key, new_key, new_label)
WHERE fd.entity_type = 'inquiry_child'
  AND fd.field_key = m.old_key
  AND NOT EXISTS (
      SELECT 1 FROM public.field_definitions dup
      WHERE dup.org_id = fd.org_id
        AND dup.entity_type = fd.entity_type
        AND dup.field_key = m.new_key
  );

-- -----------------------------------------------------------------------------
-- 4. Stored layout documents + process/work-unit config referencing field keys
-- -----------------------------------------------------------------------------
-- Replace dotted refKeys first (full-string match), then bare quoted keys.

UPDATE public.entity_layouts
SET doc = replace(replace(replace(replace(doc::text,
        '"inquiry_child.desired_start_date"', '"inquiry_child.start_date"'),
        '"inquiry_child.desired_schedule_type"', '"inquiry_child.schedule_type"'),
        '"inquiry_child.desired_program_category_id"', '"inquiry_child.program_category_id"'),
        '"inquiry_child.desired_program_type"', '"inquiry_child.program_category_id"')::jsonb
WHERE doc::text LIKE '%inquiry_child.desired_%';

UPDATE public.record_drawer_layouts
SET config_json = replace(replace(replace(replace(config_json::text,
        '"inquiry_child.desired_start_date"', '"inquiry_child.start_date"'),
        '"inquiry_child.desired_schedule_type"', '"inquiry_child.schedule_type"'),
        '"inquiry_child.desired_program_category_id"', '"inquiry_child.program_category_id"'),
        '"inquiry_child.desired_program_type"', '"inquiry_child.program_category_id"')::jsonb
WHERE config_json::text LIKE '%inquiry_child.desired_%';

-- Work View filters / stage config stored on departments.metadata.
UPDATE public.departments
SET metadata = replace(replace(replace(metadata::text,
        '"desired_start_date"', '"start_date"'),
        '"desired_schedule_type"', '"schedule_type"'),
        '"desired_program_category_id"', '"program_category_id"')::jsonb
WHERE metadata::text LIKE '%desired_%';

-- Queue definitions / metadata on work units.
UPDATE public.work_units
SET queue_definition = replace(replace(replace(queue_definition::text,
        '"desired_start_date"', '"start_date"'),
        '"desired_schedule_type"', '"schedule_type"'),
        '"desired_program_category_id"', '"program_category_id"')::jsonb
WHERE queue_definition::text LIKE '%desired_%';

UPDATE public.work_units
SET metadata = replace(replace(replace(metadata::text,
        '"desired_start_date"', '"start_date"'),
        '"desired_schedule_type"', '"schedule_type"'),
        '"desired_program_category_id"', '"program_category_id"')::jsonb
WHERE metadata::text LIKE '%desired_%';
