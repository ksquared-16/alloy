-- Proposed assignments: consistency trigger must not require an enrollment agreement.
-- Smallest fix for validate_schedule_assignments_consistency after commitment_kind.

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
  v_person_is_employee boolean;
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
    SELECT org_id, is_employee, archived_at
      INTO v_person_org, v_person_is_employee, v_person_archived_at
    FROM public.persons
    WHERE id = NEW.subject_person_id;
    IF v_person_org IS NULL
       OR v_person_org <> NEW.org_id
       OR v_person_is_employee IS NOT TRUE
       OR v_person_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Staff subject must be an active employee in the assignment organization';
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
  'Org/site/pattern/type integrity for schedule_assignments. Proposed child rows validate member+site without an enrollment agreement.';
