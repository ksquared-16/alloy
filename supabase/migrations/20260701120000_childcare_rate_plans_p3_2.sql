-- =============================================================================
-- Childcare rate plans + rate rules — P3.2 (Rate configuration for Rate Resolution)
-- =============================================================================
-- First-class pricing CONFIGURATION (L1) that sits ABOVE the P3.1 posting
-- substrate. Defines what rate plan/rule applies for a given
-- org/site/program/room/age-group/schedule/date. This is Rate *configuration*;
-- Rate *Resolution* is the pure read model over it
-- (web/lib/financials/rates/resolveRate.ts).
--
-- Doctrine: docs/platform/modules/billing-financials-platform.md (Rate Resolution),
--           docs/sprints/06_2026/operational_execution_p3_financial_resolution_planning.md
--
-- Shared scope model (most-specific-wins): org default -> site -> program -> room,
-- reusing public.validate_childcare_config_scope() and the same scope columns as
-- the P1 config-rule tables. A shared age_group_key may narrow further.
--
-- HARD boundaries (P3.2):
--   * Rate Resolution is NOT Charge Resolution. Nothing here writes to `charges`,
--     `ledger_transactions`, `gl_journal_lines`, invoices, or AR.
--   * No posting side effects. No subsidy. No proration/cadence implementation —
--     only nullable hook columns.
--   * No job-vertical coupling: references only orgs, locations,
--     location_program_categories, and these tables.
--   * Single currency per plan; rate rules inherit the plan currency (no
--     per-rule currency column) so cross-currency composition is impossible.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) childcare_rate_plans — scoped, effective-dated pricing container
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.childcare_rate_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    scope_type text NOT NULL,
    site_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    program_category_id uuid REFERENCES public.location_program_categories (id) ON DELETE CASCADE,
    room_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    age_group_key text,
    plan_key text NOT NULL,
    label text,
    currency_code text NOT NULL DEFAULT 'USD',
    billing_basis text NOT NULL,
    calculation_strategy text NOT NULL DEFAULT 'scheduled',
    -- Proration / cadence are HOOKS ONLY in P3.2 (nullable; not yet implemented).
    proration_method text,
    billing_cadence text,
    is_active boolean NOT NULL DEFAULT true,
    effective_start date NOT NULL,
    effective_end date,
    source_key text NOT NULL DEFAULT 'config',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT childcare_rate_plans_scope_type_check
        CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])),
    CONSTRAINT childcare_rate_plans_plan_key_nonempty CHECK (char_length(btrim(plan_key)) > 0),
    CONSTRAINT childcare_rate_plans_currency_nonempty CHECK (char_length(btrim(currency_code)) > 0),
    CONSTRAINT childcare_rate_plans_billing_basis_check
        CHECK (billing_basis = ANY (ARRAY[
            'annual'::text, 'monthly'::text, 'weekly'::text,
            'daily'::text, 'session'::text, 'hourly'::text
        ])),
    CONSTRAINT childcare_rate_plans_calculation_strategy_check
        CHECK (calculation_strategy = ANY (ARRAY[
            'scheduled'::text, 'attendance_actual'::text, 'hybrid'::text, 'fixed'::text
        ])),
    -- Hook columns: when present, must use the reserved vocabulary (forward-safe).
    CONSTRAINT childcare_rate_plans_proration_method_check
        CHECK (proration_method IS NULL OR proration_method = ANY (ARRAY[
            'none'::text, 'daily'::text, 'calendar_day'::text, 'business_day'::text
        ])),
    CONSTRAINT childcare_rate_plans_billing_cadence_check
        CHECK (billing_cadence IS NULL OR billing_cadence = ANY (ARRAY[
            'monthly'::text, 'semi_monthly'::text, 'biweekly'::text, 'weekly'::text, 'term'::text
        ])),
    CONSTRAINT childcare_rate_plans_end_after_start
        CHECK (effective_end IS NULL OR effective_end >= effective_start),
    CONSTRAINT childcare_rate_plans_scope_shape CHECK (
        (scope_type = 'org' AND site_location_id IS NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'site' AND site_location_id IS NOT NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'program' AND program_category_id IS NOT NULL AND site_location_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'room' AND room_location_id IS NOT NULL AND site_location_id IS NULL AND program_category_id IS NULL)
    )
);

COMMENT ON TABLE public.childcare_rate_plans IS
    'First-class pricing config (P3.2): scoped org->site->program->room, age-group-narrowable, effective-dated. Carries explicit currency_code, billing_basis, and calculation_strategy. Rate Resolution (pure) reads this; it does NOT generate charges or post. Proration/cadence are hooks only.';
COMMENT ON COLUMN public.childcare_rate_plans.calculation_strategy IS
    'How a future Charge Resolution should compute amounts: scheduled | attendance_actual | hybrid | fixed. Declared here; not executed in P3.2.';
COMMENT ON COLUMN public.childcare_rate_plans.proration_method IS
    'HOOK ONLY (P3.2): reserved proration vocabulary; no proration is implemented yet.';
COMMENT ON COLUMN public.childcare_rate_plans.billing_cadence IS
    'HOOK ONLY (P3.2): reserved cadence vocabulary; no cadence/scheduling is implemented yet.';

CREATE INDEX IF NOT EXISTS idx_childcare_rate_plans_org_scope
    ON public.childcare_rate_plans (org_id, scope_type);
CREATE INDEX IF NOT EXISTS idx_childcare_rate_plans_org_site
    ON public.childcare_rate_plans (org_id, site_location_id) WHERE site_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_childcare_rate_plans_org_program
    ON public.childcare_rate_plans (org_id, program_category_id) WHERE program_category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_childcare_rate_plans_org_room
    ON public.childcare_rate_plans (org_id, room_location_id) WHERE room_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_childcare_rate_plans_org_plan_key
    ON public.childcare_rate_plans (org_id, plan_key);

-- -----------------------------------------------------------------------------
-- 2) childcare_rate_rules — priced lines within a plan, keyed by schedule basis
-- -----------------------------------------------------------------------------
-- A rule prices one schedule basis (full_day / half_day / three_day / four_day /
-- five_day / hourly / drop_in) expressed in a rate basis (annual / monthly /
-- weekly / daily / session / hourly). Currency is inherited from the parent plan
-- (no per-rule currency) so a plan can never mix currencies.
CREATE TABLE IF NOT EXISTS public.childcare_rate_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    rate_plan_id uuid NOT NULL REFERENCES public.childcare_rate_plans (id) ON DELETE CASCADE,
    schedule_basis text NOT NULL,
    rate_basis text NOT NULL,
    age_group_key text,
    amount_cents bigint NOT NULL,
    effective_start date NOT NULL,
    effective_end date,
    source_key text NOT NULL DEFAULT 'config',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT childcare_rate_rules_schedule_basis_check
        CHECK (schedule_basis = ANY (ARRAY[
            'full_day'::text, 'half_day'::text,
            'three_day'::text, 'four_day'::text, 'five_day'::text,
            'hourly'::text, 'drop_in'::text
        ])),
    CONSTRAINT childcare_rate_rules_rate_basis_check
        CHECK (rate_basis = ANY (ARRAY[
            'annual'::text, 'monthly'::text, 'weekly'::text,
            'daily'::text, 'session'::text, 'hourly'::text
        ])),
    CONSTRAINT childcare_rate_rules_amount_nonneg CHECK (amount_cents >= 0),
    CONSTRAINT childcare_rate_rules_end_after_start
        CHECK (effective_end IS NULL OR effective_end >= effective_start)
);

COMMENT ON TABLE public.childcare_rate_rules IS
    'Priced lines within a childcare_rate_plan (P3.2), keyed by schedule_basis and expressed in a rate_basis, effective-dated and age-group-narrowable. Currency is inherited from the parent plan. Read by Rate Resolution; never generates charges or posts.';

CREATE INDEX IF NOT EXISTS idx_childcare_rate_rules_plan_basis
    ON public.childcare_rate_rules (rate_plan_id, schedule_basis);
CREATE INDEX IF NOT EXISTS idx_childcare_rate_rules_org
    ON public.childcare_rate_rules (org_id);
CREATE INDEX IF NOT EXISTS idx_childcare_rate_rules_org_age_group
    ON public.childcare_rate_rules (org_id, age_group_key) WHERE age_group_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) Rate-rule consistency: org must match the parent plan's org.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_childcare_rate_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    plan_org uuid;
BEGIN
    SELECT p.org_id INTO plan_org
    FROM public.childcare_rate_plans p WHERE p.id = NEW.rate_plan_id;
    IF plan_org IS NULL THEN
        RAISE EXCEPTION 'childcare rate rule: rate_plan_id % not found', NEW.rate_plan_id
            USING ERRCODE = '23503';
    END IF;
    IF plan_org <> NEW.org_id THEN
        RAISE EXCEPTION 'childcare rate rule: org_id must match parent rate plan org' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4) Triggers: scope validation (plans) + rule consistency + updated_at
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_validate_childcare_rate_plans_scope ON public.childcare_rate_plans;
CREATE TRIGGER trg_validate_childcare_rate_plans_scope
    BEFORE INSERT OR UPDATE ON public.childcare_rate_plans
    FOR EACH ROW EXECUTE FUNCTION public.validate_childcare_config_scope();

DROP TRIGGER IF EXISTS trg_validate_childcare_rate_rule ON public.childcare_rate_rules;
CREATE TRIGGER trg_validate_childcare_rate_rule
    BEFORE INSERT OR UPDATE ON public.childcare_rate_rules
    FOR EACH ROW EXECUTE FUNCTION public.validate_childcare_rate_rule();

DROP TRIGGER IF EXISTS trg_childcare_rate_plans_updated_at ON public.childcare_rate_plans;
CREATE TRIGGER trg_childcare_rate_plans_updated_at
    BEFORE UPDATE ON public.childcare_rate_plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_childcare_rate_rules_updated_at ON public.childcare_rate_rules;
CREATE TRIGGER trg_childcare_rate_rules_updated_at
    BEFORE UPDATE ON public.childcare_rate_rules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5) RLS (config posture — mirrors the P1 config-rule tables)
-- -----------------------------------------------------------------------------
ALTER TABLE public.childcare_rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.childcare_rate_rules ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
    rate_tables text[] := ARRAY['childcare_rate_plans', 'childcare_rate_rules'];
BEGIN
    FOREACH tbl IN ARRAY rate_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_select_org ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_select_org ON public.%I FOR SELECT TO authenticated '
            || 'USING (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text, ''manager''::text]));',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS %I_insert_org ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_insert_org ON public.%I FOR INSERT TO authenticated '
            || 'WITH CHECK (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text]));',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS %I_update_org ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_update_org ON public.%I FOR UPDATE TO authenticated '
            || 'USING (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text])) '
            || 'WITH CHECK (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text]));',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS %I_delete_org ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_delete_org ON public.%I FOR DELETE TO authenticated '
            || 'USING (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text]));',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS %I_all_service_role ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_all_service_role ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
            tbl, tbl
        );

        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', tbl);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', tbl);
    END LOOP;
END $$;
