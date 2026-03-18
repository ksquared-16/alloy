-- Typed field_values columns (source of truth per field_type)
ALTER TABLE public.field_values
  ADD COLUMN IF NOT EXISTS value_text text,
  ADD COLUMN IF NOT EXISTS value_number double precision,
  ADD COLUMN IF NOT EXISTS value_boolean boolean,
  ADD COLUMN IF NOT EXISTS value_date timestamptz,
  ADD COLUMN IF NOT EXISTS value_json jsonb;

UPDATE public.field_values
SET value_text = COALESCE(value_text, value)
WHERE value IS NOT NULL AND (value_text IS NULL OR value_text = '');

COMMENT ON COLUMN public.field_values.value_text IS 'Text/email/phone and display fallback';
COMMENT ON COLUMN public.field_values.value_number IS 'Numeric field values';
COMMENT ON COLUMN public.field_values.value_boolean IS 'Boolean field values';
COMMENT ON COLUMN public.field_values.value_date IS 'Date/datetime field values';
COMMENT ON COLUMN public.field_values.value_json IS 'JSON field values';

-- Person ↔ location association (quote-start, CRM)
CREATE TABLE IF NOT EXISTS public.person_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  person_id uuid NOT NULL REFERENCES public.persons (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'associated',
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_locations_person_location_unique UNIQUE (person_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_person_locations_org_person ON public.person_locations (org_id, person_id);
CREATE INDEX IF NOT EXISTS idx_person_locations_location ON public.person_locations (location_id);

COMMENT ON TABLE public.person_locations IS 'Links persons to locations (e.g. quote property, home)';
