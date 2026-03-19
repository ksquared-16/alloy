-- Additive evolution of public.documents for AI/OCR/generation and structured field + version data.
-- Does not CREATE/DROP/RENAME the documents table. Existing RLS on documents is unchanged.

-- ---------------------------------------------------------------------------
-- RLS helper: org membership with role in allowed set (matches documents spirit).
-- SECURITY DEFINER so policies can evaluate without requiring SELECT RLS on user_roles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_org_role_any(p_org_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.org_id = p_org_id
      AND ur.role = ANY (p_roles)
  );
$$;

COMMENT ON FUNCTION public.user_has_org_role_any(uuid, text[]) IS
  'RLS helper: true if auth.uid() has one of p_roles for p_org_id in user_roles.';

REVOKE ALL ON FUNCTION public.user_has_org_role_any(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_org_role_any(uuid, text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- documents: extraction / generation columns (all additive)
-- ---------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_status text,
  ADD COLUMN IF NOT EXISTS extraction_provider text,
  ADD COLUMN IF NOT EXISTS extraction_error text,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS generated_from_document_id uuid,
  ADD COLUMN IF NOT EXISTS template_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documents_generated_from_document_id_fkey'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_generated_from_document_id_fkey
      FOREIGN KEY (generated_from_document_id)
      REFERENCES public.documents (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

COMMENT ON COLUMN public.documents.extracted_text IS 'Full text from OCR/parsing; supports future document_extraction_completed-style workflows.';
COMMENT ON COLUMN public.documents.extracted_data IS 'Structured extraction output keyed by field or provider schema.';
COMMENT ON COLUMN public.documents.generated_from_document_id IS 'Provenance when this row is generated from another document (e.g. PDF from template).';

-- ---------------------------------------------------------------------------
-- document_field_definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,
  doc_type text NOT NULL,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  is_ai_extractable boolean NOT NULL DEFAULT false,
  extraction_hint text,
  sort_order integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (org_id, doc_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_document_field_definitions_org_doc_type
  ON public.document_field_definitions (org_id, doc_type);

COMMENT ON TABLE public.document_field_definitions IS
  'Per-org, per-doc_type field schema for structured document values and AI extraction hints.';

-- ---------------------------------------------------------------------------
-- document_field_values
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
  field_definition_id uuid REFERENCES public.document_field_definitions (id) ON DELETE SET NULL,
  field_key text NOT NULL,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (document_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_document_field_values_document_id
  ON public.document_field_values (document_id);

COMMENT ON TABLE public.document_field_values IS
  'Typed values for document fields; aligns with definitions when field_definition_id is set.';

-- ---------------------------------------------------------------------------
-- document_versions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  storage_path text,
  original_filename text,
  mime_type text,
  byte_size bigint,
  checksum_sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document_id
  ON public.document_versions (document_id);

COMMENT ON TABLE public.document_versions IS
  'Immutable-ish file snapshots per document for audit and future document_uploaded/version events.';

-- ---------------------------------------------------------------------------
-- Grants (RLS still applies)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_field_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_field_values TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;

GRANT ALL ON TABLE public.document_field_definitions TO service_role;
GRANT ALL ON TABLE public.document_field_values TO service_role;
GRANT ALL ON TABLE public.document_versions TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: SELECT owner/admin/ops/manager; INSERT/UPDATE owner/admin/ops; DELETE owner/admin
-- ---------------------------------------------------------------------------
ALTER TABLE public.document_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- document_field_definitions
CREATE POLICY document_field_definitions_select
  ON public.document_field_definitions
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_org_role_any(
      org_id,
      ARRAY['owner', 'admin', 'ops', 'manager']::text[]
    )
  );

CREATE POLICY document_field_definitions_insert
  ON public.document_field_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin', 'ops']::text[])
  );

CREATE POLICY document_field_definitions_update
  ON public.document_field_definitions
  FOR UPDATE
  TO authenticated
  USING (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin', 'ops']::text[])
  )
  WITH CHECK (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin', 'ops']::text[])
  );

CREATE POLICY document_field_definitions_delete
  ON public.document_field_definitions
  FOR DELETE
  TO authenticated
  USING (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin']::text[])
  );

-- document_field_values
CREATE POLICY document_field_values_select
  ON public.document_field_values
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_org_role_any(
      org_id,
      ARRAY['owner', 'admin', 'ops', 'manager']::text[]
    )
  );

CREATE POLICY document_field_values_insert
  ON public.document_field_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin', 'ops']::text[])
  );

CREATE POLICY document_field_values_update
  ON public.document_field_values
  FOR UPDATE
  TO authenticated
  USING (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin', 'ops']::text[])
  )
  WITH CHECK (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin', 'ops']::text[])
  );

CREATE POLICY document_field_values_delete
  ON public.document_field_values
  FOR DELETE
  TO authenticated
  USING (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin']::text[])
  );

-- document_versions
CREATE POLICY document_versions_select
  ON public.document_versions
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_org_role_any(
      org_id,
      ARRAY['owner', 'admin', 'ops', 'manager']::text[]
    )
  );

CREATE POLICY document_versions_insert
  ON public.document_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin', 'ops']::text[])
  );

CREATE POLICY document_versions_update
  ON public.document_versions
  FOR UPDATE
  TO authenticated
  USING (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin', 'ops']::text[])
  )
  WITH CHECK (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin', 'ops']::text[])
  );

CREATE POLICY document_versions_delete
  ON public.document_versions
  FOR DELETE
  TO authenticated
  USING (
    public.user_has_org_role_any(org_id, ARRAY['owner', 'admin']::text[])
  );
