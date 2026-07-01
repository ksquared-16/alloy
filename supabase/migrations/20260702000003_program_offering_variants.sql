-- =============================================================================
-- Program Offering Variants — Programs domain child of program_offerings
-- =============================================================================
-- Architecture: Program → program_offerings (type) → program_offering_variants
--               (quantity) → commercial_tuition_rates (price)
--
-- Before this migration:
--   program_offerings had quantity_type + quantity_value fields.
--   A "Full Day 5 days" and "Full Day 2 days" were separate offerings.
--
-- After this migration:
--   program_offerings = the offering TYPE (Full Day, Part Day, Drop-In)
--   program_offering_variants = the quantity variants (2 days, 5 days, etc.)
--   commercial_tuition_rates FK changes: offering_id → variant_id
--
-- Option A was chosen: rates always attach to a variant_id. Every offering
-- has at least one variant. No-quantity offerings (Drop-In, Before/After School)
-- get a single transparent default variant (label = NULL, quantity = NULL).
-- =============================================================================

-- ── Step 1: Create program_offering_variants ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.program_offering_variants (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    offering_id     uuid        NOT NULL REFERENCES public.program_offerings(id) ON DELETE CASCADE,
    -- label: null = transparent default variant (shown as the offering name in UI)
    label           text,
    -- quantity_type: days | hours | sessions | weeks | months | null (default variant)
    quantity_type   text,
    -- quantity_value: e.g. 5 for "5 days/week"; null for default/no-quantity variant
    quantity_value  numeric,
    sort_order      integer     NOT NULL DEFAULT 100,
    is_active       boolean     NOT NULL DEFAULT true,
    -- Values: active | draft | coming_soon | seasonal | retired | archived
    status          text        NOT NULL DEFAULT 'active',
    metadata        jsonb       NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz,
    -- One variant per (org, offering, quantity combination); nulls are distinct-safe
    CONSTRAINT program_offering_variants_unique
        UNIQUE NULLS NOT DISTINCT (org_id, offering_id, quantity_type, quantity_value)
);

COMMENT ON TABLE public.program_offering_variants IS
    'Programs domain: quantity/configuration variants under a program offering type. '
    'e.g. "Full Day" offering has variants "2 days/week", "5 days/week". '
    'Drop-In has one transparent default variant (quantity = null). '
    'Commercial tuition rates attach here — never directly to program_offerings.';

COMMENT ON COLUMN public.program_offering_variants.label IS
    'Operator-visible variant label. NULL = transparent (UI shows offering name only).';

COMMENT ON COLUMN public.program_offering_variants.quantity_type IS
    'Unit of measure: days | hours | sessions | weeks | months | NULL (default variant)';

COMMENT ON COLUMN public.program_offering_variants.quantity_value IS
    'Quantity count (e.g. 5 for "5 days/week"). NULL for default/no-quantity variants.';

CREATE INDEX IF NOT EXISTS idx_program_offering_variants_offering
    ON public.program_offering_variants (offering_id);

CREATE INDEX IF NOT EXISTS idx_program_offering_variants_org
    ON public.program_offering_variants (org_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_program_offering_variants_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS program_offering_variants_updated_at ON public.program_offering_variants;
CREATE TRIGGER program_offering_variants_updated_at
    BEFORE UPDATE ON public.program_offering_variants
    FOR EACH ROW EXECUTE FUNCTION public.set_program_offering_variants_updated_at();

-- RLS
ALTER TABLE public.program_offering_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_offering_variants_select_org ON public.program_offering_variants;
CREATE POLICY program_offering_variants_select_org ON public.program_offering_variants
    FOR SELECT USING (has_org_role(org_id, ARRAY['owner','admin','ops','manager','staff','viewer']));

DROP POLICY IF EXISTS program_offering_variants_insert_org ON public.program_offering_variants;
CREATE POLICY program_offering_variants_insert_org ON public.program_offering_variants
    FOR INSERT WITH CHECK (has_org_role(org_id, ARRAY['owner','admin','ops','manager']));

DROP POLICY IF EXISTS program_offering_variants_update_org ON public.program_offering_variants;
CREATE POLICY program_offering_variants_update_org ON public.program_offering_variants
    FOR UPDATE USING (has_org_role(org_id, ARRAY['owner','admin','ops','manager']));

DROP POLICY IF EXISTS program_offering_variants_delete_org ON public.program_offering_variants;
CREATE POLICY program_offering_variants_delete_org ON public.program_offering_variants
    FOR DELETE USING (has_org_role(org_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS program_offering_variants_all_service_role ON public.program_offering_variants;
CREATE POLICY program_offering_variants_all_service_role ON public.program_offering_variants
    AS PERMISSIVE FOR ALL TO service_role USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_offering_variants TO authenticated;
GRANT ALL ON TABLE public.program_offering_variants TO service_role;

-- ── Step 2: Migrate existing program_offerings → create one variant per row ───
-- Each current offering becomes: one offering (type) + one variant (quantity).
-- No-quantity offerings get a single transparent variant (label=NULL, qty=NULL).

INSERT INTO public.program_offering_variants (
    org_id, offering_id, label, quantity_type, quantity_value, sort_order, is_active, status
)
SELECT
    org_id,
    id AS offering_id,
    CASE
        WHEN quantity_type IS NOT NULL AND quantity_value IS NOT NULL
        THEN quantity_value::text || ' ' || quantity_type
        ELSE NULL  -- transparent default variant
    END AS label,
    quantity_type,
    quantity_value,
    sort_order,
    is_active,
    status
FROM public.program_offerings;

-- ── Step 3: Update commercial_tuition_rates: add variant_id ──────────────────

ALTER TABLE public.commercial_tuition_rates
    ADD COLUMN IF NOT EXISTS variant_id uuid
        REFERENCES public.program_offering_variants(id) ON DELETE CASCADE;

-- Migrate any existing rate rows: match offering_id → its single variant.
-- In practice, all rate rows were deleted in the V2 migration, so this is a
-- no-op today but is correct for safety.
UPDATE public.commercial_tuition_rates ctr
SET variant_id = (
    SELECT pov.id
    FROM public.program_offering_variants pov
    WHERE pov.offering_id = ctr.offering_id
    LIMIT 1
)
WHERE ctr.offering_id IS NOT NULL AND ctr.variant_id IS NULL;

-- Make variant_id NOT NULL (all rows are now mapped)
ALTER TABLE public.commercial_tuition_rates
    ALTER COLUMN variant_id SET NOT NULL;

-- Drop the old offering_id column (variant knows the offering)
ALTER TABLE public.commercial_tuition_rates
    DROP COLUMN IF EXISTS offering_id;

-- Update unique constraint to use variant_id
ALTER TABLE public.commercial_tuition_rates
    DROP CONSTRAINT IF EXISTS commercial_tuition_rates_unique;

ALTER TABLE public.commercial_tuition_rates
    ADD CONSTRAINT commercial_tuition_rates_unique
        UNIQUE NULLS NOT DISTINCT (org_id, location_id, variant_id, cadence_key, payer_type);

-- Update index
DROP INDEX IF EXISTS idx_commercial_tuition_rates_offering;
CREATE INDEX IF NOT EXISTS idx_commercial_tuition_rates_variant
    ON public.commercial_tuition_rates (variant_id);

COMMENT ON COLUMN public.commercial_tuition_rates.variant_id IS
    'FK to program_offering_variants. Rates always attach to variants, never directly to offerings.';

-- ── Step 4: Drop quantity fields from program_offerings ───────────────────────

ALTER TABLE public.program_offerings
    DROP COLUMN IF EXISTS quantity_type,
    DROP COLUMN IF EXISTS quantity_value;

-- ── Step 5: Merge duplicate offerings — old model allowed same attendance_type
-- with different quantities; V3 requires one offering per type. For any group of
-- offerings with the same (org_id, program_key, attendance_type), keep the oldest
-- record and re-parent all variants from duplicates onto it, then delete duplicates.
-- Also normalise offering labels (strip quantity info) and variant labels to
-- "N days/week" format.

DO $$
DECLARE
    dup RECORD;
    canonical_id uuid;
BEGIN
    FOR dup IN
        SELECT org_id, program_key, attendance_type
        FROM public.program_offerings
        GROUP BY org_id, program_key, attendance_type
        HAVING COUNT(*) > 1
    LOOP
        -- Oldest row is canonical
        SELECT id INTO canonical_id
        FROM public.program_offerings
        WHERE org_id = dup.org_id
          AND program_key = dup.program_key
          AND attendance_type = dup.attendance_type
        ORDER BY created_at ASC
        LIMIT 1;

        -- Re-parent variants from duplicates → canonical
        UPDATE public.program_offering_variants
        SET offering_id = canonical_id
        WHERE offering_id IN (
            SELECT id FROM public.program_offerings
            WHERE org_id = dup.org_id
              AND program_key = dup.program_key
              AND attendance_type = dup.attendance_type
              AND id <> canonical_id
        );

        -- Delete duplicate offerings (now empty)
        DELETE FROM public.program_offerings
        WHERE org_id = dup.org_id
          AND program_key = dup.program_key
          AND attendance_type = dup.attendance_type
          AND id <> canonical_id;

        -- Strip quantity info from the canonical offering label (keep type name only)
        UPDATE public.program_offerings
        SET label = CASE attendance_type
            WHEN 'full_time'    THEN 'Full Day'
            WHEN 'part_time'    THEN 'Part Day'
            WHEN 'drop_in'      THEN 'Drop-In'
            WHEN 'before_school' THEN 'Before School'
            WHEN 'after_school'  THEN 'After School'
            WHEN 'hourly'       THEN 'Hourly'
            ELSE label
        END
        WHERE id = canonical_id;
    END LOOP;
END $$;

-- Normalise variant labels to "N day(s)/week" format
UPDATE public.program_offering_variants
SET label = CASE
    WHEN quantity_value = 1 THEN '1 day/week'
    ELSE quantity_value::text || ' days/week'
END
WHERE quantity_type = 'days' AND quantity_value IS NOT NULL;

-- Update unique constraint: one offering type per (org, program, attendance_type)
ALTER TABLE public.program_offerings
    DROP CONSTRAINT IF EXISTS program_offerings_unique;

ALTER TABLE public.program_offerings
    ADD CONSTRAINT program_offerings_unique
        UNIQUE (org_id, program_key, attendance_type);

COMMENT ON TABLE public.program_offerings IS
    'Programs domain: one offering TYPE per program×attendance_type. '
    'e.g. "Full Day", "Part Day", "Drop-In". '
    'Quantity/configuration variants live in program_offering_variants. '
    'Commercial rates attach to variants, not directly to offerings.';
