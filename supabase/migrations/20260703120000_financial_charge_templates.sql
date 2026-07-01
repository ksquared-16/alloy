-- =============================================================================
-- Financial Charge Templates — Commercial Model (first-class configuration)
-- =============================================================================
-- A Charge Template defines HOW an operational fact or configured event becomes
-- a charge: what service it relates to, the charge category, what triggers it,
-- when it occurs, when it becomes billable, the default GL mapping + financial
-- responsibility, and whether review is required.
--
-- Doctrine: docs/platform/modules/financial-platform-domain.md
--   * Charge Template is commercial CONFIGURATION (L1) — never authoritative money.
--   * Charge is the lifecycle spine; Charge Event is a trigger fact (workflow_events).
--   * Posting is the only authoritative money write. This table posts nothing.
--   * Effective-dated supersede/change-later semantics (new version row + prior
--     effective_end closed the day before); never in-place overwrite of values.
--
-- HARD boundaries: no posting, no ledger/GL writes, no invoices/payments, no
-- charge generation. Configuration only. Generic platform shape.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.financial_charge_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    service_id uuid REFERENCES public.financial_services (id) ON DELETE SET NULL,
    template_key text NOT NULL,
    label text NOT NULL,
    description text,
    charge_category text NOT NULL,
    trigger_type text NOT NULL,
    trigger_key text,
    amount_strategy text NOT NULL,
    amount_cents bigint,
    currency_code text NOT NULL DEFAULT 'USD',
    occurs_on_strategy text NOT NULL DEFAULT 'now',
    billable_on_strategy text NOT NULL DEFAULT 'immediate',
    billable_offset_days integer,
    default_gl_mapping_key text,
    default_responsibility_key text,
    review_required boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    effective_start date NOT NULL,
    effective_end date,
    source_key text NOT NULL DEFAULT 'config',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT financial_charge_templates_key_nonempty CHECK (char_length(btrim(template_key)) > 0),
    CONSTRAINT financial_charge_templates_label_nonempty CHECK (char_length(btrim(label)) > 0),
    -- Charge category vocabulary mirrors the code-owned CHARGE_CATEGORIES
    -- (web/lib/financials/billableSource.ts). Keep aligned.
    CONSTRAINT financial_charge_templates_category_check
        CHECK (charge_category = ANY (ARRAY[
            'tuition'::text, 'deposit'::text, 'consumable_fee'::text, 'late_pickup'::text,
            'one_time'::text, 'discount'::text, 'credit'::text, 'adjustment'::text,
            'fee'::text, 'subsidy_offset'::text
        ])),
    CONSTRAINT financial_charge_templates_trigger_type_check
        CHECK (trigger_type = ANY (ARRAY['manual'::text, 'event'::text, 'attendance'::text, 'schedule'::text])),
    CONSTRAINT financial_charge_templates_amount_strategy_check
        CHECK (amount_strategy = ANY (ARRAY[
            'fixed'::text, 'rate_derived'::text, 'usage_derived'::text, 'attendance_derived'::text, 'manual'::text
        ])),
    CONSTRAINT financial_charge_templates_occurs_on_check
        CHECK (occurs_on_strategy = ANY (ARRAY['now'::text, 'event_date'::text, 'service_period_start'::text])),
    CONSTRAINT financial_charge_templates_billable_on_check
        CHECK (billable_on_strategy = ANY (ARRAY['immediate'::text, 'offset_days'::text, 'next_billing_cycle'::text])),
    -- A fixed-amount template must carry a non-negative amount; others must not.
    CONSTRAINT financial_charge_templates_amount_shape CHECK (
        (amount_strategy = 'fixed' AND amount_cents IS NOT NULL AND amount_cents >= 0)
        OR (amount_strategy <> 'fixed' AND amount_cents IS NULL)
    ),
    CONSTRAINT financial_charge_templates_offset_shape CHECK (
        (billable_on_strategy = 'offset_days' AND billable_offset_days IS NOT NULL AND billable_offset_days >= 0)
        OR (billable_on_strategy <> 'offset_days' AND billable_offset_days IS NULL)
    ),
    CONSTRAINT financial_charge_templates_end_after_start
        CHECK (effective_end IS NULL OR effective_end >= effective_start)
);

COMMENT ON TABLE public.financial_charge_templates IS
    'First-class commercial config (Charge Templates): how an operational fact/event becomes a charge — service, category, trigger, occurs-on/billable-on timing, default GL + responsibility, review. Effective-dated (supersede). Configuration only: posts nothing, writes no ledger/GL/invoice/payment.';
COMMENT ON COLUMN public.financial_charge_templates.billable_on_strategy IS
    'When a charge becomes billable: immediate | offset_days (billable_offset_days after occurs) | next_billing_cycle (placeholder; cadence resolution is future).';

CREATE INDEX IF NOT EXISTS idx_financial_charge_templates_org_key
    ON public.financial_charge_templates (org_id, template_key);
CREATE INDEX IF NOT EXISTS idx_financial_charge_templates_service
    ON public.financial_charge_templates (service_id) WHERE service_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_financial_charge_templates_updated_at ON public.financial_charge_templates;
CREATE TRIGGER trg_financial_charge_templates_updated_at
    BEFORE UPDATE ON public.financial_charge_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (config posture — mirrors the rate-plan / config-rule tables)
ALTER TABLE public.financial_charge_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_charge_templates_select_org ON public.financial_charge_templates;
CREATE POLICY financial_charge_templates_select_org ON public.financial_charge_templates FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS financial_charge_templates_insert_org ON public.financial_charge_templates;
CREATE POLICY financial_charge_templates_insert_org ON public.financial_charge_templates FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS financial_charge_templates_update_org ON public.financial_charge_templates;
CREATE POLICY financial_charge_templates_update_org ON public.financial_charge_templates FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS financial_charge_templates_delete_org ON public.financial_charge_templates;
CREATE POLICY financial_charge_templates_delete_org ON public.financial_charge_templates FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS financial_charge_templates_all_service_role ON public.financial_charge_templates;
CREATE POLICY financial_charge_templates_all_service_role ON public.financial_charge_templates FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financial_charge_templates TO authenticated;
GRANT ALL ON TABLE public.financial_charge_templates TO service_role;
