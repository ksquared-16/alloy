-- =============================================================================
-- Childcare MVP — Opportunity ↔ Child linkage foundation
-- =============================================================================
-- Product requirement: one Inquiry/Opportunity may include multiple sibling children
-- under the same Family/Customer. We model this as a small join table:
--   public.opportunity_customer_members
--
-- Semantics:
-- - Opportunity-level desired defaults remain on opportunities via field_values:
--     opportunities.program_type (childcare_program_type)
--     opportunities.schedule_type (childcare_schedule_type)
-- - Child-level join may override:
--     desired_program_type, desired_schedule_type
--   When NULL, UI/API should inherit the opportunity defaults.
--
-- Integrity:
-- - Join is org-scoped (org_id)
-- - Enforce same-org and same-family consistency via trigger:
--     opportunity.org_id == row.org_id
--     customer_member.org_id == row.org_id
--     customer_member.customer_id == opportunity.customer_id (when opportunity.customer_id is set)
--
-- Access control:
-- - Mirrors existing pattern: enable RLS and add admin/ops full access policy.
--
-- Idempotent:
-- - CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS
-- - Constraints/triggers/policies are dropped/created in an idempotent way
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.opportunity_customer_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    opportunity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    customer_member_id uuid NOT NULL REFERENCES public.customer_members (id) ON DELETE CASCADE,
    desired_program_type text,
    desired_schedule_type text,
    fit_status text,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz
);

-- -----------------------------------------------------------------------------
-- Constraints (idempotent via catalogs)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_opportunity_customer_members_unique'
          AND conrelid = 'public.opportunity_customer_members'::regclass
    ) THEN
        ALTER TABLE public.opportunity_customer_members
            ADD CONSTRAINT uq_opportunity_customer_members_unique
            UNIQUE (org_id, opportunity_id, customer_member_id);
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_opportunity_customer_members_org_opportunity
    ON public.opportunity_customer_members (org_id, opportunity_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_customer_members_org_customer_member
    ON public.opportunity_customer_members (org_id, customer_member_id);

-- -----------------------------------------------------------------------------
-- Same-org + same-family enforcement (trigger)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_opportunity_customer_members_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    opp_org uuid;
    opp_customer uuid;
    mem_org uuid;
    mem_customer uuid;
BEGIN
    SELECT o.org_id, o.customer_id
    INTO opp_org, opp_customer
    FROM public.opportunities o
    WHERE o.id = NEW.opportunity_id;

    IF opp_org IS NULL THEN
        RAISE EXCEPTION 'opportunity_customer_members: opportunity_id % not found', NEW.opportunity_id;
    END IF;
    IF opp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'opportunity_customer_members: org_id mismatch (row %, opp %)', NEW.org_id, opp_org;
    END IF;

    SELECT cm.org_id, cm.customer_id
    INTO mem_org, mem_customer
    FROM public.customer_members cm
    WHERE cm.id = NEW.customer_member_id;

    IF mem_org IS NULL THEN
        RAISE EXCEPTION 'opportunity_customer_members: customer_member_id % not found', NEW.customer_member_id;
    END IF;
    IF mem_org <> NEW.org_id THEN
        RAISE EXCEPTION 'opportunity_customer_members: org_id mismatch (row %, member %)', NEW.org_id, mem_org;
    END IF;

    -- If the opportunity is linked to a family/customer, enforce member belongs to same family.
    IF opp_customer IS NOT NULL AND mem_customer IS NOT NULL AND mem_customer <> opp_customer THEN
        RAISE EXCEPTION 'opportunity_customer_members: customer_member.customer_id % does not match opportunity.customer_id %', mem_customer, opp_customer;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_opportunity_customer_members_consistency ON public.opportunity_customer_members;
CREATE TRIGGER trg_validate_opportunity_customer_members_consistency
BEFORE INSERT OR UPDATE ON public.opportunity_customer_members
FOR EACH ROW EXECUTE FUNCTION public.validate_opportunity_customer_members_consistency();

-- updated_at trigger (uses shared helper)
DROP TRIGGER IF EXISTS trg_opportunity_customer_members_updated_at ON public.opportunity_customer_members;
CREATE TRIGGER trg_opportunity_customer_members_updated_at
BEFORE UPDATE ON public.opportunity_customer_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS + policies (mirror existing admin/ops full access pattern)
-- -----------------------------------------------------------------------------
ALTER TABLE public.opportunity_customer_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_ops_full_access" ON public.opportunity_customer_members;
CREATE POLICY "admin_ops_full_access" ON public.opportunity_customer_members
USING (
    EXISTS (
        SELECT 1
        FROM public.app_users au
        WHERE au.id = auth.uid()
          AND au.role = ANY (ARRAY['admin'::text, 'ops'::text])
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.app_users au
        WHERE au.id = auth.uid()
          AND au.role = ANY (ARRAY['admin'::text, 'ops'::text])
    )
);

GRANT ALL ON TABLE public.opportunity_customer_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opportunity_customer_members TO authenticated;

-- -----------------------------------------------------------------------------
-- Verification queries (run manually after migrate)
-- -----------------------------------------------------------------------------
-- 1) Table exists and indexes
--   \\d public.opportunity_customer_members
--
-- 2) Consistency trigger sanity (should error if cross-family link attempted)
--   -- insert ... with mismatched opportunity/customer_member
--
-- 3) Row inspection
--   SELECT * FROM public.opportunity_customer_members WHERE org_id = '<org>'::uuid ORDER BY created_at DESC LIMIT 25;

