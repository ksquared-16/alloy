-- =============================================================================
-- Commercial tuition rates — add not_offered flag
-- =============================================================================
-- not_offered = true means this program × schedule combination is explicitly
-- unavailable at this location (or org-wide when location_id IS NULL).
-- Distinct from rate_cents = null (no rate set yet) vs. explicitly not offered.
-- =============================================================================

ALTER TABLE public.commercial_tuition_rates
    ADD COLUMN IF NOT EXISTS not_offered boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.commercial_tuition_rates.not_offered IS
    'When true, this program × schedule combination is explicitly not offered. '
    'Distinct from having no rate set (null/absent). '
    'Inherits from org default unless location has its own not_offered row.';
