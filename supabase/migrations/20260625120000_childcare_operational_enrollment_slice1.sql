-- =============================================================================
-- Childcare operational enrollment — slice 1 (schema only)
-- =============================================================================
-- Tables: child_enrollment_agreements, child_placements, schedule_patterns,
--         schedule_assignments
-- Doctrine: placements domain = child_placements (not placement_candidates).
-- Childcare schedules = schedule_patterns / schedule_assignments (not job schedules).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) child_enrollment_agreements — operational contract per child × site
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.child_enrollment_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    opportunity_id uuid REFERENCES public.opportunities (id) ON DELETE SET NULL,
    opportunity_customer_member_id uuid REFERENCES public.opportunity_customer_members (id) ON DELETE SET NULL,
    customer_member_id uuid NOT NULL REFERENCES public.customer_members (id) ON DELETE RESTRICT,
    customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
    person_id uuid REFERENCES public.persons (id) ON DELETE SET NULL,
    site_location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
    status text NOT NULL,
    start_date date,
    end_date date,
    activation_policy_key text,
    source_key text NOT NULL DEFAULT 'manual',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT child_enrollment_agreements_status_check
        CHECK (
            status = ANY (
                ARRAY[
                    'pending_start'::text,
                    'active'::text,
                    'ending'::text,
                    'ended'::text,
                    'canceled'::text
                ]
            )
        ),
    CONSTRAINT child_enrollment_agreements_end_after_start
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    CONSTRAINT child_enrollment_agreements_source_key_nonempty
        CHECK (char_length(btrim(source_key)) > 0)
);

COMMENT ON TABLE public.child_enrollment_agreements IS
    'Operational childcare enrollment contract per customer_member × site. History preserved; one non-ended row per child per site.';

COMMENT ON COLUMN public.child_enrollment_agreements.status IS
    'pending_start=enrolled not started; active=attending; ending=active with scheduled end; ended=completed/withdrawn; canceled=before start.';

COMMENT ON COLUMN public.child_enrollment_agreements.opportunity_id IS
    'Nullable for manual/import/re-enrollment paths without opportunity provenance.';

COMMENT ON COLUMN public.child_enrollment_agreements.opportunity_customer_member_id IS
    'Nullable when agreement not created from inquiry child row.';

CREATE INDEX IF NOT EXISTS idx_child_enrollment_agreements_org_member
    ON public.child_enrollment_agreements (org_id, customer_member_id);

CREATE INDEX IF NOT EXISTS idx_child_enrollment_agreements_org_site_status
    ON public.child_enrollment_agreements (org_id, site_location_id, status);

CREATE INDEX IF NOT EXISTS idx_child_enrollment_agreements_org_ocm
    ON public.child_enrollment_agreements (org_id, opportunity_customer_member_id)
    WHERE opportunity_customer_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_child_enrollment_agreements_org_opportunity
    ON public.child_enrollment_agreements (org_id, opportunity_id)
    WHERE opportunity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_child_enrollment_agreements_one_operational_per_member_site
    ON public.child_enrollment_agreements (org_id, customer_member_id, site_location_id)
    WHERE status = ANY (ARRAY['pending_start'::text, 'active'::text, 'ending'::text]);

-- -----------------------------------------------------------------------------
-- 2) child_placements — effective-dated site/program/room history
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.child_placements (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    enrollment_agreement_id uuid NOT NULL
        REFERENCES public.child_enrollment_agreements (id) ON DELETE CASCADE,
    customer_member_id uuid NOT NULL REFERENCES public.customer_members (id) ON DELETE RESTRICT,
    site_location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
    program_category_id uuid
        REFERENCES public.location_program_categories (id) ON DELETE SET NULL,
    room_location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
    start_date date NOT NULL,
    end_date date,
    status text NOT NULL,
    reason_key text,
    source_key text NOT NULL DEFAULT 'operator',
    supersedes_placement_id uuid REFERENCES public.child_placements (id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT child_placements_status_check
        CHECK (
            status = ANY (
                ARRAY[
                    'planned'::text,
                    'active'::text,
                    'ending'::text,
                    'ended'::text,
                    'superseded'::text,
                    'canceled'::text
                ]
            )
        ),
    CONSTRAINT child_placements_end_after_start
        CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT child_placements_source_key_nonempty
        CHECK (char_length(btrim(source_key)) > 0)
);

COMMENT ON TABLE public.child_placements IS
    'Effective-dated placement history (site/program/room) per enrollment agreement.';

CREATE INDEX IF NOT EXISTS idx_child_placements_org_agreement
    ON public.child_placements (org_id, enrollment_agreement_id);

CREATE INDEX IF NOT EXISTS idx_child_placements_org_member_dates
    ON public.child_placements (org_id, customer_member_id, start_date);

CREATE UNIQUE INDEX IF NOT EXISTS ux_child_placements_one_operational_per_agreement
    ON public.child_placements (org_id, enrollment_agreement_id)
    WHERE status = ANY (ARRAY['planned'::text, 'active'::text, 'ending'::text]);

-- -----------------------------------------------------------------------------
-- 3) schedule_patterns — site-scoped schedule offering catalog
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    site_location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    schedule_type_key text NOT NULL,
    weekdays smallint[] NOT NULL,
    sort_order integer NOT NULL DEFAULT 100,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz,
    CONSTRAINT schedule_patterns_org_site_key_unique
        UNIQUE (org_id, site_location_id, key),
    CONSTRAINT schedule_patterns_key_nonempty
        CHECK (char_length(btrim(key)) > 0),
    CONSTRAINT schedule_patterns_label_nonempty
        CHECK (char_length(btrim(label)) > 0),
    CONSTRAINT schedule_patterns_schedule_type_key_nonempty
        CHECK (char_length(btrim(schedule_type_key)) > 0),
    CONSTRAINT schedule_patterns_weekdays_nonempty
        CHECK (cardinality(weekdays) > 0)
);

COMMENT ON TABLE public.schedule_patterns IS
    'Site-owned childcare schedule pattern catalog (not job schedules). Aligns schedule_type_key with childcare_schedule_type option set.';

COMMENT ON COLUMN public.schedule_patterns.weekdays IS
    'Days of week 0-6 (Sunday=0), same convention as tour_availability_rules.day_of_week.';

CREATE INDEX IF NOT EXISTS idx_schedule_patterns_org_site
    ON public.schedule_patterns (org_id, site_location_id);

CREATE INDEX IF NOT EXISTS idx_schedule_patterns_org_schedule_type
    ON public.schedule_patterns (org_id, schedule_type_key);

-- -----------------------------------------------------------------------------
-- 4) schedule_assignments — effective-dated pattern binding per agreement
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    enrollment_agreement_id uuid NOT NULL
        REFERENCES public.child_enrollment_agreements (id) ON DELETE CASCADE,
    schedule_pattern_id uuid NOT NULL
        REFERENCES public.schedule_patterns (id) ON DELETE RESTRICT,
    customer_member_id uuid NOT NULL REFERENCES public.customer_members (id) ON DELETE RESTRICT,
    start_date date NOT NULL,
    end_date date,
    status text NOT NULL,
    assignment_kind text NOT NULL DEFAULT 'base',
    source_key text NOT NULL DEFAULT 'operator',
    supersedes_assignment_id uuid REFERENCES public.schedule_assignments (id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT schedule_assignments_status_check
        CHECK (
            status = ANY (
                ARRAY[
                    'planned'::text,
                    'active'::text,
                    'ending'::text,
                    'ended'::text,
                    'superseded'::text,
                    'canceled'::text
                ]
            )
        ),
    CONSTRAINT schedule_assignments_assignment_kind_check
        CHECK (assignment_kind = ANY (ARRAY['base'::text])),
    CONSTRAINT schedule_assignments_end_after_start
        CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT schedule_assignments_source_key_nonempty
        CHECK (char_length(btrim(source_key)) > 0)
);

COMMENT ON TABLE public.schedule_assignments IS
    'Effective-dated schedule pattern assignments per enrollment agreement (not job schedules).';

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_org_agreement
    ON public.schedule_assignments (org_id, enrollment_agreement_id);

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_org_member_dates
    ON public.schedule_assignments (org_id, customer_member_id, start_date);

CREATE UNIQUE INDEX IF NOT EXISTS ux_schedule_assignments_one_operational_per_agreement
    ON public.schedule_assignments (org_id, enrollment_agreement_id)
    WHERE status = ANY (ARRAY['planned'::text, 'active'::text, 'ending'::text]);

-- -----------------------------------------------------------------------------
-- 5) Integrity validation triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_schedule_patterns_weekdays()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    d smallint;
BEGIN
    IF NEW.weekdays IS NULL OR cardinality(NEW.weekdays) = 0 THEN
        RAISE EXCEPTION 'schedule_patterns.weekdays must be non-empty'
            USING ERRCODE = '23514';
    END IF;

    FOREACH d IN ARRAY NEW.weekdays
    LOOP
        IF d < 0 OR d > 6 THEN
            RAISE EXCEPTION 'schedule_patterns.weekdays element % out of range 0-6', d
                USING ERRCODE = '23514';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_child_enrollment_agreements_consistency()
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
    mem_person uuid;
    person_org uuid;
    site_org uuid;
    site_type text;
BEGIN
    SELECT cm.org_id, cm.customer_id, cm.person_id
    INTO mem_org, mem_customer, mem_person
    FROM public.customer_members cm
    WHERE cm.id = NEW.customer_member_id;

    IF mem_org IS NULL THEN
        RAISE EXCEPTION 'child_enrollment_agreements: customer_member_id % not found', NEW.customer_member_id
            USING ERRCODE = '23503';
    END IF;
    IF mem_org <> NEW.org_id THEN
        RAISE EXCEPTION 'child_enrollment_agreements: customer_member org mismatch'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.customer_id IS NULL THEN
        NEW.customer_id := mem_customer;
    ELSIF NEW.customer_id <> mem_customer THEN
        RAISE EXCEPTION 'child_enrollment_agreements: customer_id does not match customer_member'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.person_id IS NULL THEN
        NEW.person_id := mem_person;
    ELSIF NEW.person_id IS DISTINCT FROM mem_person THEN
        RAISE EXCEPTION 'child_enrollment_agreements: person_id does not match customer_member'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.opportunity_id IS NOT NULL THEN
        SELECT o.org_id, o.customer_id
        INTO opp_org, opp_customer
        FROM public.opportunities o
        WHERE o.id = NEW.opportunity_id;

        IF opp_org IS NULL THEN
            RAISE EXCEPTION 'child_enrollment_agreements: opportunity_id % not found', NEW.opportunity_id
                USING ERRCODE = '23503';
        END IF;
        IF opp_org <> NEW.org_id THEN
            RAISE EXCEPTION 'child_enrollment_agreements: opportunity org mismatch'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.customer_id IS NOT NULL AND opp_customer IS NOT NULL AND NEW.customer_id <> opp_customer THEN
            RAISE EXCEPTION 'child_enrollment_agreements: opportunity customer mismatch'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.opportunity_customer_member_id IS NOT NULL THEN
        SELECT ocm.org_id, ocm.opportunity_id, ocm.customer_member_id
        INTO ocm_org, ocm_opp, ocm_member
        FROM public.opportunity_customer_members ocm
        WHERE ocm.id = NEW.opportunity_customer_member_id;

        IF ocm_org IS NULL THEN
            RAISE EXCEPTION 'child_enrollment_agreements: opportunity_customer_member_id % not found',
                NEW.opportunity_customer_member_id
                USING ERRCODE = '23503';
        END IF;
        IF ocm_org <> NEW.org_id THEN
            RAISE EXCEPTION 'child_enrollment_agreements: OCM org mismatch'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.opportunity_id IS NOT NULL AND ocm_opp <> NEW.opportunity_id THEN
            RAISE EXCEPTION 'child_enrollment_agreements: OCM opportunity mismatch'
                USING ERRCODE = '23514';
        END IF;
        IF ocm_member <> NEW.customer_member_id THEN
            RAISE EXCEPTION 'child_enrollment_agreements: OCM customer_member mismatch'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    SELECT l.org_id, l.location_type
    INTO site_org, site_type
    FROM public.locations l
    WHERE l.id = NEW.site_location_id;

    IF site_org IS NULL THEN
        RAISE EXCEPTION 'child_enrollment_agreements: site_location_id % not found', NEW.site_location_id
            USING ERRCODE = '23503';
    END IF;
    IF site_org <> NEW.org_id THEN
        RAISE EXCEPTION 'child_enrollment_agreements: site org mismatch'
            USING ERRCODE = '23514';
    END IF;
    IF site_type IS DISTINCT FROM 'site' THEN
        RAISE EXCEPTION 'child_enrollment_agreements: site_location_id % must be location_type site (got %)',
            NEW.site_location_id, site_type
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_child_placements_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    agr_org uuid;
    agr_member uuid;
    agr_site uuid;
    site_org uuid;
    site_type text;
    room_org uuid;
    room_type text;
    room_parent uuid;
    prog_org uuid;
    prog_site uuid;
BEGIN
    SELECT a.org_id, a.customer_member_id, a.site_location_id
    INTO agr_org, agr_member, agr_site
    FROM public.child_enrollment_agreements a
    WHERE a.id = NEW.enrollment_agreement_id;

    IF agr_org IS NULL THEN
        RAISE EXCEPTION 'child_placements: enrollment_agreement_id % not found', NEW.enrollment_agreement_id
            USING ERRCODE = '23503';
    END IF;
    IF agr_org <> NEW.org_id THEN
        RAISE EXCEPTION 'child_placements: agreement org mismatch'
            USING ERRCODE = '23514';
    END IF;
    IF agr_member <> NEW.customer_member_id THEN
        RAISE EXCEPTION 'child_placements: customer_member_id does not match agreement'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.site_location_id <> agr_site THEN
        RAISE EXCEPTION 'child_placements: site_location_id must match agreement site'
            USING ERRCODE = '23514';
    END IF;

    SELECT l.org_id, l.location_type
    INTO site_org, site_type
    FROM public.locations l
    WHERE l.id = NEW.site_location_id;

    IF site_org IS NULL OR site_org <> NEW.org_id OR site_type IS DISTINCT FROM 'site' THEN
        RAISE EXCEPTION 'child_placements: invalid site_location_id %', NEW.site_location_id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.program_category_id IS NOT NULL THEN
        SELECT lpc.org_id, lpc.location_id
        INTO prog_org, prog_site
        FROM public.location_program_categories lpc
        WHERE lpc.id = NEW.program_category_id;

        IF prog_org IS NULL THEN
            RAISE EXCEPTION 'child_placements: program_category_id % not found', NEW.program_category_id
                USING ERRCODE = '23503';
        END IF;
        IF prog_org <> NEW.org_id OR prog_site <> NEW.site_location_id THEN
            RAISE EXCEPTION 'child_placements: program_category must belong to placement site'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.room_location_id IS NOT NULL THEN
        SELECT l.org_id, l.location_type, l.parent_location_id
        INTO room_org, room_type, room_parent
        FROM public.locations l
        WHERE l.id = NEW.room_location_id;

        IF room_org IS NULL THEN
            RAISE EXCEPTION 'child_placements: room_location_id % not found', NEW.room_location_id
                USING ERRCODE = '23503';
        END IF;
        IF room_org <> NEW.org_id OR room_type IS DISTINCT FROM 'unit' THEN
            RAISE EXCEPTION 'child_placements: room_location_id % must be location_type unit', NEW.room_location_id
                USING ERRCODE = '23514';
        END IF;
        IF room_parent IS DISTINCT FROM NEW.site_location_id THEN
            RAISE EXCEPTION 'child_placements: room % must be child of site %',
                NEW.room_location_id, NEW.site_location_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_schedule_patterns_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    site_org uuid;
    site_type text;
BEGIN
    SELECT l.org_id, l.location_type
    INTO site_org, site_type
    FROM public.locations l
    WHERE l.id = NEW.site_location_id;

    IF site_org IS NULL THEN
        RAISE EXCEPTION 'schedule_patterns: site_location_id % not found', NEW.site_location_id
            USING ERRCODE = '23503';
    END IF;
    IF site_org <> NEW.org_id THEN
        RAISE EXCEPTION 'schedule_patterns: site org mismatch'
            USING ERRCODE = '23514';
    END IF;
    IF site_type IS DISTINCT FROM 'site' THEN
        RAISE EXCEPTION 'schedule_patterns: site_location_id % must be location_type site (got %)',
            NEW.site_location_id, site_type
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_schedule_assignments_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    agr_org uuid;
    agr_member uuid;
    agr_site uuid;
    pat_org uuid;
    pat_site uuid;
BEGIN
    SELECT a.org_id, a.customer_member_id, a.site_location_id
    INTO agr_org, agr_member, agr_site
    FROM public.child_enrollment_agreements a
    WHERE a.id = NEW.enrollment_agreement_id;

    IF agr_org IS NULL THEN
        RAISE EXCEPTION 'schedule_assignments: enrollment_agreement_id % not found', NEW.enrollment_agreement_id
            USING ERRCODE = '23503';
    END IF;
    IF agr_org <> NEW.org_id THEN
        RAISE EXCEPTION 'schedule_assignments: agreement org mismatch'
            USING ERRCODE = '23514';
    END IF;
    IF agr_member <> NEW.customer_member_id THEN
        RAISE EXCEPTION 'schedule_assignments: customer_member_id does not match agreement'
            USING ERRCODE = '23514';
    END IF;

    SELECT sp.org_id, sp.site_location_id
    INTO pat_org, pat_site
    FROM public.schedule_patterns sp
    WHERE sp.id = NEW.schedule_pattern_id;

    IF pat_org IS NULL THEN
        RAISE EXCEPTION 'schedule_assignments: schedule_pattern_id % not found', NEW.schedule_pattern_id
            USING ERRCODE = '23503';
    END IF;
    IF pat_org <> NEW.org_id OR pat_site <> agr_site THEN
        RAISE EXCEPTION 'schedule_assignments: schedule_pattern must belong to agreement site'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_schedule_patterns_weekdays ON public.schedule_patterns;
CREATE TRIGGER trg_validate_schedule_patterns_weekdays
    BEFORE INSERT OR UPDATE OF weekdays ON public.schedule_patterns
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_schedule_patterns_weekdays();

DROP TRIGGER IF EXISTS trg_validate_schedule_patterns_consistency ON public.schedule_patterns;
CREATE TRIGGER trg_validate_schedule_patterns_consistency
    BEFORE INSERT OR UPDATE ON public.schedule_patterns
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_schedule_patterns_consistency();

DROP TRIGGER IF EXISTS trg_validate_child_enrollment_agreements_consistency
    ON public.child_enrollment_agreements;
CREATE TRIGGER trg_validate_child_enrollment_agreements_consistency
    BEFORE INSERT OR UPDATE ON public.child_enrollment_agreements
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_child_enrollment_agreements_consistency();

DROP TRIGGER IF EXISTS trg_validate_child_placements_consistency ON public.child_placements;
CREATE TRIGGER trg_validate_child_placements_consistency
    BEFORE INSERT OR UPDATE ON public.child_placements
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_child_placements_consistency();

DROP TRIGGER IF EXISTS trg_validate_schedule_assignments_consistency ON public.schedule_assignments;
CREATE TRIGGER trg_validate_schedule_assignments_consistency
    BEFORE INSERT OR UPDATE ON public.schedule_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_schedule_assignments_consistency();

DROP TRIGGER IF EXISTS trg_child_enrollment_agreements_updated_at ON public.child_enrollment_agreements;
CREATE TRIGGER trg_child_enrollment_agreements_updated_at
    BEFORE UPDATE ON public.child_enrollment_agreements
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_child_placements_updated_at ON public.child_placements;
CREATE TRIGGER trg_child_placements_updated_at
    BEFORE UPDATE ON public.child_placements
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_schedule_patterns_updated_at ON public.schedule_patterns;
CREATE TRIGGER trg_schedule_patterns_updated_at
    BEFORE UPDATE ON public.schedule_patterns
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_schedule_assignments_updated_at ON public.schedule_assignments;
CREATE TRIGGER trg_schedule_assignments_updated_at
    BEFORE UPDATE ON public.schedule_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6) RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.child_enrollment_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;

-- child_enrollment_agreements (operational — same posture as placement_candidates)
DROP POLICY IF EXISTS child_enrollment_agreements_select_org ON public.child_enrollment_agreements;
CREATE POLICY child_enrollment_agreements_select_org
    ON public.child_enrollment_agreements
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = child_enrollment_agreements.org_id
        )
    );

DROP POLICY IF EXISTS child_enrollment_agreements_mutate_crm ON public.child_enrollment_agreements;
CREATE POLICY child_enrollment_agreements_mutate_crm
    ON public.child_enrollment_agreements
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = child_enrollment_agreements.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = child_enrollment_agreements.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS child_enrollment_agreements_service_all ON public.child_enrollment_agreements;
CREATE POLICY child_enrollment_agreements_service_all
    ON public.child_enrollment_agreements
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- child_placements
DROP POLICY IF EXISTS child_placements_select_org ON public.child_placements;
CREATE POLICY child_placements_select_org
    ON public.child_placements
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = child_placements.org_id
        )
    );

DROP POLICY IF EXISTS child_placements_mutate_crm ON public.child_placements;
CREATE POLICY child_placements_mutate_crm
    ON public.child_placements
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = child_placements.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = child_placements.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS child_placements_service_all ON public.child_placements;
CREATE POLICY child_placements_service_all
    ON public.child_placements
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- schedule_patterns (config — same posture as location_program_categories)
DROP POLICY IF EXISTS schedule_patterns_select_org ON public.schedule_patterns;
CREATE POLICY schedule_patterns_select_org
    ON public.schedule_patterns
    FOR SELECT
    TO authenticated
    USING (
        public.has_org_role(
            org_id,
            ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]
        )
    );

DROP POLICY IF EXISTS schedule_patterns_insert_org ON public.schedule_patterns;
CREATE POLICY schedule_patterns_insert_org
    ON public.schedule_patterns
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    );

DROP POLICY IF EXISTS schedule_patterns_update_org ON public.schedule_patterns;
CREATE POLICY schedule_patterns_update_org
    ON public.schedule_patterns
    FOR UPDATE
    TO authenticated
    USING (
        public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    )
    WITH CHECK (
        public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text])
    );

DROP POLICY IF EXISTS schedule_patterns_delete_org ON public.schedule_patterns;
CREATE POLICY schedule_patterns_delete_org
    ON public.schedule_patterns
    FOR DELETE
    TO authenticated
    USING (
        public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text])
    );

DROP POLICY IF EXISTS schedule_patterns_all_service_role ON public.schedule_patterns;
CREATE POLICY schedule_patterns_all_service_role
    ON public.schedule_patterns
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- schedule_assignments (operational)
DROP POLICY IF EXISTS schedule_assignments_select_org ON public.schedule_assignments;
CREATE POLICY schedule_assignments_select_org
    ON public.schedule_assignments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = schedule_assignments.org_id
        )
    );

DROP POLICY IF EXISTS schedule_assignments_mutate_crm ON public.schedule_assignments;
CREATE POLICY schedule_assignments_mutate_crm
    ON public.schedule_assignments
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = schedule_assignments.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = schedule_assignments.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS schedule_assignments_service_all ON public.schedule_assignments;
CREATE POLICY schedule_assignments_service_all
    ON public.schedule_assignments
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- -----------------------------------------------------------------------------
-- 7) Grants
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.child_enrollment_agreements TO authenticated;
GRANT ALL ON TABLE public.child_enrollment_agreements TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.child_placements TO authenticated;
GRANT ALL ON TABLE public.child_placements TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.schedule_patterns TO authenticated;
GRANT ALL ON TABLE public.schedule_patterns TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.schedule_assignments TO authenticated;
GRANT ALL ON TABLE public.schedule_assignments TO service_role;
