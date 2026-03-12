-- Add industry_id to person type settings so defaults can be industry-driven (primary) alongside optional vertical.
-- Resolution: active rows for org + (industry_id = org.industry_id OR industry_id IS NULL); de-dupe by key (industry-specific wins); sort by sort_order, label.

-- customer_person_role_types
ALTER TABLE public.customer_person_role_types
    ADD COLUMN IF NOT EXISTS industry_id uuid NULL REFERENCES public.industries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_person_role_types_industry_id_idx
    ON public.customer_person_role_types (industry_id);

-- One universal row per (org_id, key) when industry_id IS NULL; one per (org_id, industry_id, key) when industry_id set
DROP INDEX IF EXISTS public.customer_person_role_types_org_id_key_key;
CREATE UNIQUE INDEX customer_person_role_types_org_key_industry_unique
    ON public.customer_person_role_types (org_id, key) WHERE industry_id IS NULL;
CREATE UNIQUE INDEX customer_person_role_types_org_industry_key_unique
    ON public.customer_person_role_types (org_id, industry_id, key) WHERE industry_id IS NOT NULL;

COMMENT ON COLUMN public.customer_person_role_types.industry_id IS 'When set, row is industry-specific (org industry drives which rows apply). Null = universal fallback.';

-- person_relationship_type_settings
ALTER TABLE public.person_relationship_type_settings
    ADD COLUMN IF NOT EXISTS industry_id uuid NULL REFERENCES public.industries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS person_relationship_type_settings_industry_id_idx
    ON public.person_relationship_type_settings (industry_id);

DROP INDEX IF EXISTS public.person_relationship_type_settings_org_id_key_key;
CREATE UNIQUE INDEX person_relationship_type_settings_org_key_industry_unique
    ON public.person_relationship_type_settings (org_id, key) WHERE industry_id IS NULL;
CREATE UNIQUE INDEX person_relationship_type_settings_org_industry_key_unique
    ON public.person_relationship_type_settings (org_id, industry_id, key) WHERE industry_id IS NOT NULL;

COMMENT ON COLUMN public.person_relationship_type_settings.industry_id IS 'When set, row is industry-specific. Null = universal fallback.';
