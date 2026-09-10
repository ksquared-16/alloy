-- Thread 5 Slice B.1 — the smallest trust substrate an external caller needs.
--
-- Thread 4 ratified the Developer Platform architecture and built none of it.
-- This adds only the chain an external credential must walk to become a trusted,
-- tenant-bound principal, and stops there: no /api/v1, no token exchange, no
-- resource endpoints. A caller cannot yet reach a domain — the point of this
-- slice is that when one exists, its authority is already decided here.
--
--   credential → installation → organization + scopes + boundary → principal
--
-- The shape follows `attendance_kiosk_devices` (20260910120000) deliberately.
-- That table solved the same problem for a lobby tablet: a non-human producer,
-- a hashed secret selected on rather than compared, an org read from the row,
-- and a durable producer identity that survives rotation. Reusing its shape
-- means this is the second instance of a reviewed pattern, not a new one.
--
-- ─── THE ONE INVARIANT ───
--
-- Tenant authority comes from the INSTALLATION and from nowhere else. No column
-- here lets a caller name an organization, and there is deliberately no path
-- that accepts one.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Developer Application — software identity, and NOT tenant authority
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Deliberately has NO org_id. An application is a piece of software, not a
-- tenant object: the same application is installed by many organizations, and
-- giving it an owning org would create a second place tenant authority could
-- appear to come from. Authority is the installation's job, exclusively.
CREATE TABLE IF NOT EXISTS public.developer_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Stable, human-readable identity. Appears in audit rows and, later, in
    -- provenance; renaming the display name must not move it.
    slug text NOT NULL,
    name text NOT NULL,
    publisher text NOT NULL,

    -- WHO controls this software. It changes administration, never authority:
    -- a partner_managed application installed by one org has exactly the same
    -- reach inside that org as a tenant_private one with the same grants.
    ownership_mode text NOT NULL DEFAULT 'tenant_private'
        CHECK (ownership_mode IN ('tenant_private', 'alloy_managed', 'partner_managed')),
    distribution_mode text NOT NULL DEFAULT 'private'
        CHECK (distribution_mode IN ('private', 'listed')),

    -- Sandbox and production are separated at the APPLICATION, so an
    -- installation inherits its environment from the software rather than
    -- carrying its own. That makes a sandbox/production mismatch structurally
    -- impossible instead of a check somebody must remember to write: there is no
    -- pair of rows that could disagree.
    environment text NOT NULL DEFAULT 'production'
        CHECK (environment IN ('sandbox', 'production')),

    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_devapp_slug_nonempty CHECK (btrim(slug) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_developer_applications_slug
    ON public.developer_applications (slug);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Installation — the tenant-authority root
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.app_installations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES public.developer_applications(id) ON DELETE RESTRICT,

    -- THE tenant binding. Every external request's organization is read from
    -- this column and never from the request.
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

    -- WHAT this installation may do. Empty means nothing, not everything.
    granted_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],

    -- WHERE it may act.
    --   org_wide  → every location in the organization
    --   locations → only those listed; an EMPTY list therefore denies everything
    -- Two modes rather than one nullable array, because "no locations listed"
    -- and "all locations" must never be the same value. An installation that is
    -- half-provisioned has to fail closed, and the most common half-provisioned
    -- state is an empty list.
    boundary_mode text NOT NULL DEFAULT 'locations'
        CHECK (boundary_mode IN ('org_wide', 'locations')),
    location_boundary uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],

    -- Durable producer identity for provenance, stable across credential
    -- rotation — the same reason attendance_kiosk_devices keeps producer_key
    -- separate from credential_hash. Rotating a secret must never orphan the
    -- provenance of facts already authored.
    producer_key text NOT NULL,

    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'revoked')),

    installed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    suspended_at timestamptz,
    revoked_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- State must be legible in the row, not inferred from a missing timestamp.
    CONSTRAINT ck_install_suspended_has_timestamp
        CHECK (status <> 'suspended' OR suspended_at IS NOT NULL),
    CONSTRAINT ck_install_revoked_has_timestamp
        CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
    CONSTRAINT ck_install_producer_key_nonempty
        CHECK (btrim(producer_key) <> '')
);

-- One installation per application per organization.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_installations_app_org
    ON public.app_installations (application_id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_installations_producer_key
    ON public.app_installations (org_id, producer_key);

CREATE INDEX IF NOT EXISTS idx_app_installations_org_active
    ON public.app_installations (org_id) WHERE status = 'active';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Credential — authentication material, bound to exactly one installation
-- ═════════════════════════════════════════════════════════════════════════════
--
-- The secret is NEVER stored. `secret_hash` is a SHA-256 digest and resolution
-- SELECTS BY IT, the same lookup shape kiosk devices, public form links and tour
-- links all use: an attacker learns "a row matched" or "none did", and there is
-- no per-byte comparison in the application to time.
--
-- Two hash columns, not one, because an external partner cannot redeploy in the
-- same instant Alloy rotates. The overlap is BOUNDED by an explicit expiry so it
-- can never quietly become "this credential has two permanent secrets".
CREATE TABLE IF NOT EXISTS public.app_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id uuid NOT NULL REFERENCES public.app_installations(id) ON DELETE CASCADE,

    -- Public, non-secret, safe to log, and NOT sufficient to authenticate.
    client_id text NOT NULL,
    label text NOT NULL,

    secret_hash text NOT NULL,
    secret_hash_secondary text,
    secondary_expires_at timestamptz,

    -- So an operator can tell two credentials apart when rotating. Four
    -- characters of a 256-bit secret is not a useful head start for an attacker
    -- who must still produce the whole thing.
    secret_last_four text,

    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked')),

    expires_at timestamptz,
    last_used_at timestamptz,
    last_seen_ip_hash text,

    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    rotated_at timestamptz,
    revoked_at timestamptz,
    revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    CONSTRAINT ck_cred_revoked_has_timestamp
        CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
    -- A secondary secret without a deadline is an unbounded second credential.
    CONSTRAINT ck_cred_secondary_requires_expiry
        CHECK (secret_hash_secondary IS NULL OR secondary_expires_at IS NOT NULL),
    CONSTRAINT ck_cred_client_id_nonempty CHECK (btrim(client_id) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_credentials_client_id
    ON public.app_credentials (client_id);

-- The resolution path's only lookups. UNIQUE ACROSS THE DEPLOYMENT: a digest
-- collision between two organizations' credentials would make the tenant
-- boundary depend on which row came back first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_credentials_secret_hash
    ON public.app_credentials (secret_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_credentials_secret_hash_secondary
    ON public.app_credentials (secret_hash_secondary)
    WHERE secret_hash_secondary IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_credentials_installation
    ON public.app_credentials (installation_id) WHERE status = 'active';

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Security audit — durable, and deliberately not request logging
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Thread 3 found `logAdminAudit` is a console.log with no table behind it, and
-- Thread 4 made a durable audit store a prerequisite of the FIRST credential:
-- a credential issued into a system that records nothing cannot be investigated.
--
-- This is the security boundary only — issuance, rotation, revocation and
-- authentication outcomes. Per-request API activity belongs to the /api/v1
-- gateway that does not exist yet, and merging them now would mean designing a
-- request log around a request shape nobody has built.
--
-- Nulls are meaningful: a rejected unknown credential resolves no installation,
-- so it has no organization. Recording that as NULL is the honest answer and is
-- why org_id is nullable on an otherwise tenant-scoped table.
CREATE TABLE IF NOT EXISTS public.app_security_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL DEFAULT now(),

    event_type text NOT NULL CHECK (event_type IN (
        'credential.created',
        'credential.rotated',
        'credential.revoked',
        'installation.created',
        'installation.suspended',
        'installation.revoked',
        'installation.scopes_changed',
        'authentication.succeeded',
        'authentication.rejected'
    )),
    outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'error')),

    -- All nullable: a rejection may resolve none of them.
    org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
    application_id uuid REFERENCES public.developer_applications(id) ON DELETE SET NULL,
    installation_id uuid REFERENCES public.app_installations(id) ON DELETE SET NULL,
    credential_id uuid REFERENCES public.app_credentials(id) ON DELETE SET NULL,

    -- Coarse and stable. The wire refusal stays vague so a probe cannot tell
    -- "unknown credential" from "revoked"; the AUDIT may be specific, because it
    -- is read by the tenant who owns the credential, not by the caller.
    reason_code text,
    correlation_id text,

    -- Present only for human-initiated administration.
    actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    client_ip_hash text,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_app_security_audit_org_time
    ON public.app_security_audit (org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_security_audit_installation_time
    ON public.app_security_audit (installation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_security_audit_event_time
    ON public.app_security_audit (event_type, occurred_at DESC);

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Row-level security
-- ═════════════════════════════════════════════════════════════════════════════
--
-- CREATE TABLE leaves the default ACL granting ALL, and a GRANT never removes
-- anything. Revoke first, or these ship writable by every authenticated user.
-- (The same warning attendance_kiosk_devices carries, for the same reason.)

ALTER TABLE public.developer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_applications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.developer_applications FROM PUBLIC;
REVOKE ALL ON public.developer_applications FROM anon;
REVOKE ALL ON public.developer_applications FROM authenticated;

-- No policy, deliberately: the application catalogue is global, and
-- `tenant_private` names would otherwise be readable across tenants — one
-- organization learning which private integrations another has built. Server
-- code reads this table through the installation that authorizes the read.

ALTER TABLE public.app_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_installations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_installations FROM PUBLIC;
REVOKE ALL ON public.app_installations FROM anon;
REVOKE ALL ON public.app_installations FROM authenticated;

GRANT SELECT (
    id, application_id, org_id, granted_scopes, boundary_mode, location_boundary,
    producer_key, status, installed_by, suspended_at, revoked_at, metadata,
    created_at, updated_at
) ON public.app_installations TO authenticated;

DROP POLICY IF EXISTS app_installations_select_org ON public.app_installations;
CREATE POLICY app_installations_select_org ON public.app_installations
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

-- Granting machine authority is an administrative act. `ops` may see which
-- integrations exist; only owner/admin may change what one may do.
DROP POLICY IF EXISTS app_installations_write_org ON public.app_installations;
CREATE POLICY app_installations_write_org ON public.app_installations
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));

ALTER TABLE public.app_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_credentials FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_credentials FROM PUBLIC;
REVOKE ALL ON public.app_credentials FROM anon;
REVOKE ALL ON public.app_credentials FROM authenticated;

-- COLUMN-LEVEL on purpose. Both hash columns are omitted: they are only
-- digests, but nobody operating Alloy has a reason to read one, and a column no
-- session can select is a column that cannot leak through a generic `select *`.
GRANT SELECT (
    id, installation_id, client_id, label, secret_last_four, status,
    expires_at, last_used_at, secondary_expires_at,
    created_at, created_by, rotated_at, revoked_at, revoked_by
) ON public.app_credentials TO authenticated;

-- A credential has no org column of its own; its tenancy IS its installation's.
-- Expressing that as a join rather than a copied org_id means the two can never
-- disagree — which is the failure Thread 3 found on 40 tables whose policies
-- tested a role and forgot the tenant.
DROP POLICY IF EXISTS app_credentials_select_via_installation ON public.app_credentials;
CREATE POLICY app_credentials_select_via_installation ON public.app_credentials
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.app_installations i
        WHERE i.id = app_credentials.installation_id
          AND public.has_org_role(i.org_id, ARRAY['owner','admin'])
    ));

-- No write policy. Issuing, rotating and revoking are server-side acts that must
-- write an audit row in the same breath; a direct table write from a session
-- could not, so none is permitted.

ALTER TABLE public.app_security_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_security_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_security_audit FROM PUBLIC;
REVOKE ALL ON public.app_security_audit FROM anon;
REVOKE ALL ON public.app_security_audit FROM authenticated;

GRANT SELECT (
    id, occurred_at, event_type, outcome, org_id, application_id,
    installation_id, credential_id, reason_code, correlation_id,
    actor_user_id, metadata
) ON public.app_security_audit TO authenticated;

-- Rows with a NULL org_id — a rejected credential that resolved no installation
-- — are visible to no session at all. They are unattributed by construction, and
-- showing them to a tenant would show that tenant other tenants' failures.
DROP POLICY IF EXISTS app_security_audit_select_org ON public.app_security_audit;
CREATE POLICY app_security_audit_select_org ON public.app_security_audit
    FOR SELECT TO authenticated
    USING (org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner','admin']));

-- No insert policy: audit rows are written server-side, never by a session.

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Comments
-- ═════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.developer_applications IS
    'External software identity for the Developer Platform. Deliberately has no org_id: an application is not a tenant object, and tenant authority comes only from app_installations.';
COMMENT ON TABLE public.app_installations IS
    'The tenant-authority root for external API calls. An external request''s organization, scopes and resource boundary are all read from this row and never from the request.';
COMMENT ON COLUMN public.app_installations.boundary_mode IS
    'org_wide grants every location in the organization; locations grants only those listed. Two modes rather than one nullable array, so that an empty list can never be mistaken for "all" — a half-provisioned installation must fail closed.';
COMMENT ON COLUMN public.app_installations.producer_key IS
    'Durable producer identity for provenance. Stable across credential rotation, so rotating a secret never orphans facts already authored.';
COMMENT ON TABLE public.app_credentials IS
    'Authentication material bound to exactly one installation. The plaintext secret is never stored; resolution selects by SHA-256 digest rather than comparing in process.';
COMMENT ON COLUMN public.app_credentials.secret_hash_secondary IS
    'A bounded second secret so an external partner can rotate without downtime. ck_cred_secondary_requires_expiry prevents it becoming a permanent second credential.';
COMMENT ON TABLE public.app_security_audit IS
    'Durable security-boundary audit for the Developer Platform: issuance, rotation, revocation and authentication outcomes. Not per-request API activity — that belongs to the /api/v1 gateway when it exists. Never stores secrets, headers or request bodies.';
