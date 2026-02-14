-- Token-based action links for vendor_accept_job, customer_reschedule, customer_cancel (SMS links).

CREATE TABLE IF NOT EXISTS public.action_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE,
    org_id uuid,
    action_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    metadata jsonb,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS action_links_token_key ON public.action_links (token);
CREATE INDEX IF NOT EXISTS action_links_entity_idx ON public.action_links (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS action_links_expires_at_idx ON public.action_links (expires_at);

COMMENT ON TABLE public.action_links IS 'One-time action links (e.g. vendor accept, customer reschedule/cancel)';
