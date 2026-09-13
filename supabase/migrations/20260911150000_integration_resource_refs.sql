-- Thread 5 Slice B.5 — one owner for external identity correlation.
--
-- Thread 4 ratified `integration_resource_refs` and nothing built it. The
-- Attendance lane needed correlation before it existed and built
-- `attendance_integration_mappings` instead — good work filling a real vacuum,
-- and now a second answer to the same question. B.4 recorded that as G-15.
--
-- This is the ratified model, and it is generic: correlation is a platform
-- concern, not an attendance one. A future resource correlates through the same
-- table rather than adding a third.
--
-- ─── WHAT AN EXTERNAL ID IS, AND IS NOT ───
--
-- An alias. Never an identity. A reference row is not evidence that a child or a
-- location exists, and nothing may create one from it. Alloy's canonical id
-- stays canonical; a provider id points AT it and never replaces it.

CREATE TABLE IF NOT EXISTS public.integration_resource_refs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The namespace. An installation's references are its own: two integrations
    -- may both call something "room-12" and mean different rooms.
    installation_id uuid NOT NULL REFERENCES public.app_installations(id) ON DELETE CASCADE,
    -- Denormalized from the installation for scoping and indexing. The
    -- installation remains the authority; this must never be written independently.
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

    -- A DOMAIN concept, never a physical table name. Correlating to
    -- "internal_table + internal_id" is the externalize-tables mistake the
    -- dormant `external_mappings` table makes, and the reason it was rejected.
    resource_type text NOT NULL CHECK (resource_type IN ('child', 'location')),
    external_id text NOT NULL CHECK (btrim(external_id) <> ''),

    -- Exactly one target, and it must match the declared type. Without this a
    -- row could claim to map a child while pointing at a location — the same
    -- constraint the attendance mappings table got right and worth keeping.
    child_customer_member_id uuid REFERENCES public.customer_members(id) ON DELETE RESTRICT,
    location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,

    -- Disabled rather than deleted: a mapping that was live when a fact was
    -- authored is part of how that fact came to name what it names. Orphaned is
    -- for a reference whose installation was removed — kept so a reinstall can
    -- reconcile instead of silently duplicating.
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'orphaned')),
    disabled_at timestamptz,
    disabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT ck_resource_ref_target_matches_type CHECK (
        (resource_type = 'child'
            AND child_customer_member_id IS NOT NULL AND location_id IS NULL)
        OR (resource_type = 'location'
            AND location_id IS NOT NULL AND child_customer_member_id IS NULL)
    ),
    CONSTRAINT ck_resource_ref_disabled_has_timestamp
        CHECK (status <> 'disabled' OR disabled_at IS NOT NULL)
);

-- One external id means one thing within an installation. A second active row
-- for the same external id is the ambiguity a resolver must never have to guess
-- its way out of, so the database refuses it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_resource_ref_external
    ON public.integration_resource_refs (installation_id, resource_type, external_id)
    WHERE status = 'active';

-- And one Alloy resource has at most one active external id per installation, so
-- a relink is a deliberate transition rather than an accumulation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_resource_ref_child_target
    ON public.integration_resource_refs (installation_id, child_customer_member_id)
    WHERE status = 'active' AND child_customer_member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_resource_ref_location_target
    ON public.integration_resource_refs (installation_id, location_id)
    WHERE status = 'active' AND location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_resource_ref_org
    ON public.integration_resource_refs (org_id, resource_type);

ALTER TABLE public.integration_resource_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_resource_refs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_resource_refs FROM PUBLIC;
REVOKE ALL ON public.integration_resource_refs FROM anon;
REVOKE ALL ON public.integration_resource_refs FROM authenticated;

GRANT SELECT (
    id, installation_id, org_id, resource_type, external_id,
    child_customer_member_id, location_id, status, disabled_at,
    created_at, updated_at, metadata
) ON public.integration_resource_refs TO authenticated;

DROP POLICY IF EXISTS integration_resource_refs_select_org ON public.integration_resource_refs;
CREATE POLICY integration_resource_refs_select_org ON public.integration_resource_refs
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

COMMENT ON TABLE public.integration_resource_refs IS
    'The single owner of external-identity correlation for the Developer Platform. Installation-scoped. An external id is an ALIAS and never an identity: a reference is not evidence a resource exists, and nothing may create one from it. Supersedes attendance_integration_mappings.';

-- ═════════════════════════════════════════════════════════════════════════════
-- Backfill from the Attendance mappings, so convergence loses nothing
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Only rows whose producer has been converged to an installation can move; the
-- join is on the producer's durable `producer_key`, which app_installations
-- carries for exactly this reason. A mapping whose producer has no installation
-- yet is LEFT WHERE IT IS rather than guessed at — an unconverged producer is a
-- migration step somebody still has to take, not a row to invent an owner for.
INSERT INTO public.integration_resource_refs (
    installation_id, org_id, resource_type, external_id,
    child_customer_member_id, location_id, status, disabled_at, created_at, metadata
)
SELECT
    i.id,
    m.org_id,
    m.external_entity_type,
    m.external_id,
    m.child_customer_member_id,
    m.location_id,
    m.status,
    m.disabled_at,
    m.created_at,
    m.metadata
FROM public.attendance_integration_mappings m
JOIN public.attendance_integration_producers p ON p.id = m.producer_id
JOIN public.app_installations i
    ON i.org_id = p.org_id AND i.producer_key = p.producer_key
WHERE m.status = 'active'
ON CONFLICT DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════════
-- Legacy disposition — recorded in the schema, not only in a document
-- ═════════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE public.attendance_integration_mappings IS
    'SUPERSEDED by public.integration_resource_refs (Thread 5 B.5). TEMPORARY BRIDGE: retained read-only so unconverged producers keep resolving. Canonical owner is integration_resource_refs. Removal trigger: every attendance_integration_producers row has a matching app_installations row and this table has no active mapping without a converged counterpart. No dual write — the converged path writes only integration_resource_refs.';
COMMENT ON TABLE public.attendance_integration_producers IS
    'SUPERSEDED for IDENTITY and CREDENTIALS by developer_applications + app_installations + app_credentials (Thread 5 B.5). TEMPORARY BRIDGE pending per-org conversion. The Developer Platform owns who a producer is; Attendance owns what a producer may author. Removal trigger: all rows converged to installations. It has no rotation, which is one reason it is not the long-term owner.';
COMMENT ON TABLE public.attendance_integration_producer_sites IS
    'SUPERSEDED by the installation resource boundary (app_installations.boundary_mode + location_boundary), Thread 5 B.5. TEMPORARY BRIDGE. Removal trigger: as above.';
