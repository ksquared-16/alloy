-- Program-backed promos: allow discount_redemptions without legacy discount_code_id.

ALTER TABLE public.discount_redemptions
    ADD COLUMN IF NOT EXISTS discount_program_id uuid REFERENCES public.discount_programs (id) ON DELETE SET NULL;

ALTER TABLE public.discount_redemptions
    ALTER COLUMN discount_code_id DROP NOT NULL;

ALTER TABLE public.discount_redemptions
    DROP CONSTRAINT IF EXISTS discount_redemptions_discount_code_id_customer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS discount_redemptions_discount_code_customer_unique
    ON public.discount_redemptions (discount_code_id, customer_id)
    WHERE discount_code_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS discount_redemptions_discount_program_customer_unique
    ON public.discount_redemptions (discount_program_id, customer_id)
    WHERE discount_program_id IS NOT NULL;

COMMENT ON COLUMN public.discount_redemptions.discount_program_id IS 'Redemption for discount_programs; discount_code_id may be null for program-only promos.';
