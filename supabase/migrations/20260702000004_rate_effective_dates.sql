-- =============================================================================
-- Effective dates on commercial_tuition_rates
-- =============================================================================
-- V1: effective_start / effective_end are optional date metadata on a rate row.
-- One row per (org, location, variant, cadence, payer) — uniqueness unchanged.
-- Scheduled future-rate changes (multiple rows per cell) are V2.
-- =============================================================================

ALTER TABLE public.commercial_tuition_rates
    ADD COLUMN IF NOT EXISTS effective_start date,
    ADD COLUMN IF NOT EXISTS effective_end   date;

COMMENT ON COLUMN public.commercial_tuition_rates.effective_start IS
    'Optional: date from which this rate is effective. NULL = no start constraint.';
COMMENT ON COLUMN public.commercial_tuition_rates.effective_end IS
    'Optional: date after which this rate expires. NULL = no end constraint.';
