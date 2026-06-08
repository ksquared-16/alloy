-- =============================================================================
-- Tour Scheduling V1 — foundation (Card 1)
-- =============================================================================
-- Tables: tour_availability_rules, tour_bookings
-- - tour_bookings: scheduling source of truth for enrollment/sales tours (not public.schedules).
-- - opportunities: CRM lifecycle / status_key remains authoritative for pipeline.
-- - opportunities.metadata.tour_date + tour_time: V1 compatibility mirror after confirm (app layer);
--   not authoritative for slot truth (see sprint docs/sprints/05_2026/tour_scheduling_v1.md).
-- - public.schedules is intentionally NOT reused: schedules.job_id is NOT NULL (job-attached visits).
--
-- RLS: org-scoped via public.has_org_role (same pattern as forms engine v1).
-- anon: no grants (public routes use service_role from Next server, not direct table access).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tour_availability_rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tour_availability_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
    user_id uuid,
    day_of_week smallint NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    timezone text NOT NULL,
    slot_duration_minutes integer NOT NULL,
    buffer_minutes integer NOT NULL DEFAULT 0,
    max_bookings_per_slot integer NOT NULL DEFAULT 1,
    approval_required boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_tour_availability_rules_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT chk_tour_availability_rules_time_window CHECK (end_time > start_time),
    CONSTRAINT chk_tour_availability_rules_slot_duration CHECK (slot_duration_minutes > 0),
    CONSTRAINT chk_tour_availability_rules_buffer CHECK (buffer_minutes >= 0),
    CONSTRAINT chk_tour_availability_rules_max_bookings CHECK (max_bookings_per_slot > 0),
    CONSTRAINT chk_tour_availability_rules_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.tour_availability_rules IS
    'Org-defined recurring windows for tour slot generation (Card 2+). user_id is optional host scope — no FK (multi-org users; defer hardening if needed).';

COMMENT ON COLUMN public.tour_availability_rules.user_id IS
    'Optional staff/host scope for the rule. Not FK''d to auth.users in V1 foundation.';

CREATE INDEX IF NOT EXISTS idx_tour_availability_rules_org_active
    ON public.tour_availability_rules (org_id, is_active);

CREATE INDEX IF NOT EXISTS idx_tour_availability_rules_org_location
    ON public.tour_availability_rules (org_id, location_id);

CREATE INDEX IF NOT EXISTS idx_tour_availability_rules_org_user
    ON public.tour_availability_rules (org_id, user_id);

CREATE INDEX IF NOT EXISTS idx_tour_availability_rules_org_dow
    ON public.tour_availability_rules (org_id, day_of_week);

DROP TRIGGER IF EXISTS trg_tour_availability_rules_updated_at ON public.tour_availability_rules;
CREATE TRIGGER trg_tour_availability_rules_updated_at
    BEFORE UPDATE ON public.tour_availability_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_tour_availability_rules_location_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    loc_org uuid;
BEGIN
    IF NEW.location_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT l.org_id INTO loc_org FROM public.locations l WHERE l.id = NEW.location_id;
    IF loc_org IS NULL THEN
        RAISE EXCEPTION 'tour_availability_rules: location_id % not found', NEW.location_id;
    END IF;
    IF loc_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'tour_availability_rules: location_id must belong to org_id';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tour_availability_rules_location_org ON public.tour_availability_rules;
CREATE TRIGGER trg_validate_tour_availability_rules_location_org
    BEFORE INSERT OR UPDATE OF org_id, location_id ON public.tour_availability_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_tour_availability_rules_location_org();

-- -----------------------------------------------------------------------------
-- tour_bookings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tour_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    opportunity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
    primary_person_id uuid REFERENCES public.persons (id) ON DELETE SET NULL,
    primary_contact_id uuid REFERENCES public.contacts (id) ON DELETE SET NULL,
    requested_by_user_id uuid,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    timezone text NOT NULL,
    status_key text NOT NULL,
    source text NOT NULL,
    form_submission_id uuid REFERENCES public.form_submissions (id) ON DELETE SET NULL,
    form_public_link_id uuid REFERENCES public.form_public_links (id) ON DELETE SET NULL,
    canceled_at timestamptz,
    canceled_by text,
    cancel_reason text,
    rescheduled_from_booking_id uuid REFERENCES public.tour_bookings (id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_tour_bookings_time_window CHECK (end_at > start_at),
    CONSTRAINT chk_tour_bookings_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT chk_tour_bookings_status_key CHECK (
        status_key = ANY (
            ARRAY[
                'requested'::text,
                'pending_approval'::text,
                'confirmed'::text,
                'rescheduled'::text,
                'canceled'::text,
                'completed'::text,
                'no_show'::text
            ]
        )
    ),
    CONSTRAINT chk_tour_bookings_source CHECK (
        source = ANY (
            ARRAY[
                'admin'::text,
                'public_link'::text,
                'form_submission'::text,
                'automation'::text
            ]
        )
    )
);

COMMENT ON TABLE public.tour_bookings IS
    'Tour scheduling source of truth: absolute start/end + booking lifecycle. CRM pipeline remains on opportunities.status_key; metadata.tour_date/tour_time mirror for V1 queue/drawer compatibility only.';

COMMENT ON COLUMN public.tour_bookings.requested_by_user_id IS
    'Optional admin user who created the booking. Not FK''d in V1 foundation (same pattern as form_submissions created_by_user_id).';

CREATE INDEX IF NOT EXISTS idx_tour_bookings_org_opportunity
    ON public.tour_bookings (org_id, opportunity_id);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_org_location_start
    ON public.tour_bookings (org_id, location_id, start_at);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_org_status_start
    ON public.tour_bookings (org_id, status_key, start_at);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_org_window
    ON public.tour_bookings (org_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_form_submission
    ON public.tour_bookings (form_submission_id)
    WHERE form_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tour_bookings_form_public_link
    ON public.tour_bookings (form_public_link_id)
    WHERE form_public_link_id IS NOT NULL;

-- At most one active (non-terminal) booking per opportunity (V1 locked decision).
CREATE UNIQUE INDEX IF NOT EXISTS ux_tour_bookings_one_active_non_terminal_per_opportunity
    ON public.tour_bookings (org_id, opportunity_id)
    WHERE status_key = ANY (
        ARRAY[
            'requested'::text,
            'pending_approval'::text,
            'confirmed'::text,
            'rescheduled'::text
        ]
    );

DROP TRIGGER IF EXISTS trg_tour_bookings_updated_at ON public.tour_bookings;
CREATE TRIGGER trg_tour_bookings_updated_at
    BEFORE UPDATE ON public.tour_bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_tour_booking_org_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    opp_org uuid;
    loc_org uuid;
    fs_org uuid;
    fpl_org uuid;
    parent_org uuid;
BEGIN
    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.opportunity_id;
    IF opp_org IS NULL THEN
        RAISE EXCEPTION 'tour_bookings: opportunity_id % not found', NEW.opportunity_id;
    END IF;
    IF NEW.org_id IS DISTINCT FROM opp_org THEN
        RAISE EXCEPTION 'tour_bookings: org_id must match opportunities.org_id for opportunity_id';
    END IF;

    SELECT l.org_id INTO loc_org FROM public.locations l WHERE l.id = NEW.location_id;
    IF loc_org IS NULL THEN
        RAISE EXCEPTION 'tour_bookings: location_id % not found', NEW.location_id;
    END IF;
    IF loc_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'tour_bookings: location_id must belong to the same org_id';
    END IF;

    IF NEW.form_submission_id IS NOT NULL THEN
        SELECT fs.org_id INTO fs_org FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;
        IF fs_org IS NULL THEN
            RAISE EXCEPTION 'tour_bookings: form_submission_id % not found', NEW.form_submission_id;
        END IF;
        IF fs_org IS DISTINCT FROM NEW.org_id THEN
            RAISE EXCEPTION 'tour_bookings: form_submission_id org_id mismatch';
        END IF;
    END IF;

    IF NEW.form_public_link_id IS NOT NULL THEN
        SELECT fpl.org_id INTO fpl_org FROM public.form_public_links fpl WHERE fpl.id = NEW.form_public_link_id;
        IF fpl_org IS NULL THEN
            RAISE EXCEPTION 'tour_bookings: form_public_link_id % not found', NEW.form_public_link_id;
        END IF;
        IF fpl_org IS DISTINCT FROM NEW.org_id THEN
            RAISE EXCEPTION 'tour_bookings: form_public_link_id org_id mismatch';
        END IF;
    END IF;

    IF NEW.rescheduled_from_booking_id IS NOT NULL THEN
        SELECT tb.org_id INTO parent_org FROM public.tour_bookings tb WHERE tb.id = NEW.rescheduled_from_booking_id;
        IF parent_org IS NULL THEN
            RAISE EXCEPTION 'tour_bookings: rescheduled_from_booking_id % not found', NEW.rescheduled_from_booking_id;
        END IF;
        IF parent_org IS DISTINCT FROM NEW.org_id THEN
            RAISE EXCEPTION 'tour_bookings: rescheduled_from_booking_id org_id mismatch';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tour_booking_org_integrity ON public.tour_bookings;
CREATE TRIGGER trg_validate_tour_booking_org_integrity
    BEFORE INSERT OR UPDATE OF org_id, opportunity_id, location_id, form_submission_id, form_public_link_id, rescheduled_from_booking_id
    ON public.tour_bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_tour_booking_org_integrity();

-- -----------------------------------------------------------------------------
-- RLS + privileges
-- -----------------------------------------------------------------------------
ALTER TABLE public.tour_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_bookings ENABLE ROW LEVEL SECURITY;

-- tour_availability_rules
DROP POLICY IF EXISTS tour_availability_rules_select_by_org_role ON public.tour_availability_rules;
CREATE POLICY tour_availability_rules_select_by_org_role ON public.tour_availability_rules FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS tour_availability_rules_insert_by_org_role ON public.tour_availability_rules;
CREATE POLICY tour_availability_rules_insert_by_org_role ON public.tour_availability_rules FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS tour_availability_rules_update_by_org_role ON public.tour_availability_rules;
CREATE POLICY tour_availability_rules_update_by_org_role ON public.tour_availability_rules FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS tour_availability_rules_delete_by_org_role ON public.tour_availability_rules;
CREATE POLICY tour_availability_rules_delete_by_org_role ON public.tour_availability_rules FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS tour_availability_rules_all_service_role ON public.tour_availability_rules;
CREATE POLICY tour_availability_rules_all_service_role ON public.tour_availability_rules FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- tour_bookings
DROP POLICY IF EXISTS tour_bookings_select_by_org_role ON public.tour_bookings;
CREATE POLICY tour_bookings_select_by_org_role ON public.tour_bookings FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS tour_bookings_insert_by_org_role ON public.tour_bookings;
CREATE POLICY tour_bookings_insert_by_org_role ON public.tour_bookings FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS tour_bookings_update_by_org_role ON public.tour_bookings;
CREATE POLICY tour_bookings_update_by_org_role ON public.tour_bookings FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS tour_bookings_delete_by_org_role ON public.tour_bookings;
CREATE POLICY tour_bookings_delete_by_org_role ON public.tour_bookings FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS tour_bookings_all_service_role ON public.tour_bookings;
CREATE POLICY tour_bookings_all_service_role ON public.tour_bookings FOR ALL TO service_role
    USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.tour_availability_rules FROM anon;
REVOKE ALL ON TABLE public.tour_bookings FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tour_availability_rules TO authenticated;
GRANT ALL ON TABLE public.tour_availability_rules TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tour_bookings TO authenticated;
GRANT ALL ON TABLE public.tour_bookings TO service_role;
