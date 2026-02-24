-- Link jobs and schedules to locations. locations table must exist (org-wide and customer address locations).

-- Jobs: optional service location (customer address or org site).
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_org_id_location_id_idx ON public.jobs (org_id, location_id);
COMMENT ON COLUMN public.jobs.location_id IS 'Service location (customer address or org site).';

-- Schedules: optional location (defaults from job when not set).
ALTER TABLE public.schedules
ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS schedules_org_id_location_id_idx ON public.schedules (org_id, location_id);
COMMENT ON COLUMN public.schedules.location_id IS 'Where the service occurs; often same as job.location_id.';
