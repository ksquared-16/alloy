-- Align opportunities with discount program model (jobs already have discount_program_id).
ALTER TABLE public.opportunities
    ADD COLUMN IF NOT EXISTS discount_program_id uuid REFERENCES public.discount_programs (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS opportunities_discount_program_id_idx ON public.opportunities (discount_program_id);

COMMENT ON COLUMN public.opportunities.discount_program_id IS 'Selected discount program for quote/booking. May pair with discount_code_id when program maps to a legacy code.';
