-- Job-level default vendor for recurring work (idempotent).
-- Fixes staging: "Could not find the 'assigned_vendor_id' column of 'jobs' in the schema cache"

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS assigned_vendor_id uuid NULL;

-- FK only if we're adding the column; avoid duplicate constraint when re-running.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'jobs'
      AND constraint_name = 'jobs_assigned_vendor_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'assigned_vendor_id'
  ) THEN
    ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_assigned_vendor_id_fkey
    FOREIGN KEY (assigned_vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS jobs_assigned_vendor_id_idx ON public.jobs (assigned_vendor_id);

COMMENT ON COLUMN public.jobs.assigned_vendor_id IS 'Default vendor for this job; applied to new/upcoming schedules when no schedule-level assignment or status is assigned.';
