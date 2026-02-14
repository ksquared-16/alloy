-- Customer recurring subscriptions (V1). Linked to pricing_frequency for recurrence rules.

CREATE TABLE IF NOT EXISTS public.customer_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid,
    customer_id uuid NOT NULL,
    primary_contact_id uuid,
    vertical_id uuid,
    pricing_frequency_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'active',
    start_date date,
    end_date date,
    notes text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_subscriptions_org_id_idx ON public.customer_subscriptions (org_id);
CREATE INDEX IF NOT EXISTS customer_subscriptions_customer_id_idx ON public.customer_subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS customer_subscriptions_status_idx ON public.customer_subscriptions (status);
CREATE INDEX IF NOT EXISTS customer_subscriptions_pricing_frequency_id_idx ON public.customer_subscriptions (pricing_frequency_id);

COMMENT ON TABLE public.customer_subscriptions IS 'Recurring subscriptions per customer; links to pricing_frequency for recurrence_unit/interval';
