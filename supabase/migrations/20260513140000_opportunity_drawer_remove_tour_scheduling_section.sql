-- =============================================================================
-- Opportunity drawer: remove standalone `tour_scheduling` overview section key
-- =============================================================================
-- Tour booking summary + actions live in the inquiry summary ("Tour date" + lifecycle).
-- The synthetic `tour_scheduling` section is no longer rendered; strip the key from
-- saved `overview_section_order` so layout order tools stay accurate.
-- Idempotent: only updates rows whose order array contains `tour_scheduling`.
-- =============================================================================

UPDATE public.record_drawer_layouts r
SET
    config_json = jsonb_set(
        COALESCE(r.config_json, '{}'::jsonb),
        '{overview_section_order}',
        (COALESCE(r.config_json -> 'overview_section_order', '[]'::jsonb) - '"tour_scheduling"'),
        true
    ),
    updated_at = now()
WHERE r.entity_type = 'opportunity'
  AND COALESCE(r.is_active, true) = true
  AND jsonb_typeof(COALESCE(r.config_json -> 'overview_section_order', '[]'::jsonb)) = 'array'
  AND (COALESCE(r.config_json -> 'overview_section_order', '[]'::jsonb) @> '"tour_scheduling"'::jsonb);
