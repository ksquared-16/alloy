-- =============================================================================
-- Commercial tuition rates — org-default and per-site rate grid
-- =============================================================================
-- Doctrine: program × schedule_type → rate.
-- Null location_id = org default. Non-null = location override.
-- Configuration Runtime: scope is org | location; inheritance resolves
-- location override → org default.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commercial_tuition_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    -- NULL = org default; non-null = site-level override
    location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    -- FK to location_program_categories; org defaults reference a "canonical"
    -- category row (typically the first site's row for that key).
    -- The schedule_key + program_key pair identifies the cell uniquely.
    program_key text NOT NULL,
    schedule_key text NOT NULL,
    -- Rate stored as integer cents to avoid floating-point rounding
    rate_cents integer NOT NULL CHECK (rate_cents >= 0),
    billing_period text NOT NULL DEFAULT 'monthly'
        CHECK (billing_period IN ('weekly', 'biweekly', 'monthly', 'annual')),
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    -- One rate per (org, location, program, schedule, billing_period)
    -- location_id nullable, so use COALESCE in the unique expression
    CONSTRAINT commercial_tuition_rates_unique
        UNIQUE NULLS NOT DISTINCT (org_id, location_id, program_key, schedule_key, billing_period)
);

COMMENT ON TABLE public.commercial_tuition_rates IS
    'Tuition rate grid: program × schedule → rate, per org or per site. '
    'location_id NULL = org default; non-null = site override.';

COMMENT ON COLUMN public.commercial_tuition_rates.program_key IS
    'Matches location_program_categories.key (infant, toddler, etc.)';

COMMENT ON COLUMN public.commercial_tuition_rates.schedule_key IS
    'Matches option set key from childcare_schedule_type (full_time, part_time, etc.)';

COMMENT ON COLUMN public.commercial_tuition_rates.rate_cents IS
    'Rate in US cents for the billing_period. e.g. $2,200/month = 220000.';

CREATE INDEX IF NOT EXISTS idx_commercial_tuition_rates_org
    ON public.commercial_tuition_rates (org_id);

CREATE INDEX IF NOT EXISTS idx_commercial_tuition_rates_org_location
    ON public.commercial_tuition_rates (org_id, location_id)
    WHERE location_id IS NOT NULL;

-- RLS: org-scoped, consistent with other commercial config tables
ALTER TABLE public.commercial_tuition_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_tuition_rates_select_org ON public.commercial_tuition_rates;
CREATE POLICY commercial_tuition_rates_select_org ON public.commercial_tuition_rates
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS commercial_tuition_rates_insert_org ON public.commercial_tuition_rates;
CREATE POLICY commercial_tuition_rates_insert_org ON public.commercial_tuition_rates
    FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS commercial_tuition_rates_update_org ON public.commercial_tuition_rates;
CREATE POLICY commercial_tuition_rates_update_org ON public.commercial_tuition_rates
    FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS commercial_tuition_rates_delete_org ON public.commercial_tuition_rates;
CREATE POLICY commercial_tuition_rates_delete_org ON public.commercial_tuition_rates
    FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS commercial_tuition_rates_all_service_role ON public.commercial_tuition_rates;
CREATE POLICY commercial_tuition_rates_all_service_role ON public.commercial_tuition_rates
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commercial_tuition_rates TO authenticated;
GRANT ALL ON TABLE public.commercial_tuition_rates TO service_role;
