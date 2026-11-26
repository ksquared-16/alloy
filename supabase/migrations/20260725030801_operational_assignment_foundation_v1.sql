-- Assignment Platform foundation
-- ------------------------------
-- `schedule_assignments` is the existing effective-dated operational commitment
-- ledger. Extend it in place rather than creating a second scheduling engine:
-- its physical name remains a compatibility detail while its rows can now model
-- recurring commitments for a child or a staff person.

CREATE TABLE IF NOT EXISTS public.operational_assignment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  icon_key text NOT NULL DEFAULT 'calendar-clock',
  visual_tone text NOT NULL DEFAULT 'neutral',
  subject_types text[] NOT NULL DEFAULT ARRAY['child']::text[],
  default_behavior jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_participation text NOT NULL DEFAULT 'none',
  attendance_participation text NOT NULL DEFAULT 'expected',
  staffing_participation text NOT NULL DEFAULT 'none',
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_assignment_types_org_key_key UNIQUE (org_id, key),
  CONSTRAINT operational_assignment_types_key_format_check
    CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  CONSTRAINT operational_assignment_types_label_not_blank_check
    CHECK (length(btrim(label)) > 0),
  CONSTRAINT operational_assignment_types_subject_types_check
    CHECK (
      cardinality(subject_types) > 0
      AND subject_types <@ ARRAY['child', 'staff']::text[]
    ),
  CONSTRAINT operational_assignment_types_visual_tone_check
    CHECK (visual_tone IN ('neutral', 'info', 'success', 'warning', 'accent')),
  CONSTRAINT operational_assignment_types_billing_participation_check
    CHECK (billing_participation IN ('none', 'eligible')),
  CONSTRAINT operational_assignment_types_attendance_participation_check
    CHECK (attendance_participation IN ('none', 'expected')),
  CONSTRAINT operational_assignment_types_staffing_participation_check
    CHECK (staffing_participation IN ('none', 'supply', 'demand'))
);

CREATE INDEX IF NOT EXISTS operational_assignment_types_org_active_sort_idx
  ON public.operational_assignment_types (org_id, is_active, sort_order, label);

ALTER TABLE public.operational_assignment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY operational_assignment_types_org_member_select
  ON public.operational_assignment_types
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops', 'manager']));

CREATE POLICY operational_assignment_types_org_operator_insert
  ON public.operational_assignment_types
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops']));

CREATE POLICY operational_assignment_types_org_operator_update
  ON public.operational_assignment_types
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops']))
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner', 'admin', 'ops']));

CREATE POLICY operational_assignment_types_org_admin_delete
  ON public.operational_assignment_types
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, ARRAY['owner', 'admin']));

CREATE TRIGGER set_operational_assignment_types_updated_at
  BEFORE UPDATE ON public.operational_assignment_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.schedule_assignments
  ADD COLUMN IF NOT EXISTS subject_type text NOT NULL DEFAULT 'child',
  ADD COLUMN IF NOT EXISTS subject_person_id uuid REFERENCES public.persons(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS site_location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS room_location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS program_category_id uuid REFERENCES public.location_program_categories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS operational_assignment_type_id uuid REFERENCES public.operational_assignment_types(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Existing commitments are child commitments. Their compatibility placement is
-- copied onto the assignment so supplemental commitments can each own a room.
UPDATE public.schedule_assignments sa
SET
  subject_type = 'child',
  site_location_id = cea.site_location_id,
  room_location_id = (
    SELECT cp.room_location_id
    FROM public.child_placements cp
    WHERE cp.org_id = sa.org_id
      AND cp.enrollment_agreement_id = sa.enrollment_agreement_id
      AND cp.start_date <= sa.start_date
      AND (cp.end_date IS NULL OR cp.end_date >= sa.start_date)
    ORDER BY cp.start_date DESC, cp.created_at DESC
    LIMIT 1
  ),
  program_category_id = (
    SELECT cp.program_category_id
    FROM public.child_placements cp
    WHERE cp.org_id = sa.org_id
      AND cp.enrollment_agreement_id = sa.enrollment_agreement_id
      AND cp.start_date <= sa.start_date
      AND (cp.end_date IS NULL OR cp.end_date >= sa.start_date)
    ORDER BY cp.start_date DESC, cp.created_at DESC
    LIMIT 1
  ),
  is_primary = CASE
    WHEN sa.status IN ('active', 'planned', 'ending') THEN true
    ELSE false
  END
FROM public.child_enrollment_agreements cea
WHERE cea.id = sa.enrollment_agreement_id
  AND cea.org_id = sa.org_id;

ALTER TABLE public.schedule_assignments
  ALTER COLUMN enrollment_agreement_id DROP NOT NULL,
  ALTER COLUMN customer_member_id DROP NOT NULL;

-- Replace the child-only, one-current-row restriction. Concurrent secondary
-- assignments are allowed. Primary uniqueness is effective-dated (overlap
-- trigger below) — never a global unique on operational status that would
-- block non-overlapping history or future primary changes.
ALTER TABLE public.schedule_assignments
  DROP CONSTRAINT IF EXISTS schedule_assignments_one_operational_per_agreement;

DROP INDEX IF EXISTS public.ux_schedule_assignments_one_operational_per_agreement;
DROP INDEX IF EXISTS public.schedule_assignments_one_primary_child_idx;

CREATE INDEX IF NOT EXISTS schedule_assignments_subject_effective_idx
  ON public.schedule_assignments (org_id, subject_type, subject_person_id, start_date, end_date)
  WHERE subject_type = 'staff';

CREATE INDEX IF NOT EXISTS schedule_assignments_child_type_effective_idx
  ON public.schedule_assignments (org_id, customer_member_id, operational_assignment_type_id, start_date, end_date)
  WHERE subject_type = 'child';

CREATE INDEX IF NOT EXISTS schedule_assignments_primary_child_effective_idx
  ON public.schedule_assignments (org_id, enrollment_agreement_id, start_date, end_date)
  WHERE subject_type = 'child' AND is_primary;

CREATE INDEX IF NOT EXISTS schedule_assignments_primary_staff_effective_idx
  ON public.schedule_assignments (org_id, subject_person_id, start_date, end_date)
  WHERE subject_type = 'staff' AND is_primary;

ALTER TABLE public.schedule_assignments
  ADD CONSTRAINT schedule_assignments_subject_type_check
  CHECK (subject_type IN ('child', 'staff')) NOT VALID,
  ADD CONSTRAINT schedule_assignments_subject_shape_check
  CHECK (
    (
      subject_type = 'child'
      AND enrollment_agreement_id IS NOT NULL
      AND customer_member_id IS NOT NULL
      AND subject_person_id IS NULL
    )
    OR (
      subject_type = 'staff'
      AND enrollment_agreement_id IS NULL
      AND customer_member_id IS NULL
      AND subject_person_id IS NOT NULL
      AND site_location_id IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.schedule_assignments
  VALIDATE CONSTRAINT schedule_assignments_subject_type_check,
  VALIDATE CONSTRAINT schedule_assignments_subject_shape_check;

-- Effective-dated primary uniqueness: zero or one primary per subject at any
-- calendar day. Historical ended and non-overlapping future primaries coexist.
CREATE OR REPLACE FUNCTION public.schedule_assignment_date_ranges_overlap(
  a_start date,
  a_end date,
  b_start date,
  b_end date
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT a_start <= COALESCE(b_end, 'infinity'::date)
     AND b_start <= COALESCE(a_end, 'infinity'::date);
$$;

CREATE OR REPLACE FUNCTION public.validate_schedule_assignments_primary_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.schedule_assignments sa
    WHERE sa.org_id = NEW.org_id
      AND sa.id IS DISTINCT FROM NEW.id
      AND sa.is_primary IS TRUE
      AND sa.subject_type = NEW.subject_type
      AND (
        (
          NEW.subject_type = 'child'
          AND sa.enrollment_agreement_id = NEW.enrollment_agreement_id
        )
        OR (
          NEW.subject_type = 'staff'
          AND sa.subject_person_id = NEW.subject_person_id
        )
      )
      AND public.schedule_assignment_date_ranges_overlap(
        sa.start_date,
        sa.end_date,
        NEW.start_date,
        NEW.end_date
      )
  ) THEN
    RAISE EXCEPTION
      'Overlapping primary assignment periods are not allowed for the same subject'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_schedule_assignments_primary_overlap
  ON public.schedule_assignments;
CREATE TRIGGER trg_validate_schedule_assignments_primary_overlap
  BEFORE INSERT OR UPDATE OF is_primary, start_date, end_date, subject_type,
    enrollment_agreement_id, subject_person_id
  ON public.schedule_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_schedule_assignments_primary_overlap();

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
  v_room_org uuid;
  v_program_org uuid;
  v_program_site uuid;
  v_type_org uuid;
  v_type_subject_types text[];
BEGIN
  SELECT org_id, customer_member_id, site_location_id
    INTO v_agreement_org, v_agreement_member, v_agreement_site
  FROM public.child_enrollment_agreements
  WHERE id = NEW.enrollment_agreement_id;

  SELECT org_id, site_location_id
    INTO v_pattern_org, v_pattern_site
  FROM public.schedule_patterns
  WHERE id = NEW.schedule_pattern_id;

  IF v_pattern_org IS NULL OR v_pattern_org <> NEW.org_id THEN
    RAISE EXCEPTION 'Schedule pattern must belong to the assignment organization';
  END IF;

  IF NEW.subject_type = 'child' THEN
    IF v_agreement_org IS NULL OR v_agreement_org <> NEW.org_id THEN
      RAISE EXCEPTION 'Enrollment agreement must belong to the assignment organization';
    END IF;
    IF NEW.customer_member_id <> v_agreement_member THEN
      RAISE EXCEPTION 'Customer member must match the enrollment agreement';
    END IF;
    NEW.site_location_id := v_agreement_site;
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

COMMENT ON TABLE public.operational_assignment_types IS
  'Configuration-owned vocabulary and participation defaults for recurring operational assignments.';
COMMENT ON COLUMN public.schedule_assignments.subject_type IS
  'Operational subject class. The table name remains for compatibility; rows are generic assignment commitments.';
COMMENT ON COLUMN public.schedule_assignments.is_primary IS
  'Effective-dated operational-home flag for child or staff. Overlapping primaries for one subject are rejected; non-overlapping history and future primaries are allowed. Child placement remains compatibility authority for the child home room during migration.';
