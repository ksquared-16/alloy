-- Org-scoped location types (config-driven dropdown). locations.location_type_id references this.

CREATE TABLE IF NOT EXISTS public.location_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    position int NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS location_types_org_id_idx ON public.location_types (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS location_types_org_id_key_key ON public.location_types (org_id, key);
COMMENT ON TABLE public.location_types IS 'Org-scoped location type config; locations reference by location_type_id.';

-- Link locations to config type; keep location_type (text) for backward compatibility.
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS location_type_id uuid REFERENCES public.location_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS locations_location_type_id_idx ON public.locations (location_type_id);
COMMENT ON COLUMN public.locations.location_type_id IS 'Config-driven type; location_type text kept in sync for backward compat.';
