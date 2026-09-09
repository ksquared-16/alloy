-- =============================================================================
-- Location Topology V1 — physical space vs operational group vs shared space
-- =============================================================================
-- An operational classroom/group IS a Location node, not a separate entity.
-- Alloy already keys attendance, placements, capacity, ratio, staffing and
-- config off `room_location_id`; introducing a parallel "operational group"
-- entity would force a second nullable reference onto every one of those tables
-- and a branch into every resolver. What was missing is not an entity — it is a
-- ROLE and one LEVEL.
--
--   Site
--   └── Room 1            unit, unit_role = 'physical_space'      (licensed)
--       ├── Toddler 1     unit, unit_role = 'operational_group'   (ratio/staffing)
--       └── Toddler 2     unit, unit_role = 'operational_group'
--   └── Playground        unit, unit_role = 'shared_space'
--
-- Committed placement stays on the operational group. Daily movement is an
-- attendance fact naming any unit at the site — a group, or a shared space.
-- Combining two groups is a transfer, not a placement rewrite.
--
-- WHAT THIS CHANGES
--  1. `locations.unit_role` — the semantic discriminator (NULL = legacy
--     classroom, read as 'operational_group'; never back-filled to a lie).
--  2. `public.location_site_id()` — ONE bounded ancestor walk that answers
--     "which site is this under". Cycle-safe, depth-capped.
--  3. The three fact/placement triggers stop requiring `parent = site` and ask
--     the resolver instead. This is strictly MORE permissive: every row that
--     validated before still validates.
--  4. A hierarchy guard that bounds the new nesting (site -> physical_space ->
--     operational_group) and rejects cycles. It only bites on unit-under-unit,
--     so existing site-parented rooms are untouched.
--
-- Doctrine: docs/platform/modules/attendance-system.md, ../core/placement-system.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) The semantic role of a unit.
-- -----------------------------------------------------------------------------
ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS unit_role text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'locations_unit_role_check'
    ) THEN
        ALTER TABLE public.locations
            ADD CONSTRAINT locations_unit_role_check CHECK (
                unit_role IS NULL
                OR unit_role = ANY (ARRAY[
                    'physical_space'::text,
                    'operational_group'::text,
                    'shared_space'::text
                ])
            );
    END IF;
END$$;

-- A role is meaningless on a site/address row; refuse it rather than storing a
-- value nothing reads.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'locations_unit_role_only_on_unit'
    ) THEN
        ALTER TABLE public.locations
            ADD CONSTRAINT locations_unit_role_only_on_unit CHECK (
                unit_role IS NULL OR location_type = 'unit'
            );
    END IF;
END$$;

COMMENT ON COLUMN public.locations.unit_role IS
    'Semantic role of a unit: physical_space (licensed room that CONTAINS groups) | operational_group (classroom/cohort — the ratio + staffing unit, and the placement target) | shared_space (playground/gym — attendance may name it, placement may not). NULL on a legacy unit reads as operational_group.';

-- The effective role, so no consumer has to spell the legacy default itself.
CREATE OR REPLACE FUNCTION public.location_unit_role(p_location_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $function$
    SELECT CASE
        WHEN l.location_type <> 'unit' THEN NULL
        ELSE COALESCE(l.unit_role, 'operational_group')
    END
    FROM public.locations l
    WHERE l.id = p_location_id;
$function$;

COMMENT ON FUNCTION public.location_unit_role(uuid) IS
    'Effective unit_role for a unit location; NULL for non-units. A legacy unit with no stored role reads as operational_group.';

-- -----------------------------------------------------------------------------
-- 2) Site resolution by ancestry — the one walk everything shares.
-- -----------------------------------------------------------------------------
-- Bounded to 8 hops and revisit-guarded. Returns NULL for an orphan, a cycle, or
-- a chain that never reaches a site — never a phantom site, and never an error,
-- because callers already raise their own domain-specific exception.
CREATE OR REPLACE FUNCTION public.location_site_id(p_location_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    cur uuid := p_location_id;
    cur_type text;
    cur_parent uuid;
    seen uuid[] := ARRAY[]::uuid[];
    hops int := 0;
BEGIN
    IF cur IS NULL THEN
        RETURN NULL;
    END IF;

    WHILE cur IS NOT NULL AND hops < 8 LOOP
        IF cur = ANY (seen) THEN
            RETURN NULL;  -- cycle
        END IF;
        seen := seen || cur;

        SELECT l.location_type, l.parent_location_id
        INTO cur_type, cur_parent
        FROM public.locations l
        WHERE l.id = cur;

        IF cur_type IS NULL THEN
            RETURN NULL;  -- missing row
        END IF;
        IF cur_type = 'site' THEN
            RETURN cur;
        END IF;

        cur := cur_parent;
        hops := hops + 1;
    END LOOP;

    RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.location_site_id(uuid) IS
    'The site ancestor of any location, by bounded cycle-safe walk (8 hops). NULL for an orphan, a cycle, or a chain with no site. The single site-resolution authority for nested room topology.';

-- -----------------------------------------------------------------------------
-- 3) Hierarchy guard — bound the new nesting, reject cycles.
-- -----------------------------------------------------------------------------
-- Only unit-under-unit is newly constrained. A unit parented to a site behaves
-- exactly as it did before this migration.
CREATE OR REPLACE FUNCTION public.validate_location_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    parent_type text;
    parent_role text;
    parent_parent uuid;
    resolved_site uuid;
BEGIN
    IF NEW.parent_location_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.parent_location_id = NEW.id THEN
        RAISE EXCEPTION 'locations: a location cannot be its own parent' USING ERRCODE = '23514';
    END IF;

    SELECT l.location_type, COALESCE(l.unit_role, 'operational_group'), l.parent_location_id
    INTO parent_type, parent_role, parent_parent
    FROM public.locations l
    WHERE l.id = NEW.parent_location_id;

    IF parent_type IS NULL THEN
        RAISE EXCEPTION 'locations: parent location % not found', NEW.parent_location_id
            USING ERRCODE = '23503';
    END IF;

    -- Nesting a unit under a unit is the new capability, and it is deliberately
    -- narrow: only a physical space may contain other units, and only one level
    -- deep. Deeper trees are where cycles and unbounded walks come from, and no
    -- childcare topology we found needs one.
    IF NEW.location_type = 'unit' AND parent_type = 'unit' THEN
        IF parent_role <> 'physical_space' THEN
            RAISE EXCEPTION
                'locations: a unit may only be nested inside a unit whose unit_role is physical_space (parent % is %)',
                NEW.parent_location_id, parent_role
                USING ERRCODE = '23514';
        END IF;
        IF COALESCE(NEW.unit_role, 'operational_group') = 'physical_space' THEN
            RAISE EXCEPTION 'locations: a physical_space may not be nested inside another physical_space'
                USING ERRCODE = '23514';
        END IF;
        -- The containing physical space must itself hang off a site: that caps
        -- the chain at site -> physical_space -> operational_group.
        IF public.location_site_id(NEW.parent_location_id) IS DISTINCT FROM parent_parent THEN
            RAISE EXCEPTION 'locations: a nested unit must sit under a physical space that belongs directly to a site'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.location_type = 'unit' AND parent_type NOT IN ('site', 'unit') THEN
        RAISE EXCEPTION 'locations: a unit must be parented to a site or a physical space (got %)', parent_type
            USING ERRCODE = '23514';
    END IF;

    -- Defence in depth: whatever the shape, the row must resolve to exactly one
    -- site. A cycle or an orphan chain returns NULL here and is refused.
    IF NEW.location_type = 'unit' THEN
        resolved_site := public.location_site_id(NEW.parent_location_id);
        IF resolved_site IS NULL THEN
            RAISE EXCEPTION 'locations: unit % does not resolve to a site through its parent chain', NEW.id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_location_hierarchy ON public.locations;
CREATE TRIGGER trg_validate_location_hierarchy
    BEFORE INSERT OR UPDATE OF parent_location_id, location_type, unit_role ON public.locations
    FOR EACH ROW EXECUTE FUNCTION public.validate_location_hierarchy();

-- -----------------------------------------------------------------------------
-- 4) The three room-validating triggers now resolve the site by ancestry.
-- -----------------------------------------------------------------------------
-- Each keeps every rule it had. The ONLY change is `room.parent = site` becoming
-- `location_site_id(room) = site`, which is a superset: a room parented directly
-- to the site still resolves to that site.
--
-- Placement additionally gains one NEW rule: a child may not be *placed* into a
-- physical space or a shared space. Placement is committed intent and belongs to
-- an operational group; a child belongs to Toddler 1, never to "Room 1" or "the
-- playground". Attendance stays free to name any of them.

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
    prog_org uuid;
    prog_site uuid;
    room_org uuid;
    room_type text;
    room_site uuid;
    room_role text;
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
        RAISE EXCEPTION 'child_placements: agreement org mismatch' USING ERRCODE = '23514';
    END IF;
    IF agr_member <> NEW.customer_member_id THEN
        RAISE EXCEPTION 'child_placements: customer_member_id does not match agreement' USING ERRCODE = '23514';
    END IF;
    IF NEW.site_location_id <> agr_site THEN
        RAISE EXCEPTION 'child_placements: site_location_id must match agreement site' USING ERRCODE = '23514';
    END IF;

    SELECT l.org_id, l.location_type INTO site_org, site_type
    FROM public.locations l WHERE l.id = NEW.site_location_id;
    IF site_org IS NULL OR site_org <> NEW.org_id OR site_type IS DISTINCT FROM 'site' THEN
        RAISE EXCEPTION 'child_placements: invalid site_location_id %', NEW.site_location_id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.program_category_id IS NOT NULL THEN
        SELECT lpc.org_id, lpc.location_id INTO prog_org, prog_site
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
        SELECT l.org_id, l.location_type INTO room_org, room_type
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

        room_site := public.location_site_id(NEW.room_location_id);
        IF room_site IS DISTINCT FROM NEW.site_location_id THEN
            RAISE EXCEPTION 'child_placements: room % must resolve to site %',
                NEW.room_location_id, NEW.site_location_id
                USING ERRCODE = '23514';
        END IF;

        room_role := public.location_unit_role(NEW.room_location_id);
        IF room_role <> 'operational_group' THEN
            RAISE EXCEPTION
                'child_placements: a child is placed into an operational group, not a % (room %)',
                room_role, NEW.room_location_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_child_attendance_events_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    agr_org uuid;
    agr_member uuid;
    agr_site uuid;
    site_org uuid;
    site_type text;
    r_id uuid;
    r_org uuid;
    r_type text;
    r_site uuid;
    c_org uuid;
    c_agreement uuid;
BEGIN
    SELECT a.org_id, a.customer_member_id, a.site_location_id
    INTO agr_org, agr_member, agr_site
    FROM public.child_enrollment_agreements a
    WHERE a.id = NEW.enrollment_agreement_id;

    IF agr_org IS NULL THEN
        RAISE EXCEPTION 'child_attendance_events: enrollment_agreement_id % not found', NEW.enrollment_agreement_id
            USING ERRCODE = '23503';
    END IF;
    IF agr_org <> NEW.org_id THEN
        RAISE EXCEPTION 'child_attendance_events: agreement org mismatch' USING ERRCODE = '23514';
    END IF;
    IF agr_member <> NEW.customer_member_id THEN
        RAISE EXCEPTION 'child_attendance_events: customer_member_id does not match agreement' USING ERRCODE = '23514';
    END IF;
    IF NEW.site_location_id <> agr_site THEN
        RAISE EXCEPTION 'child_attendance_events: site_location_id must match agreement site' USING ERRCODE = '23514';
    END IF;

    SELECT l.org_id, l.location_type INTO site_org, site_type
    FROM public.locations l WHERE l.id = NEW.site_location_id;
    IF site_org IS NULL OR site_org <> NEW.org_id OR site_type IS DISTINCT FROM 'site' THEN
        RAISE EXCEPTION 'child_attendance_events: invalid site_location_id %', NEW.site_location_id USING ERRCODE = '23514';
    END IF;

    -- Any referenced room must be a unit that RESOLVES to the agreement site.
    -- Attendance may name any unit role: an operational group, the physical room
    -- itself, or a shared space such as a playground.
    IF NEW.room_location_id IS NOT NULL OR NEW.from_room_location_id IS NOT NULL OR NEW.to_room_location_id IS NOT NULL THEN
        FOREACH r_id IN ARRAY ARRAY[NEW.room_location_id, NEW.from_room_location_id, NEW.to_room_location_id]
        LOOP
            CONTINUE WHEN r_id IS NULL;

            SELECT l.org_id, l.location_type INTO r_org, r_type
            FROM public.locations l WHERE l.id = r_id;

            IF r_org IS DISTINCT FROM NEW.org_id OR r_type IS DISTINCT FROM 'unit' THEN
                RAISE EXCEPTION 'child_attendance_events: room must be a unit in the same org' USING ERRCODE = '23514';
            END IF;

            r_site := public.location_site_id(r_id);
            IF r_site IS DISTINCT FROM NEW.site_location_id THEN
                RAISE EXCEPTION 'child_attendance_events: room % must resolve to the agreement site', r_id
                    USING ERRCODE = '23514';
            END IF;
        END LOOP;
    END IF;

    IF NEW.corrects_event_id IS NOT NULL THEN
        SELECT e.org_id, e.enrollment_agreement_id INTO c_org, c_agreement
        FROM public.child_attendance_events e WHERE e.id = NEW.corrects_event_id;
        IF c_org IS NULL THEN
            RAISE EXCEPTION 'child_attendance_events: corrects_event_id % not found', NEW.corrects_event_id USING ERRCODE = '23503';
        END IF;
        IF c_org <> NEW.org_id OR c_agreement <> NEW.enrollment_agreement_id THEN
            RAISE EXCEPTION 'child_attendance_events: correction must target an event on the same org and agreement' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_staff_presence_events_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    emp_org uuid;
    emp_person uuid;
    emp_start date;
    emp_end date;
    emp_status text;
    site_org uuid;
    site_type text;
    r_org uuid;
    r_type text;
    r_site uuid;
    c_org uuid;
    c_person uuid;
BEGIN
    SELECT e.org_id, e.person_id, e.start_date, e.end_date, e.employment_status
      INTO emp_org, emp_person, emp_start, emp_end, emp_status
    FROM public.employments e WHERE e.id = NEW.employment_id;

    IF emp_org IS NULL THEN
        RAISE EXCEPTION 'staff_presence_events: employment_id % not found', NEW.employment_id
            USING ERRCODE = '23503';
    END IF;
    IF emp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'staff_presence_events: employment org mismatch' USING ERRCODE = '23514';
    END IF;
    IF emp_person <> NEW.person_id THEN
        RAISE EXCEPTION 'staff_presence_events: person_id does not match the employment' USING ERRCODE = '23514';
    END IF;

    -- Presence outside the employment window is not a fact about staff.
    IF emp_status = 'canceled'
       OR emp_start > NEW.service_date
       OR (emp_end IS NOT NULL AND emp_end < NEW.service_date) THEN
        RAISE EXCEPTION 'staff_presence_events: employment does not cover service_date %', NEW.service_date
            USING ERRCODE = '23514';
    END IF;

    SELECT l.org_id, l.location_type INTO site_org, site_type
    FROM public.locations l WHERE l.id = NEW.site_location_id;
    IF site_org IS NULL OR site_org <> NEW.org_id OR site_type IS DISTINCT FROM 'site' THEN
        RAISE EXCEPTION 'staff_presence_events: invalid site_location_id %', NEW.site_location_id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.room_location_id IS NOT NULL THEN
        SELECT l.org_id, l.location_type INTO r_org, r_type
        FROM public.locations l WHERE l.id = NEW.room_location_id;
        IF r_org IS DISTINCT FROM NEW.org_id OR r_type IS DISTINCT FROM 'unit' THEN
            RAISE EXCEPTION 'staff_presence_events: room must be a unit in the same org' USING ERRCODE = '23514';
        END IF;

        r_site := public.location_site_id(NEW.room_location_id);
        IF r_site IS DISTINCT FROM NEW.site_location_id THEN
            RAISE EXCEPTION 'staff_presence_events: room must resolve to the presence site' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.corrects_event_id IS NOT NULL THEN
        SELECT e.org_id, e.person_id INTO c_org, c_person
        FROM public.staff_presence_events e WHERE e.id = NEW.corrects_event_id;
        IF c_org IS NULL THEN
            RAISE EXCEPTION 'staff_presence_events: corrects_event_id % not found', NEW.corrects_event_id
                USING ERRCODE = '23503';
        END IF;
        IF c_org <> NEW.org_id OR c_person <> NEW.person_id THEN
            RAISE EXCEPTION 'staff_presence_events: correction must target an event for the same org and person'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5) Indexes for the new read shapes.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_locations_org_unit_role
    ON public.locations (org_id, unit_role)
    WHERE location_type = 'unit';
