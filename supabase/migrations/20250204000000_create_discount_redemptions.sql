-- Discount redemptions: one redemption per (discount_code, customer) for "used once per customer".
-- Referenced by backend validate (check before allowing discount) and web confirm (insert after job created).

CREATE TABLE IF NOT EXISTS public.discount_redemptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_code_id uuid NOT NULL REFERENCES public.discount_codes(id),
    customer_id uuid NOT NULL REFERENCES public.customers(id),
    contact_id uuid NOT NULL REFERENCES public.contacts(id),
    job_id uuid NOT NULL REFERENCES public.jobs(id),
    booking_attempt_id uuid,
    redeemed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT discount_redemptions_discount_code_id_customer_id_key UNIQUE (discount_code_id, customer_id)
);

CREATE INDEX IF NOT EXISTS discount_redemptions_customer_id_idx ON public.discount_redemptions (customer_id);
CREATE INDEX IF NOT EXISTS discount_redemptions_discount_code_id_idx ON public.discount_redemptions (discount_code_id);

COMMENT ON TABLE public.discount_redemptions IS 'One redemption per discount code per customer; used to enforce "used once per customer".';
