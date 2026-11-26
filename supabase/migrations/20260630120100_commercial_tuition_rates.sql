-- =============================================================================
-- Commercial tuition rates — org-default and per-site rate grid
-- =============================================================================
-- Doctrine: program × schedule_type → rate.
-- Null location_id = org default. Non-null = location override.
-- Configuration Runtime: scope is org | location; inheritance resolves
-- location override → org default.
--
-- Idempotent: safe when the table already exists in a later v2 shape
-- (e.g. Supabase Preview branch replay against a parent snapshot where
-- program_key was dropped by 20260702000002_commercial_tuition_rates_v2).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commercial_tuition_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    program_key text NOT NULL,
    schedule_key text NOT NULL,
    rate_cents integer NOT NULL CHECK (rate_cents >= 0),
    billing_period text NOT NULL DEFAULT 'monthly'
        CHECK (billing_period IN ('weekly', 'biweekly', 'monthly', 'annual')),
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT commercial_tuition_rates_unique
        UNIQUE NULLS NOT DISTINCT (org_id, location_id, program_key, schedule_key, billing_period)
);

-- Backfill v1 columns when the table pre-exists without them (schema drift / partial apply).
ALTER TABLE public.commercial_tuition_rates
    ADD COLUMN IF NOT EXISTS location_id uuid,
    ADD COLUMN IF NOT EXISTS program_key text,
    ADD COLUMN IF NOT EXISTS schedule_key text,
    ADD COLUMN IF NOT EXISTS rate_cents integer,
    ADD COLUMN IF NOT EXISTS billing_period text DEFAULT 'monthly',
    ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DO $$
BEGIN
    EXECUTE $comment$
        COMMENT ON TABLE public.commercial_tuition_rates IS
            'Tuition rate grid: program × schedule → rate, per org or per site. '
            'location_id NULL = org default; non-null = site override.'
    $comment$;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commercial_tuition_rates'
          AND column_name = 'program_key'
    ) THEN
        EXECUTE $comment$
            COMMENT ON COLUMN public.commercial_tuition_rates.program_key IS
                'Matches location_program_categories.key (infant, toddler, etc.)'
        $comment$;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commercial_tuition_rates'
          AND column_name = 'schedule_key'
    ) THEN
        EXECUTE $comment$
            COMMENT ON COLUMN public.commercial_tuition_rates.schedule_key IS
                'Matches option set key from childcare_schedule_type (full_time, part_time, etc.)'
        $comment$;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commercial_tuition_rates'
          AND column_name = 'rate_cents'
    ) THEN
        EXECUTE $comment$
            COMMENT ON COLUMN public.commercial_tuition_rates.rate_cents IS
                'Rate in US cents for the billing_period. e.g. $2,200/month = 220000.'
        $comment$;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_commercial_tuition_rates_org
    ON public.commercial_tuition_rates (org_id);

CREATE INDEX IF NOT EXISTS idx_commercial_tuition_rates_org_location
    ON public.commercial_tuition_rates (org_id, location_id)
    WHERE location_id IS NOT NULL;

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
