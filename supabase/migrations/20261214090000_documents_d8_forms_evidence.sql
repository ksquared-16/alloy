-- =============================================================================
-- Documents V1 / D8 — Forms and Documents convergence: a document requirement may be satisfied by a completed form.
--
-- Forms already produce canonical Documents (D2): every completed-form PDF, signed artifact and signature image is a
-- `documents` row with an immutable version and an owner association, written by the Forms writers and canonicalised
-- by the D2 insert triggers; `form_submission_documents` links it to its submission. What was missing is the policy
-- by which such an artifact may count for a D6 requirement.
--
--   document_requirement_versions.form_evidence   jsonb, NULL by default (no Forms evidence — the D6 behaviour):
--       { "form_keys": ["<form definition key>", …1–10], "acceptance": "review" | "submitted" }
--     A completed-form PDF (`generated_form_pdf`) OWNED by the subject, linked to a SUBMITTED submission of one of the
--     named forms, is evidence for the requirement. `review` (the default an editor offers): it is pending until a
--     reviewer accepts its version. `submitted`: the organization's policy accepts the submission itself. A draft or
--     void submission is never evidence; neither is an artifact whose recorded signed hash does not match its stored
--     bytes. D7 validity applies with the REQUIREMENT's document type policy.
--
-- Part of an immutable requirement version: the version guard now treats it like every other policy field, and the
-- database validator (`document_requirement_version_problems`) checks its shape, that each form is an ACTIVE
-- definition of the organization, and that the published Completed form type accepts the requirement's grain. Both
-- functions are re-declared here from their D6 bodies with only these additions.
--
-- No new storage, identity or association path: no copy of any file, no new document table.
-- Additive, re-runnable, self-verifying. Rollback: drop the column and re-apply the D6 function bodies.
-- =============================================================================

ALTER TABLE public.document_requirement_versions ADD COLUMN IF NOT EXISTS form_evidence jsonb;

-- ── the version guard: form_evidence is policy, immutable once published ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_requirement_versions_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_req record;
    v_changed boolean;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF public.document_requirement_purge_active() THEN
            RETURN OLD;
        END IF;
        IF OLD.status IN ('published', 'superseded') AND EXISTS (SELECT 1 FROM public.document_requirements r WHERE r.id = OLD.requirement_id) THEN
            RAISE EXCEPTION 'document_requirement_version_immutable: a published version goes only with its requirement' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO v_req FROM public.document_requirements WHERE id = NEW.requirement_id;
    IF NOT FOUND OR v_req.org_id <> NEW.org_id THEN
        RAISE EXCEPTION 'document_requirement_version_org: a version belongs to its requirement''s organization' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('draft') THEN
            RAISE EXCEPTION 'document_requirement_publish_governed: a version is created as a draft' USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.requirement_id <> OLD.requirement_id OR NEW.version_number <> OLD.version_number OR NEW.org_id <> OLD.org_id THEN
        RAISE EXCEPTION 'document_requirement_version_identity: a version''s requirement and number never change' USING ERRCODE = 'check_violation';
    END IF;
    v_changed := NEW.label IS DISTINCT FROM OLD.label OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.document_type_key IS DISTINCT FROM OLD.document_type_key OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
        OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.timing IS DISTINCT FROM OLD.timing OR NEW.policy IS DISTINCT FROM OLD.policy
        OR NEW.waivable IS DISTINCT FROM OLD.waivable OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
        OR NEW.form_evidence IS DISTINCT FROM OLD.form_evidence;
    IF OLD.status IN ('published', 'superseded') THEN
        IF OLD.status = 'published' AND NEW.status = 'superseded' AND NOT v_changed
           AND coalesce(current_setting('alloy.document_requirement_publish', true), '') = 'on' THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'document_requirement_version_immutable: a published version never changes; edit a new draft' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('published', 'superseded') AND coalesce(current_setting('alloy.document_requirement_publish', true), '') <> 'on' THEN
        RAISE EXCEPTION 'document_requirement_publish_governed: a version is published only through document_requirement_publish' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- An edited validated version must be validated again.
    IF OLD.status = 'validated' AND v_changed AND coalesce(current_setting('alloy.document_requirement_validate', true), '') <> 'on' THEN
        NEW.status := 'draft';
        NEW.validated_at := NULL;
    END IF;
    IF NEW.status = 'validated' AND OLD.status = 'draft' AND coalesce(current_setting('alloy.document_requirement_validate', true), '') <> 'on' THEN
        RAISE EXCEPTION 'document_requirement_validate_governed: a version is validated only through document_requirement_validate' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ── the database validator: form_evidence checked with every other field ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.document_requirement_version_problems(_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v record;
    tv record;
    p jsonb := '[]'::jsonb;
    sk text;
    tk text;
    gv record;
BEGIN
    SELECT * INTO v FROM public.document_requirement_versions WHERE id = _version_id;
    IF NOT FOUND THEN RETURN jsonb_build_array(jsonb_build_object('field', 'version', 'code', 'not_found')); END IF;

    IF length(btrim(coalesce(v.label, ''))) = 0 OR length(v.label) > 120 THEN
        p := p || jsonb_build_object('field', 'label', 'code', 'label_required');
    END IF;
    IF v.subject_type NOT IN ('household', 'person', 'child', 'opportunity') THEN
        p := p || jsonb_build_object('field', 'subject_type', 'code', 'subject_type_unsupported');
    END IF;
    -- Compatibility with the PUBLISHED, ACTIVE Studio type: the type must exist and accept the subject grain.
    SELECT tv2.* INTO tv
      FROM public.document_types t
      JOIN public.document_type_versions tv2 ON tv2.id = t.published_version_id
     WHERE t.org_id = v.org_id AND t.key = v.document_type_key AND t.status = 'active';
    IF NOT FOUND THEN
        p := p || jsonb_build_object('field', 'document_type_key', 'code', 'document_type_not_published');
    ELSIF NOT (v.subject_type = ANY (tv.subject_types)) THEN
        p := p || jsonb_build_object('field', 'subject_type', 'code', 'subject_type_not_accepted_by_type');
    END IF;

    sk := v.scope ->> 'kind';
    IF sk IS NULL OR sk NOT IN ('all', 'business_process') THEN
        p := p || jsonb_build_object('field', 'scope.kind', 'code', 'scope_kind_unknown');
    ELSIF sk = 'all' THEN
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v.scope) k WHERE k <> 'kind') THEN
            p := p || jsonb_build_object('field', 'scope', 'code', 'scope_field_unknown');
        END IF;
    ELSE
        IF coalesce(v.scope ->> 'process_key', '') !~ '^[a-z][a-z0-9_]{0,62}$' THEN
            p := p || jsonb_build_object('field', 'scope.process_key', 'code', 'scope_process_required');
        END IF;
        IF v.scope ? 'stage_keys' AND (jsonb_typeof(v.scope -> 'stage_keys') <> 'array'
            OR jsonb_array_length(v.scope -> 'stage_keys') > 20
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(v.scope -> 'stage_keys') s
                        WHERE jsonb_typeof(s) <> 'string' OR (s #>> '{}') !~ '^[a-z][a-z0-9_]{0,62}$')) THEN
            p := p || jsonb_build_object('field', 'scope.stage_keys', 'code', 'scope_stage_keys_shape');
        END IF;
        IF v.subject_type NOT IN ('child', 'household', 'opportunity') THEN
            p := p || jsonb_build_object('field', 'scope', 'code', 'scope_grain_unsupported');
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v.scope) k WHERE k NOT IN ('kind', 'process_key', 'stage_keys')) THEN
            p := p || jsonb_build_object('field', 'scope', 'code', 'scope_field_unknown');
        END IF;
    END IF;

    tk := v.timing ->> 'kind';
    IF tk IS NULL OR tk NOT IN ('immediate', 'within_days') THEN
        p := p || jsonb_build_object('field', 'timing.kind', 'code', 'timing_kind_unknown');
    ELSIF tk = 'within_days' THEN
        IF jsonb_typeof(v.timing -> 'days') <> 'number' OR (v.timing ->> 'days')::numeric <> floor((v.timing ->> 'days')::numeric)
           OR (v.timing ->> 'days')::int NOT BETWEEN 1 AND 365 THEN
            p := p || jsonb_build_object('field', 'timing.days', 'code', 'timing_days_range');
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v.timing) k WHERE k NOT IN ('kind', 'days')) THEN
            p := p || jsonb_build_object('field', 'timing', 'code', 'timing_field_unknown');
        END IF;
    ELSIF EXISTS (SELECT 1 FROM jsonb_object_keys(v.timing) k WHERE k <> 'kind') THEN
        p := p || jsonb_build_object('field', 'timing', 'code', 'timing_field_unknown');
    END IF;

    IF v.effective_from IS NOT NULL AND v.effective_until IS NOT NULL AND v.effective_until < v.effective_from THEN
        p := p || jsonb_build_object('field', 'effective_until', 'code', 'effective_range_inverted');
    END IF;

    -- D8: Forms evidence. Completed-form PDFs of the named forms (generated_form_pdf, owned by the subject) may satisfy
    -- the requirement; `acceptance` says whether such a PDF still needs a review (`review`, the default policy) or
    -- counts once its submission is submitted (`submitted`). The forms must be ACTIVE definitions of the
    -- organization, and the published Completed form type must accept the requirement's grain.
    IF v.form_evidence IS NOT NULL THEN
        IF jsonb_typeof(v.form_evidence) <> 'object' THEN
            p := p || jsonb_build_object('field', 'form_evidence', 'code', 'form_evidence_shape');
        ELSE
            IF EXISTS (SELECT 1 FROM jsonb_object_keys(v.form_evidence) k WHERE k NOT IN ('form_keys', 'acceptance')) THEN
                p := p || jsonb_build_object('field', 'form_evidence', 'code', 'form_evidence_field_unknown');
            END IF;
            IF jsonb_typeof(v.form_evidence -> 'form_keys') IS DISTINCT FROM 'array'
               OR jsonb_array_length(v.form_evidence -> 'form_keys') NOT BETWEEN 1 AND 10
               OR EXISTS (SELECT 1 FROM jsonb_array_elements(v.form_evidence -> 'form_keys') f WHERE jsonb_typeof(f) <> 'string') THEN
                p := p || jsonb_build_object('field', 'form_evidence.form_keys', 'code', 'form_evidence_forms_shape');
            ELSIF EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(v.form_evidence -> 'form_keys') f(key)
                 WHERE NOT EXISTS (SELECT 1 FROM public.form_definitions d WHERE d.org_id = v.org_id AND d.key = f.key AND d.is_active)) THEN
                p := p || jsonb_build_object('field', 'form_evidence.form_keys', 'code', 'form_evidence_form_unknown');
            END IF;
            IF coalesce(v.form_evidence ->> 'acceptance', '') NOT IN ('review', 'submitted') THEN
                p := p || jsonb_build_object('field', 'form_evidence.acceptance', 'code', 'form_evidence_acceptance_unknown');
            END IF;
            SELECT tv3.* INTO gv
              FROM public.document_types t
              JOIN public.document_type_versions tv3 ON tv3.id = t.published_version_id
             WHERE t.org_id = v.org_id AND t.key = 'generated_form_pdf' AND t.status = 'active';
            IF NOT FOUND OR NOT (v.subject_type = ANY (gv.subject_types)) THEN
                p := p || jsonb_build_object('field', 'form_evidence', 'code', 'form_evidence_type_not_accepted');
            END IF;
        END IF;
    END IF;

    -- One live definition per (type, grain, scope): a second would duplicate every work item it produces.
    IF EXISTS (
        SELECT 1 FROM public.document_requirements r
          JOIN public.document_requirement_versions o ON o.id = r.published_version_id
         WHERE r.org_id = v.org_id AND r.status = 'active' AND r.id <> v.requirement_id
           AND o.document_type_key = v.document_type_key AND o.subject_type = v.subject_type AND o.scope = v.scope) THEN
        p := p || jsonb_build_object('field', 'document_type_key', 'code', 'requirement_duplicate');
    END IF;
    RETURN p;
END;
$$;

REVOKE ALL ON FUNCTION public.document_requirement_version_problems(uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_requirement_version_problems(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_requirement_versions_guard() FROM PUBLIC, anon, authenticated;

-- ── self-verification ─────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document_requirement_versions' AND column_name = 'form_evidence') THEN
        RAISE EXCEPTION 'd8 self-verify: form_evidence column missing';
    END IF;
    IF position('form_evidence' IN pg_get_functiondef('public.document_requirement_versions_guard()'::regprocedure)) = 0
       OR position('form_evidence_form_unknown' IN pg_get_functiondef('public.document_requirement_version_problems(uuid)'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'd8 self-verify: the guard or the validator does not know form_evidence';
    END IF;
    IF has_function_privilege('authenticated', 'public.document_requirement_version_problems(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'd8 self-verify: the validator is reachable outside the service role';
    END IF;
END
$verify$;

COMMENT ON COLUMN public.document_requirement_versions.form_evidence IS 'D8: completed forms that may satisfy this requirement {form_keys, acceptance: review|submitted}; NULL = documents of the type only.';
