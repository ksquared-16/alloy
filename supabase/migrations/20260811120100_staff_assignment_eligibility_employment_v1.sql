-- Staff assignment eligibility → canonical Employment (Staff Foundation Phase 1)
-- =============================================================================
-- Before: a staff schedule_assignment was admitted when `persons.is_employee`
-- was TRUE. That boolean was authored in
-- 20260528120000_waitlist_priority_fact_truth_child_scope.sql for WAITLIST
-- HOUSEHOLD PRIORITY ("this parent works here"), is catalogued in the field
-- library under "Parent / Contact", carries no dates, no position, no scope and
-- no history, and cannot express a person who USED to work here.
--
-- After: eligibility is `public.person_is_employed_on(org, person, start_date)`
-- — the effective-time employment authority from the previous migration.
--
-- Consequences:
--  - A person with `is_employee = true` and no employment row is NO LONGER an
--    eligible staff subject. This is the intended correction. There are no
--    staff assignment rows to regress (subject_type='staff' count is 0), so the
--    change cannot invalidate existing data.
--  - A historical staff assignment stays valid after employment ends, because
--    `person_is_employed_on` asks about the assignment's own start_date and an
--    ended employment still covers the days inside its window.
--
-- `persons.is_employee` is deliberately NOT dropped, NOT backfilled and NOT
-- given a replacement boolean. It keeps its authored waitlist meaning. Its
-- retirement path is recorded on the column comment below.
--
-- Rollback: restore the prior function body from
-- 20260726200000_assignment_proposed_consistency_trigger_v1.sql. The trigger
-- binding, table shape and every other branch are unchanged by this migration.
-- =============================================================================

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

COMMENT ON FUNCTION public.validate_schedule_assignments_consistency() IS
  'Org/site/pattern/type integrity for schedule_assignments. Proposed child rows validate member+site without an enrollment agreement. Staff rows require canonical employment covering the assignment start date (public.person_is_employed_on) — never persons.is_employee.';

COMMENT ON COLUMN public.persons.is_employee IS
  'WAITLIST FACT ONLY — household priority signal via customer_persons ("a parent who works here"). NOT employment authority: as of the Staff Foundation, staff assignment eligibility reads public.employments through public.person_is_employed_on(). Retirement path: once every consumer of this column is either migrated to employments or confirmed waitlist-only, rename it to waitlist_employee_priority and drop the ambiguous name. Do not add a replacement boolean on persons.';
