-- =============================================================================
-- Packet definition versions — an in-flight participant session must never change
-- because an administrator published something.
--
-- THE HAZARD THIS CLOSES
--
-- A packet link carries `packet_step_version_policy = "follow_latest"`, and packet
-- items may leave `pinned_form_definition_version_id` null. A family part-way
-- through enrolment therefore had the meaning of their paperwork resolved fresh on
-- every step: publish a new Form version at the wrong moment and the parent signs
-- step 3 of a packet whose step 1 no longer says what they agreed to.
--
-- THE CONVENTION IS THE FORM ONE, DELIBERATELY
--
-- Columns, status vocabulary, the publish-metadata CHECK, the UNIQUE on
-- (parent, version_number) and the index shape all mirror
-- `form_definition_versions`. A second, subtly different versioning idiom is how
-- two things that must agree drift apart, and Packet versions have to be read next
-- to Form versions constantly.
--
-- WHAT A VERSION IS
--
-- The Packet definition remains DERIVED from published Business Process
-- requirements. A version is an immutable SNAPSHOT of one derivation: the ordered
-- steps, each pinning the exact `form_definition_version_id` a participant session
-- is expected to consume. It is not a second authoring authority — nothing here
-- lets an administrator hand-write steps that the Business Process does not say.
--
-- FORWARD-ONLY, BY DESIGN
--
-- `form_packet_sessions.packet_definition_version_id` is NULLABLE and nothing is
-- backfilled. A session that started before this migration has no proven version,
-- and inventing one would be a claim about what a family already signed. Those
-- sessions keep resolving exactly as they do today; only new sessions pin.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) form_packet_definition_versions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_packet_definition_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    form_packet_definition_id uuid NOT NULL REFERENCES public.form_packet_definitions (id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    status text NOT NULL,
    -- The immutable ordered execution snapshot. Each entry pins one step:
    --   { sequence_index, form_definition_id, form_definition_version_id, requirement_id }
    steps_json jsonb NOT NULL,
    -- What this snapshot was derived FROM, so a version can always explain itself.
    business_process_revision_id uuid,
    -- Stable digest of the execution-relevant snapshot; see the idempotency note below.
    derivation_fingerprint text,
    published_at timestamptz,
    published_by_user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT chk_form_packet_definition_versions_status CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])),
    CONSTRAINT uq_form_packet_definition_versions_definition_version UNIQUE (form_packet_definition_id, version_number),
    CONSTRAINT chk_form_packet_definition_versions_publish_metadata_consistency CHECK (
        (status = ANY (ARRAY['published'::text, 'archived'::text]) AND published_at IS NOT NULL)
        OR (status = 'draft')
    ),
    CONSTRAINT chk_form_packet_definition_versions_steps_is_array CHECK (jsonb_typeof(steps_json) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_form_packet_definition_versions_org
    ON public.form_packet_definition_versions (org_id);
CREATE INDEX IF NOT EXISTS idx_form_packet_definition_versions_def_status
    ON public.form_packet_definition_versions (form_packet_definition_id, status);
CREATE INDEX IF NOT EXISTS idx_form_packet_definition_versions_def_version_desc
    ON public.form_packet_definition_versions (form_packet_definition_id, version_number DESC);

/*
 * NO VERSION SPAM.
 *
 * The derivation runs whenever configuration is read, and an identical derivation
 * must resolve to the SAME published version rather than minting a new one each
 * time. The fingerprint is a digest of the execution-relevant snapshot only
 * (ordered step identity + pinned Form versions), so re-running a resolver is
 * idempotent while a real change still produces a new version.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_packet_definition_versions_published_fingerprint
    ON public.form_packet_definition_versions (form_packet_definition_id, derivation_fingerprint)
    WHERE status = 'published' AND derivation_fingerprint IS NOT NULL;

COMMENT ON TABLE public.form_packet_definition_versions IS
    'Immutable published snapshot of a DERIVED packet: ordered steps each pinning a form_definition_version_id. Mirrors form_definition_versions.';
COMMENT ON COLUMN public.form_packet_definition_versions.steps_json IS
    'Ordered execution snapshot. Immutable once published — later Form/Business Process changes create a NEW version.';
COMMENT ON COLUMN public.form_packet_definition_versions.derivation_fingerprint IS
    'Digest of ordered step identity + pinned form versions. Equivalent derivations resolve to the same published version.';

-- -----------------------------------------------------------------------------
-- 2) Sessions pin the version they started on
-- -----------------------------------------------------------------------------
ALTER TABLE public.form_packet_sessions
    ADD COLUMN IF NOT EXISTS packet_definition_version_id uuid
        REFERENCES public.form_packet_definition_versions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_packet_sessions_packet_definition_version
    ON public.form_packet_sessions (packet_definition_version_id);

COMMENT ON COLUMN public.form_packet_sessions.packet_definition_version_id IS
    'The packet version this session started on and keeps for its whole life. NULL for sessions that began before versioning — never backfilled with a guess.';

-- -----------------------------------------------------------------------------
-- 3) RLS + privileges (mirror the other packet tables)
-- -----------------------------------------------------------------------------
ALTER TABLE public.form_packet_definition_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS form_packet_definition_versions_select_by_org_role ON public.form_packet_definition_versions;
CREATE POLICY form_packet_definition_versions_select_by_org_role ON public.form_packet_definition_versions FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS form_packet_definition_versions_mutate_by_org_role ON public.form_packet_definition_versions;
CREATE POLICY form_packet_definition_versions_mutate_by_org_role ON public.form_packet_definition_versions FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

/*
 * UPDATE stays available to the same roles the other packet tables allow, because a
 * draft has to be editable and a published version has to be archivable. Publishing
 * immutability is enforced above this line, in the derivation/publish path, exactly
 * as it is for form_definition_versions — the table does not freeze rows itself.
 */
DROP POLICY IF EXISTS form_packet_definition_versions_update_by_org_role ON public.form_packet_definition_versions;
CREATE POLICY form_packet_definition_versions_update_by_org_role ON public.form_packet_definition_versions FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS form_packet_definition_versions_delete_by_org_role ON public.form_packet_definition_versions;
CREATE POLICY form_packet_definition_versions_delete_by_org_role ON public.form_packet_definition_versions FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_packet_definition_versions TO authenticated;
