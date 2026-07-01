-- =============================================================================
-- Commercial Tuition Rates V2 — attach to program_offerings + billing cadence
-- =============================================================================
-- Drops the flat program_key/schedule_key/billing_period columns in favor of:
--   offering_id  → FK to program_offerings (Programs domain primitive)
--   cadence_key  → item_key from commercial_billing_cadence option set
--   payer_type   → private_pay | subsidy | corporate (V1: private_pay only)
--
-- Existing rows are dropped (migration is additive per the approved model;
-- V1 data has no production rates attached to real offerings yet).
-- =============================================================================

-- Step 1: add new columns (nullable first to allow migration)
ALTER TABLE public.commercial_tuition_rates
    ADD COLUMN IF NOT EXISTS offering_id  uuid REFERENCES public.program_offerings(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS cadence_key  text,
    ADD COLUMN IF NOT EXISTS payer_type   text NOT NULL DEFAULT 'private_pay';

-- Step 2: drop all existing rows (V1 had no production offerings to migrate from)
DELETE FROM public.commercial_tuition_rates;

-- Step 3: make offering_id + cadence_key NOT NULL now that rows are cleared
ALTER TABLE public.commercial_tuition_rates
    ALTER COLUMN offering_id SET NOT NULL,
    ALTER COLUMN cadence_key SET NOT NULL;

-- Step 4: drop old unique constraint and columns
ALTER TABLE public.commercial_tuition_rates
    DROP CONSTRAINT IF EXISTS commercial_tuition_rates_unique;

ALTER TABLE public.commercial_tuition_rates
    DROP COLUMN IF EXISTS program_key,
    DROP COLUMN IF EXISTS schedule_key,
    DROP COLUMN IF EXISTS billing_period;

-- Step 5: new unique constraint
-- One rate per (org, location, offering, cadence, payer_type)
ALTER TABLE public.commercial_tuition_rates
    ADD CONSTRAINT commercial_tuition_rates_unique
        UNIQUE NULLS NOT DISTINCT (org_id, location_id, offering_id, cadence_key, payer_type);

-- Step 6: add not_offered if not present (added in a previous migration; guard with IF NOT EXISTS via DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commercial_tuition_rates'
          AND column_name = 'not_offered'
    ) THEN
        ALTER TABLE public.commercial_tuition_rates
            ADD COLUMN not_offered boolean NOT NULL DEFAULT false;
    END IF;
END;
$$;

-- Step 7: index for offering lookups
CREATE INDEX IF NOT EXISTS idx_commercial_tuition_rates_offering
    ON public.commercial_tuition_rates (offering_id);

COMMENT ON COLUMN public.commercial_tuition_rates.offering_id IS
    'FK to program_offerings. Programs domain owns what is being sold.';

COMMENT ON COLUMN public.commercial_tuition_rates.cadence_key IS
    'item_key from commercial_billing_cadence option set (weekly, monthly, etc.)';

COMMENT ON COLUMN public.commercial_tuition_rates.payer_type IS
    'V1: private_pay only. V2: private_pay | subsidy | corporate';

COMMENT ON COLUMN public.commercial_tuition_rates.not_offered IS
    'True = explicitly not available at this scope. Distinct from "no rate set".';
