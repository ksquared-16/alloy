-- =============================================================================
-- Childcare MVP — vocabulary cleanup: consolidate program/age group option set
-- =============================================================================
-- Decisions (approved):
-- - Canonical option set: childcare_program_type
-- - classroom_age_group is deprecated and should no longer be referenced by fields
-- - Do NOT add mixed_age to childcare_program_type (mixed_age is NOT a program/age band)
-- - Do NOT delete any option sets/items/fields (cleanup later)
--
-- Conceptual mapping (locked):
-- - Inquiry / opportunity: captures desired program type → uses childcare_program_type
-- - Classroom / location unit: captures offered program type → uses the SAME childcare_program_type
-- - Enrollment / job: captures actual enrolled program → should use childcare_program_type when/if field exists
-- - Schedule: captures care pattern/timing → uses childcare_schedule_type
-- - Tuition / billing: later derives/references Enrollment + Schedule + Program Type (do not model tuition as program type)
--
-- Scope:
-- - Only orgs where orgs.industry_id → industries.key = 'childcare' (active industry)
-- - Uses the same _childcare_mvp_seed_target_orgs pattern as childcare control-plane seed.
--
-- Idempotent:
-- - Field update only when config.option_set_key currently = 'classroom_age_group'
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Target orgs: childcare industry
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _childcare_mvp_seed_target_orgs (org_id uuid PRIMARY KEY);

INSERT INTO _childcare_mvp_seed_target_orgs (org_id)
SELECT o.id
FROM public.orgs o
WHERE o.industry_id IN (
    SELECT i.id
    FROM public.industries i
    WHERE i.key = 'childcare'
      AND COALESCE(i.is_active, true) = true
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1) Repoint field_definitions: location.classroom_age_group → childcare_program_type
-- -----------------------------------------------------------------------------
UPDATE public.field_definitions fd
SET
    config = jsonb_set(
        COALESCE(fd.config, '{}'::jsonb),
        '{option_set_key}',
        '"childcare_program_type"'::jsonb,
        true
    ),
    updated_at = now()
FROM _childcare_mvp_seed_target_orgs t
WHERE fd.org_id = t.org_id
  AND fd.entity_type = 'location'
  AND fd.field_key = 'classroom_age_group'
  AND COALESCE(fd.config->>'option_set_key', '') = 'classroom_age_group';

-- -----------------------------------------------------------------------------
-- Verification queries (run manually before/after migrate)
-- -----------------------------------------------------------------------------
-- A) Confirm location.classroom_age_group now uses childcare_program_type
-- SELECT
--   fd.org_id,
--   fd.entity_type,
--   fd.field_key,
--   fd.label,
--   fd.config->>'option_set_key' AS option_set_key
-- FROM public.field_definitions fd
-- JOIN public.orgs o ON o.id = fd.org_id
-- JOIN public.industries i ON i.id = o.industry_id
-- WHERE i.key = 'childcare'
--   AND fd.entity_type = 'location'
--   AND fd.field_key = 'classroom_age_group'
-- ORDER BY fd.org_id;
--
-- B) Ensure no field_definitions still reference classroom_age_group
-- SELECT
--   fd.org_id,
--   fd.entity_type,
--   fd.field_key,
--   fd.label,
--   fd.config->>'option_set_key' AS option_set_key
-- FROM public.field_definitions fd
-- JOIN public.orgs o ON o.id = fd.org_id
-- JOIN public.industries i ON i.id = o.industry_id
-- WHERE i.key = 'childcare'
--   AND fd.config->>'option_set_key' = 'classroom_age_group'
-- ORDER BY fd.org_id, fd.entity_type, fd.field_key;
--
-- C) Confirm childcare_program_type contains ONLY the approved five keys
--    (This migration does not mutate items; it only repoints the classroom field.)
-- WITH program_sets AS (
--   SELECT os.id, os.org_id
--   FROM public.option_sets os
--   JOIN public.orgs o ON o.id = os.org_id
--   JOIN public.industries i ON i.id = o.industry_id
--   WHERE i.key = 'childcare'
--     AND os.set_key = 'childcare_program_type'
-- )
-- SELECT
--   ps.org_id,
--   array_agg(osi.item_key ORDER BY osi.sort_order, osi.item_key) AS item_keys
-- FROM program_sets ps
-- JOIN public.option_set_items osi ON osi.option_set_id = ps.id
-- GROUP BY ps.org_id
-- HAVING bool_or(osi.item_key NOT IN ('infant','toddler','preschool','pre_k','school_age')) = true
--    OR count(*) <> 5
-- ORDER BY ps.org_id;
--
-- If query C returns any rows, that org has unexpected program type items and should be corrected
-- via a separate, explicitly-approved cleanup (do not delete blindly).

