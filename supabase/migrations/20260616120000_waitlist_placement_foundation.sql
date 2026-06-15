-- =============================================================================
-- Repair: Waitlist placement foundation (schema gap)
-- =============================================================================
-- Context: 20260527140000_waitlist_orchestration_placement_foundation.sql was
-- applied to dev/staging out-of-band but never committed. Local `supabase db
-- reset` therefore lacks placement_* tables; 20260605100000 skips its queue
-- index when placement_candidates is absent.
--
-- Idempotent: safe on fresh local reset and on staging where tables may already
-- exist. Reconstructs DDL from docs/schema/schema-columns.md,
-- docs/supabase/reference/supabase_{constraints,indexes,functions,triggers}.csv,
-- and web/lib/orchestration/placement/placementCandidateTypes.ts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) placement_candidates — child × program/room cohort waitlist grain
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.placement_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    opportunity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
    opportunity_customer_member_id uuid REFERENCES public.opportunity_customer_members (id) ON DELETE SET NULL,
    customer_member_id uuid REFERENCES public.customer_members (id) ON DELETE SET NULL,
    person_id uuid REFERENCES public.persons (id) ON DELETE SET NULL,
    site_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
    is_synthetic_fallback boolean NOT NULL DEFAULT false,
    program_room_cohort_key text NOT NULL,
    program_room_group_label text,
    wait_since timestamptz,
    desired_start_date date,
    status text NOT NULL DEFAULT 'active',
    seed_key text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT placement_candidates_program_room_cohort_key_nonempty
        CHECK (char_length(btrim(program_room_cohort_key)) > 0),
    CONSTRAINT placement_candidates_status_check
        CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'withdrawn'::text, 'placed'::text])),
    CONSTRAINT placement_candidates_synthetic_identity_check
        CHECK (
            (is_synthetic_fallback = true
                AND opportunity_customer_member_id IS NULL
                AND customer_member_id IS NULL
                AND person_id IS NULL)
            OR (is_synthetic_fallback = false AND opportunity_customer_member_id IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_placement_candidates_org_cohort_status
    ON public.placement_candidates (org_id, program_room_cohort_key, status);
CREATE INDEX IF NOT EXISTS idx_placement_candidates_org_customer_member
    ON public.placement_candidates (org_id, customer_member_id)
    WHERE customer_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_placement_candidates_org_ocm
    ON public.placement_candidates (org_id, opportunity_customer_member_id)
    WHERE opportunity_customer_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_placement_candidates_org_opportunity
    ON public.placement_candidates (org_id, opportunity_id);
CREATE INDEX IF NOT EXISTS idx_placement_candidates_org_status
    ON public.placement_candidates (org_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS ux_placement_candidates_ocm_cohort_active
    ON public.placement_candidates (org_id, opportunity_customer_member_id, program_room_cohort_key)
    WHERE opportunity_customer_member_id IS NOT NULL
      AND status = ANY (ARRAY['active'::text, 'paused'::text]);
CREATE UNIQUE INDEX IF NOT EXISTS ux_placement_candidates_org_seed_key
    ON public.placement_candidates (org_id, seed_key)
    WHERE seed_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_placement_candidates_synthetic_cohort_active
    ON public.placement_candidates (org_id, opportunity_id, program_room_cohort_key)
    WHERE is_synthetic_fallback = true
      AND status = ANY (ARRAY['active'::text, 'paused'::text]);

-- Queue lane index (20260605100000 runs before this table exists on fresh reset).
CREATE INDEX IF NOT EXISTS idx_placement_candidates_org_status_opportunity
    ON public.placement_candidates (org_id, status, opportunity_id)
    WHERE status IN ('active', 'paused');

-- -----------------------------------------------------------------------------
-- 2) placement_link_groups — sibling / household link semantics
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.placement_link_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    opportunity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
    link_mode text NOT NULL DEFAULT 'independent',
    notes text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT placement_link_groups_link_mode_check
        CHECK (link_mode = ANY (ARRAY['independent'::text, 'preferred_together'::text, 'strictly_together'::text]))
);

CREATE INDEX IF NOT EXISTS idx_placement_link_groups_org_opportunity
    ON public.placement_link_groups (org_id, opportunity_id);

-- -----------------------------------------------------------------------------
-- 3) placement_link_group_members — group ↔ candidate membership
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.placement_link_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    placement_link_group_id uuid NOT NULL REFERENCES public.placement_link_groups (id) ON DELETE CASCADE,
    placement_candidate_id uuid NOT NULL REFERENCES public.placement_candidates (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_placement_link_group_members_group_candidate
        UNIQUE (placement_link_group_id, placement_candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_placement_link_group_members_org_candidate
    ON public.placement_link_group_members (org_id, placement_candidate_id);
CREATE INDEX IF NOT EXISTS idx_placement_link_group_members_org_group
    ON public.placement_link_group_members (org_id, placement_link_group_id);

-- -----------------------------------------------------------------------------
-- 4) placement_overrides — manual pin / tier / temporary adjustments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.placement_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    placement_candidate_id uuid NOT NULL REFERENCES public.placement_candidates (id) ON DELETE CASCADE,
    program_room_cohort_key text NOT NULL,
    override_kind text NOT NULL,
    reason text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    expires_at timestamptz,
    created_by uuid NOT NULL,
    released_by uuid,
    released_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT placement_overrides_cohort_key_nonempty
        CHECK (char_length(btrim(program_room_cohort_key)) > 0),
    CONSTRAINT placement_overrides_kind_check
        CHECK (override_kind = ANY (ARRAY['pin'::text, 'tier_boost'::text, 'temporary'::text])),
    CONSTRAINT placement_overrides_reason_nonempty
        CHECK (char_length(btrim(reason)) > 0),
    CONSTRAINT placement_overrides_temporary_requires_expires
        CHECK (override_kind <> 'temporary'::text OR expires_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_placement_overrides_org_candidate
    ON public.placement_overrides (org_id, placement_candidate_id);
CREATE INDEX IF NOT EXISTS idx_placement_overrides_org_cohort_active
    ON public.placement_overrides (org_id, program_room_cohort_key)
    WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_placement_overrides_one_active_pin
    ON public.placement_overrides (org_id, placement_candidate_id, program_room_cohort_key, override_kind)
    WHERE is_active = true AND override_kind = 'pin'::text;

-- -----------------------------------------------------------------------------
-- 5) Integrity validation triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_placement_candidates_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    opp_org uuid;
    opp_customer uuid;
    ocm_org uuid;
    ocm_opp uuid;
    ocm_member uuid;
    mem_org uuid;
    mem_customer uuid;
    person_org uuid;
    site_org uuid;
BEGIN
    SELECT o.org_id, o.customer_id
    INTO opp_org, opp_customer
    FROM public.opportunities o
    WHERE o.id = NEW.opportunity_id;

    IF opp_org IS NULL THEN
        RAISE EXCEPTION 'placement_candidates: opportunity_id % not found', NEW.opportunity_id
            USING ERRCODE = '23503';
    END IF;
    IF opp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'placement_candidates: org_id mismatch with opportunity'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.customer_id IS NOT NULL AND opp_customer IS NOT NULL AND NEW.customer_id <> opp_customer THEN
        RAISE EXCEPTION 'placement_candidates: customer_id does not match opportunity.customer_id'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.opportunity_customer_member_id IS NOT NULL THEN
        SELECT ocm.org_id, ocm.opportunity_id, ocm.customer_member_id
        INTO ocm_org, ocm_opp, ocm_member
        FROM public.opportunity_customer_members ocm
        WHERE ocm.id = NEW.opportunity_customer_member_id;

        IF ocm_org IS NULL THEN
            RAISE EXCEPTION 'placement_candidates: opportunity_customer_member_id % not found', NEW.opportunity_customer_member_id
                USING ERRCODE = '23503';
        END IF;
        IF ocm_org <> NEW.org_id OR ocm_opp <> NEW.opportunity_id THEN
            RAISE EXCEPTION 'placement_candidates: OCM org/opportunity mismatch'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.customer_member_id IS NULL THEN
            NEW.customer_member_id := ocm_member;
        ELSIF NEW.customer_member_id <> ocm_member THEN
            RAISE EXCEPTION 'placement_candidates: customer_member_id does not match OCM row'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.customer_member_id IS NOT NULL THEN
        SELECT cm.org_id, cm.customer_id
        INTO mem_org, mem_customer
        FROM public.customer_members cm
        WHERE cm.id = NEW.customer_member_id;

        IF mem_org IS NULL THEN
            RAISE EXCEPTION 'placement_candidates: customer_member_id % not found', NEW.customer_member_id
                USING ERRCODE = '23503';
        END IF;
        IF mem_org <> NEW.org_id THEN
            RAISE EXCEPTION 'placement_candidates: customer_member org mismatch'
                USING ERRCODE = '23514';
        END IF;
        IF opp_customer IS NOT NULL AND mem_customer IS NOT NULL AND mem_customer <> opp_customer THEN
            RAISE EXCEPTION 'placement_candidates: customer_member customer mismatch with opportunity'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.person_id IS NULL THEN
            SELECT cm.person_id INTO NEW.person_id
            FROM public.customer_members cm
            WHERE cm.id = NEW.customer_member_id;
        END IF;
    END IF;

    IF NEW.person_id IS NOT NULL THEN
        SELECT p.org_id INTO person_org FROM public.persons p WHERE p.id = NEW.person_id;
        IF person_org IS NULL THEN
            RAISE EXCEPTION 'placement_candidates: person_id % not found', NEW.person_id USING ERRCODE = '23503';
        END IF;
        IF person_org <> NEW.org_id THEN
            RAISE EXCEPTION 'placement_candidates: person org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.site_id IS NOT NULL THEN
        SELECT l.org_id INTO site_org FROM public.locations l WHERE l.id = NEW.site_id;
        IF site_org IS NULL THEN
            RAISE EXCEPTION 'placement_candidates: site_id % not found', NEW.site_id USING ERRCODE = '23503';
        END IF;
        IF site_org <> NEW.org_id THEN
            RAISE EXCEPTION 'placement_candidates: site org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_placement_link_groups_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    opp_org uuid;
    opp_customer uuid;
BEGIN
    SELECT o.org_id, o.customer_id INTO opp_org, opp_customer
    FROM public.opportunities o WHERE o.id = NEW.opportunity_id;

    IF opp_org IS NULL THEN
        RAISE EXCEPTION 'placement_link_groups: opportunity_id % not found', NEW.opportunity_id USING ERRCODE = '23503';
    END IF;
    IF opp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'placement_link_groups: org_id mismatch' USING ERRCODE = '23514';
    END IF;
    IF NEW.customer_id IS NOT NULL AND opp_customer IS NOT NULL AND NEW.customer_id <> opp_customer THEN
        RAISE EXCEPTION 'placement_link_groups: customer_id mismatch' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_placement_link_group_members_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    grp_org uuid;
    grp_opp uuid;
    cand_org uuid;
    cand_opp uuid;
BEGIN
    SELECT g.org_id, g.opportunity_id INTO grp_org, grp_opp
    FROM public.placement_link_groups g WHERE g.id = NEW.placement_link_group_id;

    IF grp_org IS NULL THEN
        RAISE EXCEPTION 'placement_link_group_members: group % not found', NEW.placement_link_group_id USING ERRCODE = '23503';
    END IF;

    SELECT c.org_id, c.opportunity_id INTO cand_org, cand_opp
    FROM public.placement_candidates c WHERE c.id = NEW.placement_candidate_id;

    IF cand_org IS NULL THEN
        RAISE EXCEPTION 'placement_link_group_members: candidate % not found', NEW.placement_candidate_id USING ERRCODE = '23503';
    END IF;

    IF NEW.org_id <> grp_org OR NEW.org_id <> cand_org THEN
        RAISE EXCEPTION 'placement_link_group_members: org_id mismatch' USING ERRCODE = '23514';
    END IF;
    IF grp_opp <> cand_opp THEN
        RAISE EXCEPTION 'placement_link_group_members: group and candidate opportunity mismatch' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_placement_overrides_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    cand_org uuid;
    cand_cohort text;
BEGIN
    SELECT c.org_id, c.program_room_cohort_key
    INTO cand_org, cand_cohort
    FROM public.placement_candidates c
    WHERE c.id = NEW.placement_candidate_id;

    IF cand_org IS NULL THEN
        RAISE EXCEPTION 'placement_overrides: candidate % not found', NEW.placement_candidate_id USING ERRCODE = '23503';
    END IF;
    IF cand_org <> NEW.org_id THEN
        RAISE EXCEPTION 'placement_overrides: org_id mismatch' USING ERRCODE = '23514';
    END IF;
    IF btrim(NEW.program_room_cohort_key) <> btrim(cand_cohort) THEN
        RAISE EXCEPTION 'placement_overrides: program_room_cohort_key must match candidate cohort'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_placement_candidates_updated_at ON public.placement_candidates;
CREATE TRIGGER trg_placement_candidates_updated_at
    BEFORE UPDATE ON public.placement_candidates
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_validate_placement_candidates_consistency ON public.placement_candidates;
CREATE TRIGGER trg_validate_placement_candidates_consistency
    BEFORE INSERT OR UPDATE ON public.placement_candidates
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_placement_candidates_consistency();

DROP TRIGGER IF EXISTS trg_placement_link_groups_updated_at ON public.placement_link_groups;
CREATE TRIGGER trg_placement_link_groups_updated_at
    BEFORE UPDATE ON public.placement_link_groups
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_validate_placement_link_groups_consistency ON public.placement_link_groups;
CREATE TRIGGER trg_validate_placement_link_groups_consistency
    BEFORE INSERT OR UPDATE ON public.placement_link_groups
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_placement_link_groups_consistency();

DROP TRIGGER IF EXISTS trg_validate_placement_link_group_members_consistency ON public.placement_link_group_members;
CREATE TRIGGER trg_validate_placement_link_group_members_consistency
    BEFORE INSERT OR UPDATE ON public.placement_link_group_members
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_placement_link_group_members_consistency();

DROP TRIGGER IF EXISTS trg_placement_overrides_updated_at ON public.placement_overrides;
CREATE TRIGGER trg_placement_overrides_updated_at
    BEFORE UPDATE ON public.placement_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_validate_placement_overrides_consistency ON public.placement_overrides;
CREATE TRIGGER trg_validate_placement_overrides_consistency
    BEFORE INSERT OR UPDATE ON public.placement_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_placement_overrides_consistency();

-- -----------------------------------------------------------------------------
-- 6) Row Level Security (org read; owner/admin/ops mutate; service_role ALL)
-- -----------------------------------------------------------------------------
ALTER TABLE public.placement_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_link_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_link_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_overrides ENABLE ROW LEVEL SECURITY;

-- placement_candidates
DROP POLICY IF EXISTS placement_candidates_select_org ON public.placement_candidates;
CREATE POLICY placement_candidates_select_org
    ON public.placement_candidates
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_candidates.org_id
        )
    );

DROP POLICY IF EXISTS placement_candidates_mutate_crm ON public.placement_candidates;
CREATE POLICY placement_candidates_mutate_crm
    ON public.placement_candidates
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_candidates.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_candidates.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS placement_candidates_service_all ON public.placement_candidates;
CREATE POLICY placement_candidates_service_all
    ON public.placement_candidates
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- placement_link_groups
DROP POLICY IF EXISTS placement_link_groups_select_org ON public.placement_link_groups;
CREATE POLICY placement_link_groups_select_org
    ON public.placement_link_groups
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_link_groups.org_id
        )
    );

DROP POLICY IF EXISTS placement_link_groups_mutate_crm ON public.placement_link_groups;
CREATE POLICY placement_link_groups_mutate_crm
    ON public.placement_link_groups
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_link_groups.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_link_groups.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS placement_link_groups_service_all ON public.placement_link_groups;
CREATE POLICY placement_link_groups_service_all
    ON public.placement_link_groups
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- placement_link_group_members
DROP POLICY IF EXISTS placement_link_group_members_select_org ON public.placement_link_group_members;
CREATE POLICY placement_link_group_members_select_org
    ON public.placement_link_group_members
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_link_group_members.org_id
        )
    );

DROP POLICY IF EXISTS placement_link_group_members_mutate_crm ON public.placement_link_group_members;
CREATE POLICY placement_link_group_members_mutate_crm
    ON public.placement_link_group_members
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_link_group_members.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_link_group_members.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS placement_link_group_members_service_all ON public.placement_link_group_members;
CREATE POLICY placement_link_group_members_service_all
    ON public.placement_link_group_members
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- placement_overrides
DROP POLICY IF EXISTS placement_overrides_select_org ON public.placement_overrides;
CREATE POLICY placement_overrides_select_org
    ON public.placement_overrides
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_overrides.org_id
        )
    );

DROP POLICY IF EXISTS placement_overrides_mutate_crm ON public.placement_overrides;
CREATE POLICY placement_overrides_mutate_crm
    ON public.placement_overrides
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_overrides.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = placement_overrides.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS placement_overrides_service_all ON public.placement_overrides;
CREATE POLICY placement_overrides_service_all
    ON public.placement_overrides
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));
