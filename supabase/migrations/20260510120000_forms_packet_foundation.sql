-- =============================================================================
-- Forms Engine V1.4 — Packet / sequence foundation (Card 4B)
-- =============================================================================
-- One packet public link → one form_packet_sessions row (unique per link).
-- Linear steps only; conditionals deferred to Card 5.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) form_packet_definitions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_packet_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text,
    name text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT uq_form_packet_definitions_org_key UNIQUE (org_id, key)
);

CREATE INDEX IF NOT EXISTS idx_form_packet_definitions_org ON public.form_packet_definitions (org_id);
CREATE INDEX IF NOT EXISTS idx_form_packet_definitions_org_active ON public.form_packet_definitions (org_id, is_active);

COMMENT ON TABLE public.form_packet_definitions IS 'Org-scoped multi-form packet template (ordered items).';

DROP TRIGGER IF EXISTS trg_form_packet_definitions_updated_at ON public.form_packet_definitions;
CREATE TRIGGER trg_form_packet_definitions_updated_at
    BEFORE UPDATE ON public.form_packet_definitions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) form_packet_items (definition steps)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_packet_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    packet_definition_id uuid NOT NULL REFERENCES public.form_packet_definitions (id) ON DELETE CASCADE,
    sequence_index integer NOT NULL,
    form_definition_id uuid NOT NULL REFERENCES public.form_definitions (id) ON DELETE RESTRICT,
    pinned_form_definition_version_id uuid REFERENCES public.form_definition_versions (id) ON DELETE SET NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT uq_form_packet_items_packet_sequence UNIQUE (packet_definition_id, sequence_index),
    CONSTRAINT chk_form_packet_items_sequence_nonneg CHECK (sequence_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_form_packet_items_packet ON public.form_packet_items (packet_definition_id, sequence_index);
CREATE INDEX IF NOT EXISTS idx_form_packet_items_form_def ON public.form_packet_items (form_definition_id);

COMMENT ON TABLE public.form_packet_items IS 'Ordered steps in a packet definition; sequence_index is 0-based.';

CREATE OR REPLACE FUNCTION public.sync_form_packet_items_org_from_packet()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    p_org uuid;
BEGIN
    SELECT fpd.org_id INTO p_org
    FROM public.form_packet_definitions fpd
    WHERE fpd.id = NEW.packet_definition_id;
    IF p_org IS NULL THEN
        RAISE EXCEPTION 'form_packet_items: packet_definition_id % not found', NEW.packet_definition_id;
    END IF;
    IF NEW.org_id IS NOT NULL AND NEW.org_id <> p_org THEN
        RAISE EXCEPTION 'form_packet_items: org_id must match form_packet_definitions.org_id';
    END IF;
    NEW.org_id := p_org;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_packet_items_org ON public.form_packet_items;
CREATE TRIGGER trg_sync_form_packet_items_org
    BEFORE INSERT OR UPDATE OF packet_definition_id, org_id ON public.form_packet_items
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_form_packet_items_org_from_packet();

CREATE OR REPLACE FUNCTION public.validate_form_packet_items_form_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    def_org uuid;
    ver_form uuid;
    ver_org uuid;
BEGIN
    SELECT fd.org_id INTO def_org FROM public.form_definitions fd WHERE fd.id = NEW.form_definition_id;
    IF def_org IS NULL THEN
        RAISE EXCEPTION 'form_packet_items: form_definition_id % not found', NEW.form_definition_id;
    END IF;
    IF def_org <> NEW.org_id THEN
        RAISE EXCEPTION 'form_packet_items: form_definition must belong to same org as packet';
    END IF;

    IF NEW.pinned_form_definition_version_id IS NOT NULL THEN
        SELECT v.form_definition_id, v.org_id INTO ver_form, ver_org
        FROM public.form_definition_versions v
        WHERE v.id = NEW.pinned_form_definition_version_id;
        IF ver_form IS NULL THEN
            RAISE EXCEPTION 'form_packet_items: pinned_form_definition_version_id not found';
        END IF;
        IF ver_form <> NEW.form_definition_id THEN
            RAISE EXCEPTION 'form_packet_items: pinned version must match form_definition_id';
        END IF;
        IF ver_org <> NEW.org_id THEN
            RAISE EXCEPTION 'form_packet_items: pinned version org mismatch';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_form_packet_items_form ON public.form_packet_items;
CREATE TRIGGER trg_validate_form_packet_items_form
    BEFORE INSERT OR UPDATE ON public.form_packet_items
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_form_packet_items_form_org();

DROP TRIGGER IF EXISTS trg_form_packet_items_updated_at ON public.form_packet_items;
CREATE TRIGGER trg_form_packet_items_updated_at
    BEFORE UPDATE ON public.form_packet_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3) form_packet_sessions (one run per public link)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_packet_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    packet_definition_id uuid NOT NULL REFERENCES public.form_packet_definitions (id) ON DELETE RESTRICT,
    started_via_public_link_id uuid NOT NULL REFERENCES public.form_public_links (id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'in_progress'::text,
    launch_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    crm_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    shared_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    current_sequence_index integer NOT NULL DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    completed_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT chk_form_packet_sessions_status CHECK (
        status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'cancelled'::text])
    ),
    CONSTRAINT chk_form_packet_sessions_seq_nonneg CHECK (current_sequence_index >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_form_packet_sessions_one_link ON public.form_packet_sessions (started_via_public_link_id);
CREATE INDEX IF NOT EXISTS idx_form_packet_sessions_org_created ON public.form_packet_sessions (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_packet_sessions_org_status ON public.form_packet_sessions (org_id, status);

COMMENT ON TABLE public.form_packet_sessions IS 'Single recipient run for a packet link; 1:1 with started_via_public_link_id.';
COMMENT ON COLUMN public.form_packet_sessions.shared_values IS 'Shallow-merged scalar answers across steps (V1); collision avoidance is caller/schema responsibility.';

CREATE OR REPLACE FUNCTION public.sync_form_packet_sessions_org_from_packet_def()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    p_org uuid;
BEGIN
    SELECT fpd.org_id INTO p_org
    FROM public.form_packet_definitions fpd
    WHERE fpd.id = NEW.packet_definition_id;
    IF p_org IS NULL THEN
        RAISE EXCEPTION 'form_packet_sessions: packet_definition_id not found';
    END IF;
    IF NEW.org_id IS NOT NULL AND NEW.org_id <> p_org THEN
        RAISE EXCEPTION 'form_packet_sessions: org_id must match packet definition org';
    END IF;
    NEW.org_id := p_org;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_packet_sessions_org ON public.form_packet_sessions;
CREATE TRIGGER trg_sync_form_packet_sessions_org
    BEFORE INSERT OR UPDATE OF packet_definition_id, org_id ON public.form_packet_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_form_packet_sessions_org_from_packet_def();

CREATE OR REPLACE FUNCTION public.validate_form_packet_sessions_link_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    link_org uuid;
BEGIN
    SELECT fpl.org_id INTO link_org FROM public.form_public_links fpl WHERE fpl.id = NEW.started_via_public_link_id;
    IF link_org IS NULL THEN
        RAISE EXCEPTION 'form_packet_sessions: started_via_public_link_id not found';
    END IF;
    IF link_org <> NEW.org_id THEN
        RAISE EXCEPTION 'form_packet_sessions: link org_id must match session org_id';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_form_packet_sessions_link ON public.form_packet_sessions;
CREATE TRIGGER trg_validate_form_packet_sessions_link
    BEFORE INSERT OR UPDATE OF started_via_public_link_id ON public.form_packet_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_form_packet_sessions_link_org();

DROP TRIGGER IF EXISTS trg_form_packet_sessions_updated_at ON public.form_packet_sessions;
CREATE TRIGGER trg_form_packet_sessions_updated_at
    BEFORE UPDATE ON public.form_packet_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4) form_packet_session_items (per-step runtime state)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_packet_session_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    packet_session_id uuid NOT NULL REFERENCES public.form_packet_sessions (id) ON DELETE CASCADE,
    packet_item_id uuid NOT NULL REFERENCES public.form_packet_items (id) ON DELETE RESTRICT,
    sequence_index integer NOT NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    form_submission_id uuid REFERENCES public.form_submissions (id) ON DELETE SET NULL,
    submitted_at timestamptz,
    skip_reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT chk_form_packet_session_items_status CHECK (
        status = ANY (ARRAY['pending'::text, 'active'::text, 'submitted'::text, 'skipped'::text])
    ),
    CONSTRAINT chk_form_packet_session_items_seq_nonneg CHECK (sequence_index >= 0),
    CONSTRAINT uq_form_packet_session_items_session_packet_item UNIQUE (packet_session_id, packet_item_id),
    CONSTRAINT uq_form_packet_session_items_session_sequence UNIQUE (packet_session_id, sequence_index)
);

CREATE INDEX IF NOT EXISTS idx_form_packet_session_items_session ON public.form_packet_session_items (packet_session_id, sequence_index);
CREATE INDEX IF NOT EXISTS idx_form_packet_session_items_submission ON public.form_packet_session_items (form_submission_id)
    WHERE form_submission_id IS NOT NULL;

COMMENT ON TABLE public.form_packet_session_items IS 'Step state for one packet session; links optional draft/submitted form_submissions row.';

CREATE OR REPLACE FUNCTION public.sync_form_packet_session_items_org_from_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    o uuid;
BEGIN
    SELECT fps.org_id INTO o FROM public.form_packet_sessions fps WHERE fps.id = NEW.packet_session_id;
    IF o IS NULL THEN
        RAISE EXCEPTION 'form_packet_session_items: packet_session_id not found';
    END IF;
    NEW.org_id := o;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_packet_session_items_org ON public.form_packet_session_items;
CREATE TRIGGER trg_sync_form_packet_session_items_org
    BEFORE INSERT OR UPDATE OF packet_session_id ON public.form_packet_session_items
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_form_packet_session_items_org_from_session();

CREATE OR REPLACE FUNCTION public.validate_form_packet_session_items_packet_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    sess_def uuid;
    item_def uuid;
BEGIN
    SELECT fps.packet_definition_id INTO sess_def FROM public.form_packet_sessions fps WHERE fps.id = NEW.packet_session_id;
    SELECT fpi.packet_definition_id INTO item_def FROM public.form_packet_items fpi WHERE fpi.id = NEW.packet_item_id;
    IF sess_def IS DISTINCT FROM item_def THEN
        RAISE EXCEPTION 'form_packet_session_items: packet_item does not belong to session packet_definition';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_form_packet_session_items_packet ON public.form_packet_session_items;
CREATE TRIGGER trg_validate_form_packet_session_items_packet
    BEFORE INSERT OR UPDATE OF packet_session_id, packet_item_id ON public.form_packet_session_items
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_form_packet_session_items_packet_match();

CREATE OR REPLACE FUNCTION public.validate_form_packet_session_items_submission_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    sub_org uuid;
BEGIN
    IF NEW.form_submission_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT fs.org_id INTO sub_org FROM public.form_submissions fs WHERE fs.id = NEW.form_submission_id;
    IF sub_org IS NULL THEN
        RAISE EXCEPTION 'form_packet_session_items: form_submission_id not found';
    END IF;
    IF sub_org <> NEW.org_id THEN
        RAISE EXCEPTION 'form_packet_session_items: submission org_id mismatch';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_form_packet_session_items_sub ON public.form_packet_session_items;
CREATE TRIGGER trg_validate_form_packet_session_items_sub
    BEFORE INSERT OR UPDATE OF form_submission_id ON public.form_packet_session_items
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_form_packet_session_items_submission_org();

DROP TRIGGER IF EXISTS trg_form_packet_session_items_updated_at ON public.form_packet_session_items;
CREATE TRIGGER trg_form_packet_session_items_updated_at
    BEFORE UPDATE ON public.form_packet_session_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS + privileges (mirror forms tables)
-- -----------------------------------------------------------------------------
ALTER TABLE public.form_packet_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_packet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_packet_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_packet_session_items ENABLE ROW LEVEL SECURITY;

-- form_packet_definitions
DROP POLICY IF EXISTS form_packet_definitions_select_by_org_role ON public.form_packet_definitions;
CREATE POLICY form_packet_definitions_select_by_org_role ON public.form_packet_definitions FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_packet_definitions_mutate_by_org_role ON public.form_packet_definitions;
CREATE POLICY form_packet_definitions_mutate_by_org_role ON public.form_packet_definitions FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_packet_definitions_update_by_org_role ON public.form_packet_definitions;
CREATE POLICY form_packet_definitions_update_by_org_role ON public.form_packet_definitions FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_packet_definitions_delete_by_org_role ON public.form_packet_definitions;
CREATE POLICY form_packet_definitions_delete_by_org_role ON public.form_packet_definitions FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- form_packet_items
DROP POLICY IF EXISTS form_packet_items_select_by_org_role ON public.form_packet_items;
CREATE POLICY form_packet_items_select_by_org_role ON public.form_packet_items FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_packet_items_mutate_by_org_role ON public.form_packet_items;
CREATE POLICY form_packet_items_mutate_by_org_role ON public.form_packet_items FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_packet_items_update_by_org_role ON public.form_packet_items;
CREATE POLICY form_packet_items_update_by_org_role ON public.form_packet_items FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_packet_items_delete_by_org_role ON public.form_packet_items;
CREATE POLICY form_packet_items_delete_by_org_role ON public.form_packet_items FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- form_packet_sessions
DROP POLICY IF EXISTS form_packet_sessions_select_by_org_role ON public.form_packet_sessions;
CREATE POLICY form_packet_sessions_select_by_org_role ON public.form_packet_sessions FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_packet_sessions_mutate_by_org_role ON public.form_packet_sessions;
CREATE POLICY form_packet_sessions_mutate_by_org_role ON public.form_packet_sessions FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_packet_sessions_update_by_org_role ON public.form_packet_sessions;
CREATE POLICY form_packet_sessions_update_by_org_role ON public.form_packet_sessions FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_packet_sessions_delete_by_org_role ON public.form_packet_sessions;
CREATE POLICY form_packet_sessions_delete_by_org_role ON public.form_packet_sessions FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- form_packet_session_items
DROP POLICY IF EXISTS form_packet_session_items_select_by_org_role ON public.form_packet_session_items;
CREATE POLICY form_packet_session_items_select_by_org_role ON public.form_packet_session_items FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_packet_session_items_mutate_by_org_role ON public.form_packet_session_items;
CREATE POLICY form_packet_session_items_mutate_by_org_role ON public.form_packet_session_items FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_packet_session_items_update_by_org_role ON public.form_packet_session_items;
CREATE POLICY form_packet_session_items_update_by_org_role ON public.form_packet_session_items FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_packet_session_items_delete_by_org_role ON public.form_packet_session_items;
CREATE POLICY form_packet_session_items_delete_by_org_role ON public.form_packet_session_items FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- service_role
DROP POLICY IF EXISTS form_packet_definitions_all_service_role ON public.form_packet_definitions;
CREATE POLICY form_packet_definitions_all_service_role ON public.form_packet_definitions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS form_packet_items_all_service_role ON public.form_packet_items;
CREATE POLICY form_packet_items_all_service_role ON public.form_packet_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS form_packet_sessions_all_service_role ON public.form_packet_sessions;
CREATE POLICY form_packet_sessions_all_service_role ON public.form_packet_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS form_packet_session_items_all_service_role ON public.form_packet_session_items;
CREATE POLICY form_packet_session_items_all_service_role ON public.form_packet_session_items FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.form_packet_definitions FROM anon;
REVOKE ALL ON TABLE public.form_packet_items FROM anon;
REVOKE ALL ON TABLE public.form_packet_sessions FROM anon;
REVOKE ALL ON TABLE public.form_packet_session_items FROM anon;

GRANT ALL ON TABLE public.form_packet_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_packet_definitions TO authenticated;

GRANT ALL ON TABLE public.form_packet_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_packet_items TO authenticated;

GRANT ALL ON TABLE public.form_packet_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_packet_sessions TO authenticated;

GRANT ALL ON TABLE public.form_packet_session_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_packet_session_items TO authenticated;