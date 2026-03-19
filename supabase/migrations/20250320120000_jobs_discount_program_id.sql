-- Optional link from jobs to discount programs (admin selection + future runtime).
-- Legacy discount_code_id remains for booking/redemptions until full migration.

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS discount_program_id uuid REFERENCES public.discount_programs (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_discount_program_id_idx ON public.jobs (discount_program_id);

COMMENT ON COLUMN public.jobs.discount_program_id IS 'Selected discount program (admin). When set with legacy_discount_code_id on the program, discount_code_id may duplicate the legacy code id for booking compatibility.';
