-- =============================================================================
-- Waitlist priority fact truth + child placement scope (Card 1 foundation)
-- =============================================================================
-- - persons: employee attributes for household priority facts
-- - opportunity_customer_members: child-level site + program cohort interest
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) persons — employee fields (org-scoped person profile)
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS is_employee boolean,
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS employee_source text;

COMMENT ON COLUMN public.persons.is_employee IS
  'When true, person is an org employee; used for waitlist household priority facts via customer_persons.';
COMMENT ON COLUMN public.persons.employee_id IS
  'Optional external HR / payroll identifier; not validated in platform v1.';
COMMENT ON COLUMN public.persons.employee_source IS
  'Optional provenance label (e.g. hr_import, manual).';

-- -----------------------------------------------------------------------------
-- 2) opportunity_customer_members — child site + cohort interest
-- -----------------------------------------------------------------------------
ALTER TABLE public.opportunity_customer_members
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS program_room_cohort_key text;

COMMENT ON COLUMN public.opportunity_customer_members.location_id IS
  'Child-selected site (locations.id). Controls valid program/cohort scope; maps to placement_candidates.site_id.';
COMMENT ON COLUMN public.opportunity_customer_members.program_room_cohort_key IS
  'Stable waitlist cohort key for this child inquiry; optional until authoring UI backfills.';

CREATE INDEX IF NOT EXISTS idx_opportunity_customer_members_org_location
  ON public.opportunity_customer_members (org_id, location_id)
  WHERE location_id IS NOT NULL;
