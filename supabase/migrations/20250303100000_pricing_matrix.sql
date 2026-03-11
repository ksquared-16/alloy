-- Universal pricing matrix (additive; does not replace pricing_first_clean_prices or pricing_recurring_prices).
-- Concept: Pricing = Service Offering + Plan Template + Pricing Mode + Pricing Dimension Value + Amount
-- Supports: cleaning initial/recurring, childcare tuition, SaaS subscription, setup fee, one-time fee, etc.

CREATE TABLE IF NOT EXISTS public.pricing_matrix (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id uuid NOT NULL REFERENCES public.verticals(id) ON DELETE RESTRICT,
    service_offering_id uuid NOT NULL REFERENCES public.service_offerings(id) ON DELETE RESTRICT,
    service_plan_template_id uuid REFERENCES public.service_plan_templates(id) ON DELETE RESTRICT,
    pricing_mode_id uuid NOT NULL REFERENCES public.pricing_modes(id) ON DELETE RESTRICT,
    pricing_dimension_value_id uuid REFERENCES public.pricing_dimension_values(id) ON DELETE RESTRICT,
    amount_cents integer NOT NULL CHECK (amount_cents >= 0),
    is_active boolean NOT NULL DEFAULT true,
    -- Optional: trace back to legacy row for parity checks and migration auditing
    source_table text,
    source_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness: one active row per (vertical, offering, plan, mode, dimension value). NULLs normalized via sentinel for index.
CREATE UNIQUE INDEX uq_pricing_matrix_lookup ON public.pricing_matrix (
    vertical_id,
    service_offering_id,
    COALESCE(service_plan_template_id, '00000000-0000-0000-0000-000000000000'::uuid),
    pricing_mode_id,
    COALESCE(pricing_dimension_value_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

COMMENT ON TABLE public.pricing_matrix IS 'Universal pricing matrix: one row per (vertical, service offering, plan, mode, dimension value). Replaces vertical-specific tables (e.g. first_clean/recurring) when resolver is switched.';
COMMENT ON COLUMN public.pricing_matrix.service_plan_template_id IS 'Null for one-time/initial/setup pricing; set for recurring/subscription by frequency.';
COMMENT ON COLUMN public.pricing_matrix.pricing_dimension_value_id IS 'E.g. square footage bucket (via pricing_dimension_values). Null for flat pricing.';
COMMENT ON COLUMN public.pricing_matrix.source_table IS 'Legacy table name when seeded from existing data: pricing_first_clean_prices or pricing_recurring_prices.';
COMMENT ON COLUMN public.pricing_matrix.source_id IS 'Legacy row id for parity validation.';

CREATE INDEX IF NOT EXISTS idx_pricing_matrix_vertical_offering
    ON public.pricing_matrix(vertical_id, service_offering_id);
CREATE INDEX IF NOT EXISTS idx_pricing_matrix_mode
    ON public.pricing_matrix(pricing_mode_id);
CREATE INDEX IF NOT EXISTS idx_pricing_matrix_active_lookup
    ON public.pricing_matrix(vertical_id, service_offering_id, service_plan_template_id, pricing_mode_id, pricing_dimension_value_id)
    WHERE is_active = true;

-- Optional: updated_at trigger (match existing patterns if you use them)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pricing_matrix_updated_at ON public.pricing_matrix;
CREATE TRIGGER pricing_matrix_updated_at
    BEFORE UPDATE ON public.pricing_matrix
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
