-- =============================================================================
-- Correction pass: hide redundant `contact_attempted` action placements
--
-- Decision:
-- - Keep `contact_attempted` as a STATUS (status_definitions)
-- - Do NOT show `contact_attempted` as a separate button/action on queue rows or record header
-- - Do NOT delete action/status definitions
-- - Only deactivate placements (visibility)
-- =============================================================================

UPDATE public.action_placements ap
SET
    is_active = false,
    updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ad.key = 'contact_attempted'
  AND ap.surface IN ('queue_row', 'record_header')
  AND ap.is_active = true;

