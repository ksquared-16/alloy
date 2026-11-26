-- =============================================================================
-- Documents V1 / D6 — document requirements and document-specific waivers.
--
-- Documents owns document requirement DEFINITIONS, their SATISFACTION and document-specific WAIVERS. Business Process
-- consumes the Documents answer; Enrollment keeps its separate stage exceptions (enrollment_requirement_exceptions).
--
--   document_requirements          stable IDENTITY (id, key, active/archived, published_version_id) …
--   document_requirement_versions  … plus immutable VERSIONS: draft → validated → published → superseded, the D3
--                                  document-type lifecycle (configuration-publication-model.md: a family adopts
--                                  versioned publication when consumers must be protected from mid-flight edits —
--                                  a requirement drives operational work and Business Process readiness).
--   document_requirement_waivers   a decision about ONE requirement for ONE subject: reason, actor, optional end date,
--                                  revocation. Append-and-transition only; never deleted (the audit history).
--
-- SATISFACTION IS NEVER STORED. There is no satisfaction table, no placeholder document row and no "waived" document
-- status: the application's one evaluator (web/lib/documents/requirements/documentRequirementEvaluator.ts) derives
-- missing / pending review / satisfied / waived / blocked on every read from documents, their current version's
-- review state and the active waivers.
--
-- A waiver waives a REQUIREMENT for a subject. It is not evidence, grants no access to any document, never touches a
-- document's status (so it cannot release a quarantine) and says nothing about any other Business Process rule.
--
-- History is kept: a published or waived requirement is archived, never deleted. The one exception is a governed QA
-- run's own fixture: an ARCHIVED requirement in a registered QA organization (QA Shared / QA Secondary) whose key is in
-- that run's namespace (`qa_<run>_…` for run `qar_<run>`) may be purged, with its versions and waivers, by the
-- service-role function `document_requirement_purge`, so a governed hosted certification can end with zero residue.
--
-- Additive, re-runnable, self-verifying. Rollback: drop the three tables and the functions created here; nothing
-- existing is altered.
-- =============================================================================

-- ── 1. tables ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_requirements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    published_version_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    archived_at timestamptz,
    archived_by uuid,
    CONSTRAINT chk_document_requirements_key CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT chk_document_requirements_status CHECK (status IN ('active', 'archived')),
    CONSTRAINT uq_document_requirements_key UNIQUE (org_id, key)
);

CREATE TABLE IF NOT EXISTS public.document_requirement_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    requirement_id uuid NOT NULL REFERENCES public.document_requirements (id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    label text NOT NULL,
    description text,
    -- The published Studio type whose documents satisfy the requirement (documents.doc_type stores the type key).
    document_type_key text NOT NULL,
    -- The subject grain the requirement is evaluated for.
    subject_type text NOT NULL,
    -- Which subjects of that grain it applies to: {"kind":"all"} or
    -- {"kind":"business_process","process_key":"…","stage_keys":["…"]} (stage_keys optional).
    scope jsonb NOT NULL DEFAULT '{"kind": "all"}'::jsonb,
    -- When it is due: {"kind":"immediate"} or {"kind":"within_days","days":N} (from the subject entering scope).
    timing jsonb NOT NULL DEFAULT '{"kind": "immediate"}'::jsonb,
    policy text NOT NULL DEFAULT 'required',
    waivable boolean NOT NULL DEFAULT false,
    effective_from date,
    effective_until date,
    validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    validated_at timestamptz,
    published_at timestamptz,
    published_by uuid,
    superseded_at timestamptz,
    CONSTRAINT chk_document_requirement_versions_status CHECK (status IN ('draft', 'validated', 'published', 'superseded')),
    CONSTRAINT chk_document_requirement_versions_policy CHECK (policy IN ('required', 'optional')),
    CONSTRAINT uq_document_requirement_versions_number UNIQUE (requirement_id, version_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_requirement_versions_one_open
    ON public.document_requirement_versions (requirement_id) WHERE status IN ('draft', 'validated');
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_requirement_versions_one_published
    ON public.document_requirement_versions (requirement_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_document_requirement_versions_type
    ON public.document_requirement_versions (org_id, document_type_key) WHERE status = 'published';

DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_document_requirements_published_version') THEN
        ALTER TABLE public.document_requirements ADD CONSTRAINT fk_document_requirements_published_version
            FOREIGN KEY (published_version_id) REFERENCES public.document_requirement_versions (id) DEFERRABLE INITIALLY DEFERRED;
    END IF;
END
$c$;

CREATE TABLE IF NOT EXISTS public.document_requirement_waivers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    requirement_id uuid NOT NULL REFERENCES public.document_requirements (id) ON DELETE CASCADE,
    -- The requirement version in force when the waiver was granted (provenance; the waiver follows the requirement).
    requirement_version_id uuid NOT NULL REFERENCES public.document_requirement_versions (id) ON DELETE CASCADE,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    reason text NOT NULL,
    state text NOT NULL DEFAULT 'active',
    effective_until date,
    granted_by uuid NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    revoked_by uuid,
    revoked_at timestamptz,
    revoke_reason text,
    CONSTRAINT chk_document_requirement_waivers_state CHECK (state IN ('active', 'revoked')),
    CONSTRAINT chk_document_requirement_waivers_reason CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
    CONSTRAINT chk_document_requirement_waivers_subject CHECK (subject_type IN ('household', 'person', 'child', 'opportunity')),
    CONSTRAINT chk_document_requirement_waivers_revocation CHECK (
        (state = 'active' AND revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
        OR (state = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(btrim(coalesce(revoke_reason, ''))) >= 3))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_requirement_waivers_one_active
    ON public.document_requirement_waivers (requirement_id, subject_type, subject_id) WHERE state = 'active';
CREATE INDEX IF NOT EXISTS idx_document_requirement_waivers_subject
    ON public.document_requirement_waivers (org_id, subject_type, subject_id);

ALTER TABLE public.document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requirement_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requirement_waivers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_requirements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.document_requirement_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.document_requirement_waivers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.document_requirements TO service_role;
GRANT ALL ON TABLE public.document_requirement_versions TO service_role;
GRANT ALL ON TABLE public.document_requirement_waivers TO service_role;

-- ── 2. guards ─────────────────────────────────────────────────────────────────────────────────────────────────
-- The guards let a DELETE through only inside `document_requirement_purge` itself: the purge setting must be on AND the
-- statement must run as the purge function's owner (SECURITY DEFINER). A service-role session that sets the setting
-- by hand runs as service_role and is still refused.
CREATE OR REPLACE FUNCTION public.document_requirement_purge_active()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(current_setting('alloy.document_requirement_purge', true), '') = 'on'
       AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles o ON o.oid = p.proowner
                    WHERE p.oid = to_regprocedure('public.document_requirement_purge(uuid,uuid,text)')
                      AND o.rolname = current_user);
$$;
REVOKE ALL ON FUNCTION public.document_requirement_purge_active() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_requirement_purge_active() TO service_role;

CREATE OR REPLACE FUNCTION public.document_requirements_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF public.document_requirement_purge_active() THEN
            RETURN OLD;  -- the QA fixture purge (document_requirement_purge) only
        END IF;
        IF OLD.published_version_id IS NOT NULL
           OR EXISTS (SELECT 1 FROM public.document_requirement_waivers w WHERE w.requirement_id = OLD.id) THEN
            RAISE EXCEPTION 'document_requirement_in_use: a published or waived requirement is archived, not deleted' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.key IS DISTINCT FROM OLD.key OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
            RAISE EXCEPTION 'document_requirement_identity: a requirement''s key and organization never change' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.published_version_id IS DISTINCT FROM OLD.published_version_id
           AND coalesce(current_setting('alloy.document_requirement_publish', true), '') <> 'on' THEN
            RAISE EXCEPTION 'document_requirement_publish_governed: a requirement''s published version changes only through document_requirement_publish'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
            NEW.archived_at := coalesce(NEW.archived_at, now());
        ELSIF NEW.status = 'active' AND OLD.status = 'archived' THEN
            NEW.archived_at := NULL;
            NEW.archived_by := NULL;
        END IF;
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_requirements_guard ON public.document_requirements;
CREATE TRIGGER trg_document_requirements_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_requirements
    FOR EACH ROW EXECUTE FUNCTION public.document_requirements_guard();

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
        OR NEW.effective_until IS DISTINCT FROM OLD.effective_until;
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
DROP TRIGGER IF EXISTS trg_document_requirement_versions_guard ON public.document_requirement_versions;
CREATE TRIGGER trg_document_requirement_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_requirement_versions
    FOR EACH ROW EXECUTE FUNCTION public.document_requirement_versions_guard();

-- Waivers change only through the grant/revoke functions, are never deleted while their requirement exists, and an
-- active waiver only ever becomes revoked.
CREATE OR REPLACE FUNCTION public.document_requirement_waivers_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF public.document_requirement_purge_active() THEN
            RETURN OLD;
        END IF;
        IF EXISTS (SELECT 1 FROM public.document_requirements r WHERE r.id = OLD.requirement_id) THEN
            RAISE EXCEPTION 'document_requirement_waiver_history: a waiver is revoked, never deleted' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF coalesce(current_setting('alloy.document_requirement_waiver', true), '') <> 'on' THEN
        RAISE EXCEPTION 'document_requirement_waiver_governed: a waiver changes only through document_requirement_waiver_grant / _revoke'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.state <> 'active' OR NEW.state <> 'revoked'
           OR NEW.requirement_id IS DISTINCT FROM OLD.requirement_id OR NEW.requirement_version_id IS DISTINCT FROM OLD.requirement_version_id
           OR NEW.subject_type IS DISTINCT FROM OLD.subject_type OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
           OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.reason IS DISTINCT FROM OLD.reason
           OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
           OR NEW.granted_by IS DISTINCT FROM OLD.granted_by OR NEW.granted_at IS DISTINCT FROM OLD.granted_at THEN
            RAISE EXCEPTION 'document_requirement_waiver_immutable: a waiver is only ever revoked' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_requirement_waivers_guard ON public.document_requirement_waivers;
CREATE TRIGGER trg_document_requirement_waivers_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_requirement_waivers
    FOR EACH ROW EXECUTE FUNCTION public.document_requirement_waivers_guard();

-- ── 3. validation, the one authority (the application mirrors it for the editor) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.document_requirement_version_problems(_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v record;
    tv record;
    p jsonb := '[]'::jsonb;
    sk text;
    tk text;
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

CREATE OR REPLACE FUNCTION public.document_requirement_validate(p_org_id uuid, p_version_id uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v record;
    probs jsonb;
BEGIN
    SELECT * INTO v FROM public.document_requirement_versions WHERE id = p_version_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_requirement_version_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF v.status NOT IN ('draft', 'validated') THEN
        RAISE EXCEPTION 'document_requirement_version_not_open: only a draft is validated' USING ERRCODE = 'check_violation';
    END IF;
    probs := public.document_requirement_version_problems(p_version_id);
    PERFORM set_config('alloy.document_requirement_validate', 'on', true);
    UPDATE public.document_requirement_versions
       SET status = CASE WHEN jsonb_array_length(probs) = 0 THEN 'validated' ELSE 'draft' END,
           validation_errors = probs,
           validated_at = CASE WHEN jsonb_array_length(probs) = 0 THEN now() ELSE NULL END,
           updated_by = p_actor
     WHERE id = p_version_id;
    PERFORM set_config('alloy.document_requirement_validate', 'off', true);
    RETURN jsonb_build_object('version_id', p_version_id, 'valid', jsonb_array_length(probs) = 0, 'problems', probs);
END;
$$;

-- Publish a validated version: compare-and-swap on the requirement's current published version. Validation is re-run;
-- publication never trusts an earlier answer.
CREATE OR REPLACE FUNCTION public.document_requirement_publish(
    p_org_id uuid, p_requirement_id uuid, p_version_id uuid, p_expected_published_version_id uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r record;
    v record;
    probs jsonb;
BEGIN
    SELECT * INTO r FROM public.document_requirements WHERE id = p_requirement_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_requirement_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF r.status <> 'active' THEN RAISE EXCEPTION 'document_requirement_archived: re-activate the requirement before publishing' USING ERRCODE = 'check_violation'; END IF;
    IF r.published_version_id IS DISTINCT FROM p_expected_published_version_id THEN
        RAISE EXCEPTION 'document_requirement_publish_conflict: the published version changed since this draft was opened' USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    SELECT * INTO v FROM public.document_requirement_versions WHERE id = p_version_id AND requirement_id = p_requirement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_requirement_version_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF v.status <> 'validated' THEN
        RAISE EXCEPTION 'document_requirement_version_not_validated: validate the draft before publishing' USING ERRCODE = 'check_violation';
    END IF;
    probs := public.document_requirement_version_problems(p_version_id);
    IF jsonb_array_length(probs) > 0 THEN
        RAISE EXCEPTION 'document_requirement_version_invalid: %', probs USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('alloy.document_requirement_publish', 'on', true);
    UPDATE public.document_requirement_versions SET status = 'superseded', superseded_at = now()
     WHERE requirement_id = p_requirement_id AND status = 'published';
    UPDATE public.document_requirement_versions SET status = 'published', published_at = now(), published_by = p_actor WHERE id = p_version_id;
    UPDATE public.document_requirements SET published_version_id = p_version_id, updated_by = p_actor WHERE id = p_requirement_id;
    PERFORM set_config('alloy.document_requirement_publish', 'off', true);
    RETURN jsonb_build_object('requirement_id', p_requirement_id, 'version_id', p_version_id, 'version_number', v.version_number,
                              'superseded_version_id', p_expected_published_version_id);
END;
$$;

-- ── 4. waivers ────────────────────────────────────────────────────────────────────────────────────────────────
-- Grant: the requirement is active and published, its published version allows waivers, the subject is of the
-- requirement's grain and resolves in the organization, the reason is real, and no other waiver is active for it.
CREATE OR REPLACE FUNCTION public.document_requirement_waiver_grant(
    p_org_id uuid, p_requirement_id uuid, p_subject_type text, p_subject_id uuid, p_reason text,
    p_effective_until date, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r record;
    v record;
    w_id uuid;
BEGIN
    IF p_actor IS NULL THEN RAISE EXCEPTION 'document_requirement_waiver_actor_required' USING ERRCODE = 'check_violation'; END IF;
    SELECT * INTO r FROM public.document_requirements WHERE id = p_requirement_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_requirement_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF r.status <> 'active' OR r.published_version_id IS NULL THEN
        RAISE EXCEPTION 'document_requirement_not_live: only an active, published requirement is waived' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v FROM public.document_requirement_versions WHERE id = r.published_version_id;
    IF NOT v.waivable THEN
        RAISE EXCEPTION 'document_requirement_not_waivable: this requirement''s policy does not allow waivers' USING ERRCODE = 'check_violation';
    END IF;
    IF p_subject_type IS DISTINCT FROM v.subject_type THEN
        RAISE EXCEPTION 'document_requirement_waiver_grain: the subject is not of the requirement''s grain' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.document_subject_resolves(p_org_id, p_subject_type, p_subject_id) THEN
        RAISE EXCEPTION 'document_requirement_waiver_subject_unresolved' USING ERRCODE = 'no_data_found';
    END IF;
    IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'document_requirement_waiver_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    IF p_effective_until IS NOT NULL AND p_effective_until < current_date THEN
        RAISE EXCEPTION 'document_requirement_waiver_already_expired' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.document_requirement_waivers w
                WHERE w.requirement_id = p_requirement_id AND w.subject_type = p_subject_type AND w.subject_id = p_subject_id AND w.state = 'active') THEN
        RAISE EXCEPTION 'document_requirement_waiver_exists: revoke the active waiver first' USING ERRCODE = 'unique_violation';
    END IF;
    PERFORM set_config('alloy.document_requirement_waiver', 'on', true);
    INSERT INTO public.document_requirement_waivers
        (org_id, requirement_id, requirement_version_id, subject_type, subject_id, reason, effective_until, granted_by)
    VALUES (p_org_id, p_requirement_id, v.id, p_subject_type, p_subject_id, btrim(p_reason), p_effective_until, p_actor)
    RETURNING id INTO w_id;
    PERFORM set_config('alloy.document_requirement_waiver', 'off', true);
    RETURN jsonb_build_object('waiver_id', w_id, 'requirement_id', p_requirement_id, 'requirement_version_id', v.id,
                              'subject_type', p_subject_type, 'subject_id', p_subject_id, 'state', 'active');
END;
$$;

CREATE OR REPLACE FUNCTION public.document_requirement_waiver_revoke(p_org_id uuid, p_waiver_id uuid, p_reason text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    w record;
BEGIN
    IF p_actor IS NULL THEN RAISE EXCEPTION 'document_requirement_waiver_actor_required' USING ERRCODE = 'check_violation'; END IF;
    SELECT * INTO w FROM public.document_requirement_waivers WHERE id = p_waiver_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_requirement_waiver_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF w.state <> 'active' THEN
        RAISE EXCEPTION 'document_requirement_waiver_not_active: the waiver is already revoked' USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'document_requirement_waiver_reason_required' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('alloy.document_requirement_waiver', 'on', true);
    UPDATE public.document_requirement_waivers
       SET state = 'revoked', revoked_at = now(), revoked_by = p_actor, revoke_reason = btrim(p_reason)
     WHERE id = p_waiver_id;
    PERFORM set_config('alloy.document_requirement_waiver', 'off', true);
    RETURN jsonb_build_object('waiver_id', p_waiver_id, 'requirement_id', w.requirement_id, 'state', 'revoked');
END;
$$;

-- ── 4a. the QA fixture purge ─────────────────────────────────────────────────────────────────────────────────
-- Real requirements keep their history forever. A governed hosted certification, however, must leave no residue, so
-- ONE narrow exception exists, bounded by organization AND run:
--   * the organization is a registered QA organization (QA Shared, QA Secondary) — never Firefly, never any tenant;
--   * the caller names the governed QA run (`qar_<run>`), and the requirement's key is in THAT run's namespace
--     (`qa_<run>_…`), so a run removes only what it created and a tenant's `qa_…` key is never eligible;
--   * the requirement is ARCHIVED.
-- It is then removed with its versions and waivers. Every refusal raises before anything is touched. Service role
-- only; the one caller is the audited requirement DELETE.
DROP FUNCTION IF EXISTS public.document_requirement_purge(uuid, uuid);
CREATE OR REPLACE FUNCTION public.document_requirement_purge(p_org_id uuid, p_requirement_id uuid, p_qa_run_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r record;
    v_run text;
    n_versions int;
    n_waivers int;
BEGIN
    -- The QA organizations of web/lib/qa/sharedQaRegistry.ts (QA_ORGS); Firefly is never one of them.
    IF p_org_id IS NULL OR p_org_id NOT IN ('4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid) THEN
        RAISE EXCEPTION 'document_requirement_purge_refused: only a registered QA organization purges fixture requirements'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_run := substring(coalesce(p_qa_run_id, '') FROM '^qar_([a-z0-9]{8,40})$');
    IF v_run IS NULL THEN
        RAISE EXCEPTION 'document_requirement_purge_refused: a governed QA run id (qar_…) is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO r FROM public.document_requirements WHERE id = p_requirement_id AND org_id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_requirement_not_found' USING ERRCODE = 'no_data_found'; END IF;
    IF left(r.key, length('qa_' || v_run || '_')) <> 'qa_' || v_run || '_' OR r.key !~ '^qa_[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'document_requirement_purge_refused: only this QA run''s fixture requirements (key qa_<run>_…) are purged; others are archived'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF r.status <> 'archived' THEN
        RAISE EXCEPTION 'document_requirement_purge_refused: archive the requirement first' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO n_versions FROM public.document_requirement_versions WHERE requirement_id = r.id;
    SELECT count(*) INTO n_waivers FROM public.document_requirement_waivers WHERE requirement_id = r.id;
    PERFORM set_config('alloy.document_requirement_purge', 'on', true);
    -- Versions and waivers go by ON DELETE CASCADE; every guard honours the purge only inside this function.
    DELETE FROM public.document_requirements WHERE id = r.id;
    PERFORM set_config('alloy.document_requirement_purge', 'off', true);
    RETURN jsonb_build_object('requirement_id', r.id, 'key', r.key, 'qa_run_id', p_qa_run_id, 'versions', n_versions, 'waivers', n_waivers, 'purged', true);
END;
$$;

REVOKE ALL ON FUNCTION public.document_requirement_purge(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_requirement_purge(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.document_requirement_version_problems(uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_requirement_version_problems(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_requirement_validate(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_requirement_validate(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_requirement_publish(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_requirement_publish(uuid, uuid, uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_requirement_waiver_grant(uuid, uuid, text, uuid, text, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_requirement_waiver_grant(uuid, uuid, text, uuid, text, date, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_requirement_waiver_revoke(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.document_requirement_waiver_revoke(uuid, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.document_requirements_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.document_requirement_versions_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.document_requirement_waivers_guard() FROM PUBLIC, anon, authenticated;

-- ── 5. self-verification ──────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
    missing text[];
BEGIN
    SELECT array_agg(n) INTO missing FROM unnest(ARRAY[
        'document_requirement_version_problems', 'document_requirement_validate', 'document_requirement_publish',
        'document_requirement_waiver_grant', 'document_requirement_waiver_revoke', 'document_requirement_purge']) n
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = n);
    IF missing IS NOT NULL THEN RAISE EXCEPTION 'd6 self-verify: functions missing %', missing; END IF;
    IF EXISTS (SELECT 1 FROM unnest(ARRAY['document_requirements', 'document_requirement_versions', 'document_requirement_waivers']) t
                WHERE NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass)) THEN
        RAISE EXCEPTION 'd6 self-verify: row level security is not enabled';
    END IF;
    IF has_table_privilege('authenticated', 'public.document_requirement_waivers', 'SELECT')
       OR has_table_privilege('anon', 'public.document_requirements', 'SELECT')
       OR has_function_privilege('authenticated', 'public.document_requirement_waiver_grant(uuid, uuid, text, uuid, text, date, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'd6 self-verify: a D6 object is reachable outside the service role';
    END IF;
    IF has_function_privilege('authenticated', 'public.document_requirement_purge(uuid, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.document_requirement_purge(uuid, uuid, text)', 'EXECUTE')
       OR to_regprocedure('public.document_requirement_purge(uuid,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'd6 self-verify: the fixture purge is reachable outside the service role or unbound to a QA run';
    END IF;
END
$verify$;

COMMENT ON TABLE public.document_requirements IS 'D6: org document requirement identity. Policy lives in document_requirement_versions. Satisfaction is never stored.';
COMMENT ON TABLE public.document_requirement_versions IS 'D6: immutable published versions of a document requirement (draft → validated → published → superseded).';
COMMENT ON TABLE public.document_requirement_waivers IS 'D6: Documents-owned document-requirement waivers for one subject. Never evidence; grants no document access; revoked, never deleted.';
