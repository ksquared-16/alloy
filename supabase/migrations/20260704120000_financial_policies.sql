-- =============================================================================
-- Financial Policies — Commercial Model (scoped, effective-dated configuration)
-- =============================================================================
-- A Financial Policy answers "how should this organization handle a financial
-- rule?" — proration, billing cadence, grace period, late fee, NSF, deposit,
-- refund, posting review, etc. Policies are NOT org-only: they resolve through
-- the most-specific-wins model Organization -> Location -> Service -> Rate Plan
-- (Agreement is a future scope dimension).
--
-- Doctrine: docs/platform/modules/financial-platform-domain.md
--   * Financial Policies are scoped + effective-dated config (determination #6).
--   * Resolution is recomputable; Posting is the only authoritative money write.
--   * Effective-dated supersede semantics; never overwrite a policy value in place.
--
-- HARD boundaries: no posting, no ledger/GL writes, no invoices/payments/charges.
-- Configuration only. The typed value lives in `value` jsonb (validated in the
-- app against the policy-type registry, financialPolicyTypes.ts).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.financial_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    scope_type text NOT NULL,
    location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    service_id uuid REFERENCES public.financial_services (id) ON DELETE CASCADE,
    rate_plan_id uuid REFERENCES public.childcare_rate_plans (id) ON DELETE CASCADE,
    policy_type text NOT NULL,
    label text,
    description text,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    effective_start date NOT NULL,
    effective_end date,
    source_key text NOT NULL DEFAULT 'config',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT financial_policies_scope_type_check
        CHECK (scope_type = ANY (ARRAY['org'::text, 'location'::text, 'service'::text, 'rate_plan'::text])),
    CONSTRAINT financial_policies_policy_type_check
        CHECK (policy_type = ANY (ARRAY[
            'proration'::text, 'billing_cadence'::text, 'grace_period'::text,
            'late_fee'::text, 'nsf_fee'::text, 'deposit'::text, 'refund'::text,
            'vacation_credit'::text, 'withdrawal'::text, 'write_off'::text,
            'adjustment_approval'::text, 'draft_expiration'::text, 'posting_review'::text
        ])),
    CONSTRAINT financial_policies_end_after_start
        CHECK (effective_end IS NULL OR effective_end >= effective_start),
    CONSTRAINT financial_policies_scope_shape CHECK (
        (scope_type = 'org' AND location_id IS NULL AND service_id IS NULL AND rate_plan_id IS NULL)
        OR (scope_type = 'location' AND location_id IS NOT NULL AND service_id IS NULL AND rate_plan_id IS NULL)
        OR (scope_type = 'service' AND service_id IS NOT NULL AND location_id IS NULL AND rate_plan_id IS NULL)
        OR (scope_type = 'rate_plan' AND rate_plan_id IS NOT NULL AND location_id IS NULL AND service_id IS NULL)
    )
);

COMMENT ON TABLE public.financial_policies IS
    'Scoped, effective-dated financial rule config (proration, cadence, fees, deposits, refunds, posting review, …). Most-specific-wins: org -> location -> service -> rate_plan. Typed value in `value` jsonb. Configuration only: resolution is recomputable; this posts no money.';

CREATE INDEX IF NOT EXISTS idx_financial_policies_org_type
    ON public.financial_policies (org_id, policy_type);
CREATE INDEX IF NOT EXISTS idx_financial_policies_org_location
    ON public.financial_policies (org_id, location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_policies_org_service
    ON public.financial_policies (org_id, service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_policies_org_rate_plan
    ON public.financial_policies (org_id, rate_plan_id) WHERE rate_plan_id IS NOT NULL;

-- Scope org-consistency: any scope target must belong to the same org.
CREATE OR REPLACE FUNCTION public.validate_financial_policy_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    loc_org uuid;
    svc_org uuid;
    plan_org uuid;
BEGIN
    IF NEW.location_id IS NOT NULL THEN
        SELECT l.org_id INTO loc_org FROM public.locations l WHERE l.id = NEW.location_id;
        IF loc_org IS NULL THEN
            RAISE EXCEPTION 'financial policy scope: location_id % not found', NEW.location_id USING ERRCODE = '23503';
        END IF;
        IF loc_org <> NEW.org_id THEN
            RAISE EXCEPTION 'financial policy scope: location org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.service_id IS NOT NULL THEN
        SELECT s.org_id INTO svc_org FROM public.financial_services s WHERE s.id = NEW.service_id;
        IF svc_org IS NULL THEN
            RAISE EXCEPTION 'financial policy scope: service_id % not found', NEW.service_id USING ERRCODE = '23503';
        END IF;
        IF svc_org <> NEW.org_id THEN
            RAISE EXCEPTION 'financial policy scope: service org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.rate_plan_id IS NOT NULL THEN
        SELECT p.org_id INTO plan_org FROM public.childcare_rate_plans p WHERE p.id = NEW.rate_plan_id;
        IF plan_org IS NULL THEN
            RAISE EXCEPTION 'financial policy scope: rate_plan_id % not found', NEW.rate_plan_id USING ERRCODE = '23503';
        END IF;
        IF plan_org <> NEW.org_id THEN
            RAISE EXCEPTION 'financial policy scope: rate plan org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_financial_policy_scope ON public.financial_policies;
CREATE TRIGGER trg_validate_financial_policy_scope
    BEFORE INSERT OR UPDATE ON public.financial_policies
    FOR EACH ROW EXECUTE FUNCTION public.validate_financial_policy_scope();

DROP TRIGGER IF EXISTS trg_financial_policies_updated_at ON public.financial_policies;
CREATE TRIGGER trg_financial_policies_updated_at
    BEFORE UPDATE ON public.financial_policies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (config posture — mirrors the rate-plan / charge-template tables)
ALTER TABLE public.financial_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_policies_select_org ON public.financial_policies;
CREATE POLICY financial_policies_select_org ON public.financial_policies FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS financial_policies_insert_org ON public.financial_policies;
CREATE POLICY financial_policies_insert_org ON public.financial_policies FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS financial_policies_update_org ON public.financial_policies;
CREATE POLICY financial_policies_update_org ON public.financial_policies FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS financial_policies_delete_org ON public.financial_policies;
CREATE POLICY financial_policies_delete_org ON public.financial_policies FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS financial_policies_all_service_role ON public.financial_policies;
CREATE POLICY financial_policies_all_service_role ON public.financial_policies FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financial_policies TO authenticated;
GRANT ALL ON TABLE public.financial_policies TO service_role;
