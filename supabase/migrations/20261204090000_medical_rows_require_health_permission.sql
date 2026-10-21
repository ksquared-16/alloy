-- =============================================================================
-- MEDICAL VISIBILITY — a child's medical rows need Medical's permission, at the database too.
--
-- Director policy: sensitive Medical history requires explicit Medical authorization; generic CRM,
-- Enrollment or Processing access does not grant it. `health.view` / `health.manage` are the
-- Medical permission keys (admin only by default; never ops).
--
-- The shared tables below grant org roles (owner/admin/ops/manager) SELECT through RLS, so a
-- signed-in operator's browser session could read a child's allergies (`field_values`), an
-- immunization record (`documents`) or a medical form's answers (`form_submissions`) straight from
-- PostgREST, whatever their Medical permission. No application code reads these tables with a
-- user-scoped client (every read uses the service role, behind the app's own checks) — this closes
-- the direct path.
--
-- RESTRICTIVE policies only: every existing permissive policy stays exactly as it is, and rows that
-- are not medical are unaffected. A medical row additionally requires:
--   read  → health.view      write → health.manage
--
-- Medical rows (the same classification the application uses):
--   field_values               customer_member fields allergies / medical_notes / special_diet /
--                              special_instructions, or any customer_member field in section 'medical'
--   documents                  doc_type physical / immunization_record / health_care_plan /
--                              medication_authorization
--   form_submissions (+ signatures, linked documents)
--                              submissions of a form that declares health capture or collects a
--                              health.* / medical.* collection or a child health profile field
--
-- Re-runnable: CREATE OR REPLACE / DROP … IF EXISTS throughout; self-verifying.
-- =============================================================================

-- ── 1. the caller's permission, for RLS ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_org_permission(_org_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL
       AND _permission_key = ANY (coalesce(public.effective_capability_keys(_org_id, auth.uid()), ARRAY[]::text[]));
$$;
REVOKE ALL ON FUNCTION public.has_org_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_permission(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_org_permission(uuid, text) TO authenticated, service_role;

-- ── 2. what is medical ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_child_health_field_definition(_field_definition_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.field_definitions fd
        WHERE fd.id = _field_definition_id
          AND fd.entity_type = 'customer_member'
          AND (fd.field_key = ANY (ARRAY['allergies', 'medical_notes', 'special_diet', 'special_instructions'])
               OR fd.section_key = 'medical')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_medical_form_definition(_form_definition_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.form_definitions fd
        WHERE fd.id = _form_definition_id AND fd.metadata ? 'health_capture'
    ) OR EXISTS (
        SELECT 1 FROM public.form_definition_versions v
        WHERE v.form_definition_id = _form_definition_id
          AND (v.schema_json::text ~ '"collection_provider_ref"\s*:\s*"(health|medical)\.'
               OR v.schema_json::text ~ '"field_key"\s*:\s*"(child_)?(allergies|medical_notes|special_diet|special_instructions)"')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_medical_form_submission(_form_submission_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.form_submissions fs
        WHERE fs.id = _form_submission_id AND public.is_medical_form_definition(fs.form_definition_id)
    );
$$;

DO $grants$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.is_child_health_field_definition(uuid)',
        'public.is_medical_form_definition(uuid)',
        'public.is_medical_form_submission(uuid)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END
$grants$;

-- ── 3. restrictive policies on medical rows ─────────────────────────────────────────────────────
-- field_values: a child's medical profile fields.
DROP POLICY IF EXISTS field_values_medical_read ON public.field_values;
CREATE POLICY field_values_medical_read ON public.field_values AS RESTRICTIVE
    FOR SELECT TO authenticated
    USING (NOT public.is_child_health_field_definition(field_definition_id) OR public.has_org_permission(org_id, 'health.view'));
DROP POLICY IF EXISTS field_values_medical_insert ON public.field_values;
CREATE POLICY field_values_medical_insert ON public.field_values AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (NOT public.is_child_health_field_definition(field_definition_id) OR public.has_org_permission(org_id, 'health.manage'));
DROP POLICY IF EXISTS field_values_medical_update ON public.field_values;
CREATE POLICY field_values_medical_update ON public.field_values AS RESTRICTIVE
    FOR UPDATE TO authenticated
    USING (NOT public.is_child_health_field_definition(field_definition_id) OR public.has_org_permission(org_id, 'health.manage'))
    WITH CHECK (NOT public.is_child_health_field_definition(field_definition_id) OR public.has_org_permission(org_id, 'health.manage'));
DROP POLICY IF EXISTS field_values_medical_delete ON public.field_values;
CREATE POLICY field_values_medical_delete ON public.field_values AS RESTRICTIVE
    FOR DELETE TO authenticated
    USING (NOT public.is_child_health_field_definition(field_definition_id) OR public.has_org_permission(org_id, 'health.manage'));

-- documents: health document types.
DROP POLICY IF EXISTS documents_medical_read ON public.documents;
CREATE POLICY documents_medical_read ON public.documents AS RESTRICTIVE
    FOR SELECT TO authenticated
    USING (doc_type IS NULL
           OR doc_type <> ALL (ARRAY['physical', 'immunization_record', 'health_care_plan', 'medication_authorization'])
           OR public.has_org_permission(org_id, 'health.view'));
DROP POLICY IF EXISTS documents_medical_write ON public.documents;
CREATE POLICY documents_medical_write ON public.documents AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (doc_type IS NULL
                OR doc_type <> ALL (ARRAY['physical', 'immunization_record', 'health_care_plan', 'medication_authorization'])
                OR public.has_org_permission(org_id, 'health.manage'));
DROP POLICY IF EXISTS documents_medical_update ON public.documents;
CREATE POLICY documents_medical_update ON public.documents AS RESTRICTIVE
    FOR UPDATE TO authenticated
    USING (doc_type IS NULL
           OR doc_type <> ALL (ARRAY['physical', 'immunization_record', 'health_care_plan', 'medication_authorization'])
           OR public.has_org_permission(org_id, 'health.manage'));
DROP POLICY IF EXISTS documents_medical_delete ON public.documents;
CREATE POLICY documents_medical_delete ON public.documents AS RESTRICTIVE
    FOR DELETE TO authenticated
    USING (doc_type IS NULL
           OR doc_type <> ALL (ARRAY['physical', 'immunization_record', 'health_care_plan', 'medication_authorization'])
           OR public.has_org_permission(org_id, 'health.manage'));

-- form submissions of a medical form, and what hangs off them.
DROP POLICY IF EXISTS form_submissions_medical_read ON public.form_submissions;
CREATE POLICY form_submissions_medical_read ON public.form_submissions AS RESTRICTIVE
    FOR SELECT TO authenticated
    USING (NOT public.is_medical_form_definition(form_definition_id) OR public.has_org_permission(org_id, 'health.view'));
DROP POLICY IF EXISTS form_submission_signatures_medical_read ON public.form_submission_signatures;
CREATE POLICY form_submission_signatures_medical_read ON public.form_submission_signatures AS RESTRICTIVE
    FOR SELECT TO authenticated
    USING (NOT public.is_medical_form_submission(form_submission_id) OR public.has_org_permission(org_id, 'health.view'));
DROP POLICY IF EXISTS form_submission_documents_medical_read ON public.form_submission_documents;
CREATE POLICY form_submission_documents_medical_read ON public.form_submission_documents AS RESTRICTIVE
    FOR SELECT TO authenticated
    USING (NOT public.is_medical_form_submission(form_submission_id) OR public.has_org_permission(org_id, 'health.view'));

-- ── 4. self-verification ────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(p, ', ') INTO missing
    FROM unnest(ARRAY[
        'field_values.field_values_medical_read', 'field_values.field_values_medical_insert',
        'field_values.field_values_medical_update', 'field_values.field_values_medical_delete',
        'documents.documents_medical_read', 'documents.documents_medical_write',
        'documents.documents_medical_update', 'documents.documents_medical_delete',
        'form_submissions.form_submissions_medical_read',
        'form_submission_signatures.form_submission_signatures_medical_read',
        'form_submission_documents.form_submission_documents_medical_read'
    ]) AS p
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        WHERE c.relnamespace = 'public'::regnamespace
          AND c.relname = split_part(p, '.', 1)
          AND pol.polname = split_part(p, '.', 2)
          AND NOT pol.polpermissive
    );
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'medical restrictive policies missing: %', missing;
    END IF;
    IF has_function_privilege('anon', 'public.has_org_permission(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'has_org_permission must not be executable by anon';
    END IF;
    -- No signed-in user → no permission, whatever the org.
    IF public.has_org_permission(gen_random_uuid(), 'health.view') THEN
        RAISE EXCEPTION 'has_org_permission granted a permission with no caller';
    END IF;
END
$verify$;
