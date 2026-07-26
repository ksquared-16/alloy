-- Assignment commitment kind — proposed (participation) vs committed (agreement)
-- ---------------------------------------------------------------------------
-- Extends schedule_assignments so planning assignments can exist before an
-- enrollment agreement is created, without inventing a parallel ledger.

ALTER TABLE public.schedule_assignments
  ADD COLUMN IF NOT EXISTS commitment_kind text NOT NULL DEFAULT 'committed';

UPDATE public.schedule_assignments
SET commitment_kind = 'committed'
WHERE commitment_kind IS DISTINCT FROM 'committed'
  AND commitment_kind IS DISTINCT FROM 'proposed';

ALTER TABLE public.schedule_assignments
  DROP CONSTRAINT IF EXISTS schedule_assignments_commitment_kind_check;

ALTER TABLE public.schedule_assignments
  ADD CONSTRAINT schedule_assignments_commitment_kind_check
  CHECK (commitment_kind IN ('proposed', 'committed'));

-- Replace child shape: proposed requires member+site and null agreement;
-- committed requires member+agreement (+ site when present).
ALTER TABLE public.schedule_assignments
  DROP CONSTRAINT IF EXISTS schedule_assignments_subject_shape_check;

ALTER TABLE public.schedule_assignments
  ADD CONSTRAINT schedule_assignments_subject_shape_check
  CHECK (
    (
      subject_type = 'child'
      AND customer_member_id IS NOT NULL
      AND (
        (
          commitment_kind = 'committed'
          AND enrollment_agreement_id IS NOT NULL
        )
        OR (
          commitment_kind = 'proposed'
          AND enrollment_agreement_id IS NULL
          AND site_location_id IS NOT NULL
        )
      )
      AND subject_person_id IS NULL
    )
    OR (
      subject_type = 'staff'
      AND commitment_kind = 'committed'
      AND enrollment_agreement_id IS NULL
      AND customer_member_id IS NULL
      AND subject_person_id IS NOT NULL
      AND site_location_id IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.schedule_assignments
  VALIDATE CONSTRAINT schedule_assignments_subject_shape_check;

CREATE INDEX IF NOT EXISTS schedule_assignments_proposed_child_idx
  ON public.schedule_assignments (org_id, customer_member_id, start_date, end_date)
  WHERE subject_type = 'child' AND commitment_kind = 'proposed';

COMMENT ON COLUMN public.schedule_assignments.commitment_kind IS
  'proposed = participation/planning anchor (no agreement); committed = agreement-backed operational truth.';
