-- =============================================================================
-- Charge lifecycle: occurs_on / billable_on + Charge Template link (Slice D)
-- =============================================================================
-- Promotes `charges` toward the Charge lifecycle spine from the frozen Financial
-- Platform doctrine. A template-driven draft charge carries WHEN it occurs and
-- WHEN it becomes billable (which may diverge — e.g. a field trip occurs today
-- but is billable in 21 days), and a link back to the Charge Template + Service.
--
-- Doctrine: docs/platform/modules/financial-platform-domain.md
--   * Charge is the lifecycle spine; Charge Template is configuration.
--   * Resolution is recomputable; Posting is the ONLY authoritative money write.
--   * Posted charges are never mutated (existing immutability trigger unchanged).
--
-- ADDITIVE ONLY. The frozen `status` / `charge_type` / `charge_category` CHECKs,
-- RLS, and the posted-charge immutability trigger are untouched. "Scheduled" vs
-- "draft/billable" is DERIVED (billable_on > today => scheduled), so no new
-- status value is introduced. No parallel charge table. No invoices/ledger/AR.
-- =============================================================================

ALTER TABLE public.charges
    ADD COLUMN IF NOT EXISTS occurs_on date,
    ADD COLUMN IF NOT EXISTS billable_on date,
    ADD COLUMN IF NOT EXISTS charge_template_id uuid
        REFERENCES public.financial_charge_templates (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS service_id uuid
        REFERENCES public.financial_services (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.charges.occurs_on IS
    'Lifecycle: the date the chargeable event occurs (Charge Template occurs_on_strategy). Distinct from service_date and posted_at.';
COMMENT ON COLUMN public.charges.billable_on IS
    'Lifecycle: the date the charge becomes billable (template billable_on_strategy). A draft with billable_on in the future is "scheduled"; status stays draft until Posting (separate, authoritative).';
COMMENT ON COLUMN public.charges.charge_template_id IS
    'Source Charge Template (Commercial Model). Nullable; tuition drafts resolved from rate plans carry none.';

CREATE INDEX IF NOT EXISTS idx_charges_org_billable_on
    ON public.charges (org_id, billable_on) WHERE billable_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_charges_charge_template
    ON public.charges (charge_template_id) WHERE charge_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_charges_org_service
    ON public.charges (org_id, service_id) WHERE service_id IS NOT NULL;
