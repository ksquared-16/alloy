-- assignments table only. assignment_statuses already exists (offered, accepted, declined, removed, completed).
-- One row per schedule (current vendor assignment for that occurrence).

CREATE TABLE IF NOT EXISTS public.assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    assignment_status_id uuid REFERENCES public.assignment_statuses(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(schedule_id)
);

CREATE INDEX IF NOT EXISTS assignments_schedule_id_idx ON public.assignments (schedule_id);
CREATE INDEX IF NOT EXISTS assignments_job_id_idx ON public.assignments (job_id);
CREATE INDEX IF NOT EXISTS assignments_vendor_id_idx ON public.assignments (vendor_id);
CREATE INDEX IF NOT EXISTS assignments_status_id_idx ON public.assignments (assignment_status_id);

COMMENT ON TABLE public.assignments IS 'Vendor assignment per schedule occurrence; one active assignment per schedule. Uses existing assignment_statuses (e.g. offered, accepted, declined).';
