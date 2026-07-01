-- =============================================================================
-- Financial Services — Commercial Model (first-class entity)
-- =============================================================================
-- Promotes Service from the interim org_settings.metadata.financials.services
-- catalog to a first-class platform entity. A Service is what the organization
-- sells (Full-Time Care, Before Care, Transportation, Meals, Registration, …);
-- everything financial attaches to it. Generic platform shape — childcare is the
-- first implementation, not the architecture.
--
-- Doctrine: docs/platform/modules/financial-platform-domain.md
--   * Service is first-class (determination #1; the org_settings catalog is interim).
--   * A Service catalog is a list, NOT effective-dated truth — rate AMOUNTS remain
--     the versioned objects (Rate Plans/Rules). Services therefore carry is_active
--     and audit, but no effective_start/end.
--
-- Also wires the Rate Plan -> Service relationship: childcare_rate_plans gains a
-- nullable service_id. Rate Resolution is unchanged (service_id is an association
-- dimension; rules still resolve by schedule basis within a plan).
--
-- HARD boundaries: no posting, payments, subsidy, charge, or GL writes here. This
-- is commercial CONFIGURATION only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) financial_services — the org's sellable catalog
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    service_key text NOT NULL,
    label text NOT NULL,
    service_type text NOT NULL,
    unit text,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 100,
    source_key text NOT NULL DEFAULT 'config',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT financial_services_key_nonempty CHECK (char_length(btrim(service_key)) > 0),
    CONSTRAINT financial_services_label_nonempty CHECK (char_length(btrim(label)) > 0),
    CONSTRAINT financial_services_type_check
        CHECK (service_type = ANY (ARRAY[
            'recurring'::text, 'one_time'::text, 'usage'::text, 'attendance_derived'::text
        ])),
    CONSTRAINT financial_services_unique_key UNIQUE (org_id, service_key)
);

COMMENT ON TABLE public.financial_services IS
    'First-class commercial catalog: what the org sells. Rates, charge templates, scheduling, attendance, billing, and posting attach to a Service. Catalog (not effective-dated); is_active toggles availability. Generic platform entity.';

CREATE INDEX IF NOT EXISTS idx_financial_services_org
    ON public.financial_services (org_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_financial_services_org_active
    ON public.financial_services (org_id) WHERE is_active;

DROP TRIGGER IF EXISTS trg_financial_services_updated_at ON public.financial_services;
CREATE TRIGGER trg_financial_services_updated_at
    BEFORE UPDATE ON public.financial_services
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Rate Plan -> Service relationship (nullable; resolution unchanged)
-- -----------------------------------------------------------------------------
ALTER TABLE public.childcare_rate_plans
    ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.financial_services (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.childcare_rate_plans.service_id IS
    'Optional owning Service (Commercial Model). A Service may have multiple rate plans (Standard / Corporate / Scholarship …). Rate Resolution is unchanged; this is an association/grouping dimension.';

CREATE INDEX IF NOT EXISTS idx_childcare_rate_plans_service
    ON public.childcare_rate_plans (service_id) WHERE service_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) RLS (config posture — mirrors the rate-plan / config-rule tables)
-- -----------------------------------------------------------------------------
ALTER TABLE public.financial_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_services_select_org ON public.financial_services;
CREATE POLICY financial_services_select_org ON public.financial_services FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS financial_services_insert_org ON public.financial_services;
CREATE POLICY financial_services_insert_org ON public.financial_services FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS financial_services_update_org ON public.financial_services;
CREATE POLICY financial_services_update_org ON public.financial_services FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS financial_services_delete_org ON public.financial_services;
CREATE POLICY financial_services_delete_org ON public.financial_services FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS financial_services_all_service_role ON public.financial_services;
CREATE POLICY financial_services_all_service_role ON public.financial_services FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financial_services TO authenticated;
GRANT ALL ON TABLE public.financial_services TO service_role;
