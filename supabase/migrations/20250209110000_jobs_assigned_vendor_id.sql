-- Job-level default vendor for recurring work. Schedule-level assignments override per visit.

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS assigned_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_assigned_vendor_id_idx ON public.jobs (assigned_vendor_id);

COMMENT ON COLUMN public.jobs.assigned_vendor_id IS 'Default vendor for this job; applied to new/upcoming schedules when no schedule-level assignment or status is assigned.';
