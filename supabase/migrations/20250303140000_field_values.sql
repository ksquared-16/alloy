-- Stores values for configurable (custom) entity fields. System fields live on entity tables (e.g. persons).
CREATE TABLE IF NOT EXISTS public.field_values (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    field_definition_id uuid NOT NULL,
    value text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (entity_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_field_values_entity ON public.field_values (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_field_values_org_entity ON public.field_values (org_id, entity_type, entity_id);

COMMENT ON TABLE public.field_values IS 'Values for custom (non-system) fields per entity. System fields are on entity tables (e.g. persons).';
