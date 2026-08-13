-- Employment foundation (Staff Foundation Phase 1)
-- =============================================================================
-- Canonical answer to "does this Person work for this org, in what operational
-- capacity, and since when".
--
-- Doctrine:
--  - `persons` remains canonical human identity. Employment is an EDGE, never a
--    second identity. No name/email/phone is copied here.
--  - Employment is NOT access. Nothing in this migration touches auth.users,
--    user_roles, user_access_profiles, user_site_access or user_department_access.
--    See docs/platform/core/data/relationship-model.md (Employee relationship).
--  - Effective-dated and history-preserving: ending employment closes the window,
--    it never deletes. Re-hire is a new non-overlapping row.
--  - `persons.is_employee` is NOT touched here. It keeps its authored waitlist
--    meaning (20260528120000_waitlist_priority_fact_truth_child_scope.sql). The
--    scheduling authority is repointed in the next migration; retirement path is
--    documented on the column comment there.
--
-- Rollback / compatibility: purely additive. Dropping both tables restores the
-- prior schema exactly; no existing table is altered and no existing row is
-- rewritten.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) employment_positions — org-owned job/position vocabulary
-- -----------------------------------------------------------------------------
-- Configuration steers: "Lead Teacher", "Cook", "Bus Driver" are tenant words,
-- never a platform enum. Modelled on operational_assignment_types.
CREATE TABLE IF NOT EXISTS public.employment_positions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT employment_positions_org_key_key UNIQUE (org_id, key),
    CONSTRAINT employment_positions_key_format_check
        CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT employment_positions_label_not_blank_check
        CHECK (length(btrim(label)) > 0)
);

CREATE INDEX IF NOT EXISTS employment_positions_org_active_sort_idx
    ON public.employment_positions (org_id, is_active, sort_order, label);

COMMENT ON TABLE public.employment_positions IS
    'Configuration-owned job/position vocabulary for employment. Tenant words, not a platform enum.';

-- -----------------------------------------------------------------------------
-- 2) employments — the canonical org ↔ person employment relationship
-- -----------------------------------------------------------------------------
-- Status vocabulary deliberately mirrors child_enrollment_agreements: the same
-- shape of fact (an effective-dated org relationship). No new generic status
-- architecture.
CREATE TABLE IF NOT EXISTS public.employments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    person_id uuid NOT NULL REFERENCES public.persons (id) ON DELETE RESTRICT,

    employment_status text NOT NULL DEFAULT 'active',
    -- Platform-operational, jurisdiction-neutral. Vertical facts (CPR, background
    -- check, training hours) belong in field_definitions/field_values, never here.
    employment_type text,
    position_id uuid REFERENCES public.employment_positions (id) ON DELETE RESTRICT,

    -- Stable employment-level location semantics only. Time-bound room/site
    -- staffing stays in schedule_assignments — this is NOT a second scheduler.
    primary_location_id uuid REFERENCES public.locations (id) ON DELETE RESTRICT,

    external_employee_id text,

    start_date date NOT NULL,
    end_date date,
    end_reason_key text,

    source_key text NOT NULL DEFAULT 'operator',
    supersedes_employment_id uuid REFERENCES public.employments (id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT employments_status_check
        CHECK (employment_status = ANY (ARRAY[
            'pending_start'::text,
            'active'::text,
            'ending'::text,
            'ended'::text,
            'canceled'::text
        ])),
    CONSTRAINT employments_type_check
        CHECK (employment_type IS NULL OR employment_type = ANY (ARRAY[
            'full_time'::text,
            'part_time'::text,
            'temporary'::text,
            'contract'::text,
            'volunteer'::text
        ])),
    CONSTRAINT employments_date_order_check
        CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT employments_terminal_requires_end_date_check
        CHECK (employment_status <> 'ended' OR end_date IS NOT NULL),
    CONSTRAINT employments_external_id_not_blank_check
        CHECK (external_employee_id IS NULL OR length(btrim(external_employee_id)) > 0),
    CONSTRAINT employments_no_self_supersede
        CHECK (supersedes_employment_id IS NULL OR supersedes_employment_id <> id)
);

COMMENT ON TABLE public.employments IS
    'Canonical org ↔ person employment relationship. Effective-dated, history-preserving. Identity stays on persons; this table never copies name/email/phone. Employment confers NO Alloy access.';
COMMENT ON COLUMN public.employments.employment_status IS
    'pending_start | active | ending | ended | canceled. Mirrors child_enrollment_agreements — the same shape of effective-dated org relationship.';
COMMENT ON COLUMN public.employments.primary_location_id IS
    'Stable employment-level home/primary site. Time-bound room/site staffing belongs to schedule_assignments, never here.';
COMMENT ON COLUMN public.employments.employment_type IS
    'Platform-operational, jurisdiction-neutral. Vertical staff facts belong in field_definitions/field_values with entity_type = ''employment''.';

-- Access patterns: "current employment for person+org", "staff at a site",
-- "employment covering a date" (the scheduling eligibility probe).
CREATE INDEX IF NOT EXISTS employments_org_person_window_idx
    ON public.employments (org_id, person_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS employments_org_person_open_idx
    ON public.employments (org_id, person_id)
    WHERE employment_status IN ('pending_start', 'active', 'ending');
CREATE INDEX IF NOT EXISTS employments_org_location_idx
    ON public.employments (org_id, primary_location_id)
    WHERE primary_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employments_org_position_idx
    ON public.employments (org_id, position_id)
    WHERE position_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) Cross-org / referential integrity
-- -----------------------------------------------------------------------------
-- A person may hold employment in more than one org. What is forbidden is an
-- employment whose person, position, or location belongs to a DIFFERENT org.
CREATE OR REPLACE FUNCTION public.validate_employments_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_person_org uuid;
    v_person_archived_at timestamptz;
    v_position_org uuid;
    v_location_org uuid;
    v_location_type text;
    v_supersedes_org uuid;
    v_supersedes_person uuid;
BEGIN
    SELECT org_id, archived_at INTO v_person_org, v_person_archived_at
    FROM public.persons WHERE id = NEW.person_id;

    IF v_person_org IS NULL OR v_person_org <> NEW.org_id THEN
        RAISE EXCEPTION 'Employment person must belong to the employing organization'
            USING ERRCODE = '23514';
    END IF;

    -- An archived person may keep historical employment, but never gain new
    -- non-terminal employment.
    IF v_person_archived_at IS NOT NULL
       AND NEW.employment_status IN ('pending_start', 'active', 'ending') THEN
        RAISE EXCEPTION 'An archived person cannot hold active employment'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.position_id IS NOT NULL THEN
        SELECT org_id INTO v_position_org
        FROM public.employment_positions WHERE id = NEW.position_id;
        IF v_position_org IS NULL OR v_position_org <> NEW.org_id THEN
            RAISE EXCEPTION 'Employment position must belong to the employing organization'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.primary_location_id IS NOT NULL THEN
        SELECT org_id, location_type INTO v_location_org, v_location_type
        FROM public.locations WHERE id = NEW.primary_location_id;
        IF v_location_org IS NULL OR v_location_org <> NEW.org_id THEN
            RAISE EXCEPTION 'Employment primary location must belong to the employing organization'
                USING ERRCODE = '23514';
        END IF;
        IF v_location_type IS DISTINCT FROM 'site' THEN
            RAISE EXCEPTION 'Employment primary location must be a site'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.supersedes_employment_id IS NOT NULL THEN
        SELECT org_id, person_id INTO v_supersedes_org, v_supersedes_person
        FROM public.employments WHERE id = NEW.supersedes_employment_id;
        IF v_supersedes_org IS NULL
           OR v_supersedes_org <> NEW.org_id
           OR v_supersedes_person <> NEW.person_id THEN
            RAISE EXCEPTION 'Superseded employment must belong to the same organization and person'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_employments_consistency ON public.employments;
CREATE TRIGGER trg_validate_employments_consistency
    BEFORE INSERT OR UPDATE ON public.employments
    FOR EACH ROW EXECUTE FUNCTION public.validate_employments_consistency();

-- -----------------------------------------------------------------------------
-- 4) Effective-dated non-overlap
-- -----------------------------------------------------------------------------
-- Zero or one open employment period per (org, person) on any calendar day.
-- History and non-overlapping future/rehire periods coexist. Deliberately NOT a
-- global unique index on (org_id, person_id) among open statuses — that would
-- block a legitimate rehire scheduled after a prior period closed.
--
-- Reuses public.schedule_assignment_date_ranges_overlap (IMMUTABLE, pure, and
-- domain-neutral despite its name) rather than defining a second overlap helper.
CREATE OR REPLACE FUNCTION public.validate_employments_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.employment_status NOT IN ('pending_start', 'active', 'ending') THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.employments e
        WHERE e.org_id = NEW.org_id
          AND e.person_id = NEW.person_id
          AND e.id IS DISTINCT FROM NEW.id
          AND e.employment_status IN ('pending_start', 'active', 'ending')
          AND public.schedule_assignment_date_ranges_overlap(
                e.start_date, e.end_date, NEW.start_date, NEW.end_date
              )
    ) THEN
        RAISE EXCEPTION
            'Overlapping open employment periods are not allowed for the same person in one organization'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_employments_overlap ON public.employments;
CREATE TRIGGER trg_validate_employments_overlap
    BEFORE INSERT OR UPDATE OF employment_status, start_date, end_date, person_id, org_id
    ON public.employments
    FOR EACH ROW EXECUTE FUNCTION public.validate_employments_overlap();

-- -----------------------------------------------------------------------------
-- 5) Effective-time employment authority
-- -----------------------------------------------------------------------------
-- "Was this person employed by this org on this date?"
--
-- Deliberately date-window based and NOT restricted to currently-open statuses:
-- an ENDED employment still covered the days inside its window. That is what
-- makes a historical staff assignment remain valid after employment ends, while
-- a NEW assignment dated after the end date is correctly rejected.
CREATE OR REPLACE FUNCTION public.person_is_employed_on(
    p_org_id uuid,
    p_person_id uuid,
    p_on_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.employments e
        WHERE e.org_id = p_org_id
          AND e.person_id = p_person_id
          AND e.employment_status <> 'canceled'
          AND e.start_date <= p_on_date
          AND (e.end_date IS NULL OR e.end_date >= p_on_date)
    );
$$;

COMMENT ON FUNCTION public.person_is_employed_on(uuid, uuid, date) IS
    'Effective-time employment authority. Canonical replacement for persons.is_employee as scheduling eligibility. Ended employment still covers dates inside its own window, so historical assignments stay valid.';

-- -----------------------------------------------------------------------------
-- 6) updated_at
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_employments_updated_at ON public.employments;
CREATE TRIGGER set_employments_updated_at
    BEFORE UPDATE ON public.employments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_employment_positions_updated_at ON public.employment_positions;
CREATE TRIGGER set_employment_positions_updated_at
    BEFORE UPDATE ON public.employment_positions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7) RLS — org-scoped, mirrors operational_assignment_types
-- -----------------------------------------------------------------------------
ALTER TABLE public.employment_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employment_positions_org_member_select ON public.employment_positions;
CREATE POLICY employment_positions_org_member_select
    ON public.employment_positions FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops', 'manager']));

DROP POLICY IF EXISTS employment_positions_org_operator_insert ON public.employment_positions;
CREATE POLICY employment_positions_org_operator_insert
    ON public.employment_positions FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops']));

DROP POLICY IF EXISTS employment_positions_org_operator_update ON public.employment_positions;
CREATE POLICY employment_positions_org_operator_update
    ON public.employment_positions FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops']));

DROP POLICY IF EXISTS employment_positions_org_admin_delete ON public.employment_positions;
CREATE POLICY employment_positions_org_admin_delete
    ON public.employment_positions FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner', 'admin']));

ALTER TABLE public.employments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employments_org_member_select ON public.employments;
CREATE POLICY employments_org_member_select
    ON public.employments FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops', 'manager']));

DROP POLICY IF EXISTS employments_org_operator_insert ON public.employments;
CREATE POLICY employments_org_operator_insert
    ON public.employments FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops']));

DROP POLICY IF EXISTS employments_org_operator_update ON public.employments;
CREATE POLICY employments_org_operator_update
    ON public.employments FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops']));

-- No DELETE policy for employments: history is preserved by ending, never by
-- deleting. service_role retains full access for platform maintenance.
DROP POLICY IF EXISTS employments_service_all ON public.employments;
CREATE POLICY employments_service_all
    ON public.employments FOR ALL TO authenticated
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE ON TABLE public.employments TO authenticated;
GRANT ALL ON TABLE public.employments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employment_positions TO authenticated;
GRANT ALL ON TABLE public.employment_positions TO service_role;
