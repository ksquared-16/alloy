-- =============================================================================
-- Normalize legacy status_definitions.entity_type: opportunity → opportunities
-- =============================================================================
-- Rationale:
--   - Migrations and global seeds use entity_type = 'opportunities' (plural).
--   - Vertical bootstrap v1 (childcare) incorrectly wrote 'opportunity' (singular).
--   - Admin Settings / Statuses UI only lists ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES
--     (plural), so singular rows were invisible in the accordion despite valid DB rows.
--   - fetchEffectiveStatusDefinitions already queries both for org + industry reads;
--     this migration aligns persisted rows with the canonical type.
--
-- Idempotent: safe to re-run. Deletes singular duplicate when a plural row already
-- exists for the same unique scope (org_id, industry_key, status_key).
-- =============================================================================

DELETE FROM public.status_definitions d
WHERE d.entity_type = 'opportunity'
  AND EXISTS (
        SELECT 1
        FROM public.status_definitions o
        WHERE o.org_id IS NOT DISTINCT FROM d.org_id
          AND COALESCE(o.industry_key, '') = COALESCE(d.industry_key, '')
          AND o.entity_type = 'opportunities'
          AND o.status_key = d.status_key
    );

UPDATE public.status_definitions
SET entity_type = 'opportunities',
    updated_at = now()
WHERE entity_type = 'opportunity';
