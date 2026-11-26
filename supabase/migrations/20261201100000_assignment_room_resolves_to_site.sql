-- THE ASSIGNMENT ROOM RESOLVES UNDER THE ASSIGNMENT SITE, FOR EVERY WRITER.
--
-- Ratified (canonical): placement-system ("classroom under site"), attendance-system ("site
-- resolution is an ancestor walk"; "staff assignment | the operational_group unit"),
-- staff-coverage-authority, spaces-director-qa §11 ("staff classroom assignment: operational spaces
-- only"). `child_placements` already enforces it by trigger; `schedule_assignments` checked only the
-- room's ORG. #1532 added the check to `createOperationalAssignment`, which left staff
-- `assignment.set_primary` and `assignment.promote_proposed` (re-sites a row, keeps its room) and any
-- direct insert unchecked. The consistency trigger is the one point every writer passes.
--
-- Scope, deliberately:
--   - every subject: the room must resolve (ancestor walk, `location_site_id`) to NEW.site_location_id;
--   - staff only: the room must be an operational group. Whether a CHILD secondary may sit in a shared
--     space is not ratified, so it is not decided here.
--   - judged on INSERT, or when room or site changes. A status-only UPDATE (supersede, end, cancel) is
--     never re-judged, unlike the placement trigger, so a later room reclassification cannot make
--     history impossible to close.
--
-- Census before applying (deployed primary, gar_ef9c6d6f1f703d): 2 live rows carry a room, 0 resolve
-- to another site, 0 are non-groups; 0 closed rows with a wrong site. Blast radius on existing data: none.
--
-- Body otherwise identical to 20260811120100_staff_assignment_eligibility_employment_v1.sql.
-- Re-runnable: CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION public.validate_schedule_assignments_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_agreement_org uuid;
  v_agreement_member uuid;
  v_agreement_site uuid;
  v_pattern_org uuid;
  v_pattern_site uuid;
  v_person_org uuid;
  v_person_archived_at timestamptz;
  v_member_org uuid;
  v_room_org uuid;
  v_program_org uuid;
  v_program_site uuid;
  v_type_org uuid;
  v_type_subject_types text[];
  v_commitment text;
  v_room_changed boolean;
BEGIN
  v_commitment := COALESCE(NEW.commitment_kind, 'committed');

  SELECT org_id, site_location_id
    INTO v_pattern_org, v_pattern_site
  FROM public.schedule_patterns
  WHERE id = NEW.schedule_pattern_id;

  IF v_pattern_org IS NULL OR v_pattern_org <> NEW.org_id THEN
    RAISE EXCEPTION 'Schedule pattern must belong to the assignment organization';
  END IF;

  IF NEW.subject_type = 'child' THEN
    IF v_commitment = 'proposed' THEN
      -- Planning: member + site, no agreement.
      IF NEW.enrollment_agreement_id IS NOT NULL THEN
        RAISE EXCEPTION 'Proposed assignment cannot reference an enrollment agreement';
      END IF;
      IF NEW.customer_member_id IS NULL OR NEW.site_location_id IS NULL THEN
        RAISE EXCEPTION 'Proposed assignment requires a child and site';
      END IF;
      SELECT org_id INTO v_member_org
      FROM public.customer_members
      WHERE id = NEW.customer_member_id;
      IF v_member_org IS NULL OR v_member_org <> NEW.org_id THEN
        RAISE EXCEPTION 'Child must belong to the assignment organization';
      END IF;
    ELSE
      SELECT org_id, customer_member_id, site_location_id
        INTO v_agreement_org, v_agreement_member, v_agreement_site
      FROM public.child_enrollment_agreements
      WHERE id = NEW.enrollment_agreement_id;

      IF v_agreement_org IS NULL OR v_agreement_org <> NEW.org_id THEN
        RAISE EXCEPTION 'Enrollment agreement must belong to the assignment organization';
      END IF;
      IF NEW.customer_member_id <> v_agreement_member THEN
        RAISE EXCEPTION 'Customer member must match the enrollment agreement';
      END IF;
      NEW.site_location_id := v_agreement_site;
    END IF;
  ELSE
    -- Staff subject. Identity stays on persons; EMPLOYMENT decides eligibility.
    SELECT org_id, archived_at
      INTO v_person_org, v_person_archived_at
    FROM public.persons
    WHERE id = NEW.subject_person_id;

    IF v_person_org IS NULL OR v_person_org <> NEW.org_id THEN
      RAISE EXCEPTION 'Staff subject must be a person in the assignment organization';
    END IF;
    IF v_person_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Staff subject person is archived';
    END IF;
    IF NOT public.person_is_employed_on(NEW.org_id, NEW.subject_person_id, NEW.start_date) THEN
      RAISE EXCEPTION
        'Staff subject must have canonical employment covering the assignment start date'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.site_location_id IS NULL OR v_pattern_site <> NEW.site_location_id THEN
    RAISE EXCEPTION 'Schedule pattern must belong to the assignment site';
  END IF;

  IF NEW.room_location_id IS NOT NULL THEN
    SELECT org_id INTO v_room_org
    FROM public.locations
    WHERE id = NEW.room_location_id;
    IF v_room_org IS NULL OR v_room_org <> NEW.org_id THEN
      RAISE EXCEPTION 'Room must belong to the assignment organization';
    END IF;

    -- THE ROOM RESOLVES UNDER THE ASSIGNMENT'S SITE (and a STAFF room is an operational group).
    -- Judged when a row is written with a room, or its room or site changes - never on a status-only
    -- close, so history is not re-judged by a later reclassification.
    IF TG_OP = 'INSERT' THEN
      v_room_changed := true;
    ELSE
      v_room_changed := NEW.room_location_id IS DISTINCT FROM OLD.room_location_id
                     OR NEW.site_location_id IS DISTINCT FROM OLD.site_location_id;
    END IF;
    IF v_room_changed THEN
      IF public.location_site_id(NEW.room_location_id) IS DISTINCT FROM NEW.site_location_id THEN
        RAISE EXCEPTION 'Room must resolve to the assignment site' USING ERRCODE = '23514';
      END IF;
      IF NEW.subject_type = 'staff'
         AND public.location_unit_role(NEW.room_location_id) IS DISTINCT FROM 'operational_group' THEN
        RAISE EXCEPTION 'A staff assignment room must be an operational group' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF NEW.program_category_id IS NOT NULL THEN
    SELECT org_id, site_location_id INTO v_program_org, v_program_site
    FROM public.location_program_categories
    WHERE id = NEW.program_category_id;
    IF v_program_org IS NULL OR v_program_org <> NEW.org_id OR v_program_site <> NEW.site_location_id THEN
      RAISE EXCEPTION 'Program category must belong to the assignment site';
    END IF;
  END IF;

  IF NEW.operational_assignment_type_id IS NOT NULL THEN
    SELECT org_id, subject_types INTO v_type_org, v_type_subject_types
    FROM public.operational_assignment_types
    WHERE id = NEW.operational_assignment_type_id;
    IF v_type_org IS NULL OR v_type_org <> NEW.org_id OR NOT (NEW.subject_type = ANY(v_type_subject_types)) THEN
      RAISE EXCEPTION 'Assignment type must belong to the organization and support the subject type';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


DO $selftest$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.validate_schedule_assignments_consistency'::regproc) INTO v_def;
  IF position('location_site_id(NEW.room_location_id)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'selftest: the room-under-site check is missing from the consistency trigger';
  END IF;
  IF position('person_is_employed_on' IN v_def) = 0 THEN
    RAISE EXCEPTION 'selftest: the staff employment check was lost in the replacement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_schedule_assignments_consistency' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'selftest: trg_validate_schedule_assignments_consistency is not attached';
  END IF;
END
$selftest$;
