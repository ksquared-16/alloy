-- Configurable settings for the person model (additive; no removal of contacts/customer_members).
-- customer_person_role_types: roles when linking a person to a customer (e.g. primary_contact, billing).
-- person_relationship_type_settings: types for person-to-person relationships (e.g. spouse, parent).

-- Customer person role types (org-scoped)
CREATE TABLE IF NOT EXISTS public.customer_person_role_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order int NOT NULL DEFAULT 100,
    is_system boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS customer_person_role_types_org_id_idx ON public.customer_person_role_types (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_person_role_types_org_id_key_key ON public.customer_person_role_types (org_id, key);
COMMENT ON TABLE public.customer_person_role_types IS 'Org-scoped role types for customer_persons (person linked to customer). Used for dropdowns; customer_persons.role stores key.';

-- Person relationship type settings (org-scoped)
CREATE TABLE IF NOT EXISTS public.person_relationship_type_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order int NOT NULL DEFAULT 100,
    is_system boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS person_relationship_type_settings_org_id_idx ON public.person_relationship_type_settings (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS person_relationship_type_settings_org_id_key_key ON public.person_relationship_type_settings (org_id, key);
COMMENT ON TABLE public.person_relationship_type_settings IS 'Org-scoped relationship types for person_relationships. Used for dropdowns; person_relationships.relationship_type stores key.';

-- updated_at trigger (reuse function if exists from pricing_matrix migration)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_person_role_types_updated_at ON public.customer_person_role_types;
CREATE TRIGGER customer_person_role_types_updated_at
    BEFORE UPDATE ON public.customer_person_role_types
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS person_relationship_type_settings_updated_at ON public.person_relationship_type_settings;
CREATE TRIGGER person_relationship_type_settings_updated_at
    BEFORE UPDATE ON public.person_relationship_type_settings
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
