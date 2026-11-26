-- =============================================================================
-- External attendance producers — registry, credential, mappings, evidence
-- =============================================================================
-- Thread 6, Slice 2. The canonical ingestion path already exists and is already
-- generic: `recordAttendanceEvent` owns the invariants, `child_attendance_events`
-- carries idempotency and correction lineage, provenance is derived server-side
-- with `CLIENT_ASSERTABLE_CHANNELS` deliberately empty, and
-- `NonHumanProducerAuthority` is producerKey + allowedSiteLocationIds +
-- grantedPermissionKeys — it says nothing about kiosks. The kiosk simply supplies
-- one from its own registry.
--
-- So nothing here rebuilds attendance. What is missing is the boundary in front
-- of it: something that can say WHICH external system is calling, whether it is
-- still trusted, which sites it may author for, and which canonical child a
-- provider's own identifier means. Four tables, and the fourth is not truth.
--
-- ── WHY NOT `external_mappings` ──
--
-- That table exists, and it was the first thing checked. It is dormant legacy
-- from the baseline remote schema: zero rows, and no product code references it.
-- It also cannot do this job. Its uniqueness is `(source, entity_type,
-- external_id)` with NO `org_id`, so two tenants using the same provider with
-- the same child identifier collide globally — the first mapping wins and the
-- second tenant's event resolves to another tenant's child. Its target is a
-- polymorphic `internal_table text` + `internal_id uuid` with no foreign key, so
-- nothing prevents a mapping pointing at a deleted row, a row of the wrong kind,
-- or a row in another org.
--
-- For a table whose whole purpose is deciding which child a provider means, that
-- is not a foundation. Overloading it "to avoid a mapping table" would have been
-- exactly the shortcut the brief warns against. The dormant table is left
-- untouched and flagged for retirement rather than quietly given a second life.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The producer registry
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A durable identity for a non-human attendance producer that is not a kiosk.
-- Deliberately shaped to RESOLVE INTO the existing NonHumanProducerAuthority
-- rather than to become a second authorization object: `producer_key` becomes
-- `source_key` on the fact, the site rows become `allowedSiteLocationIds`, and
-- `capabilities` becomes `grantedPermissionKeys`. Attendance authorization is
-- unchanged; this only answers who is asking.
CREATE TABLE IF NOT EXISTS public.attendance_integration_producers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

    -- WHICH external system this is. A key, not free text: an adapter is
    -- selected by it, and an unrecognised provider must fail rather than fall
    -- back to a generic parse of somebody's payload.
    provider_key text NOT NULL CHECK (btrim(provider_key) <> ''),

    -- The durable producer identity written to child_attendance_events.source_key.
    -- Stable across credential rotation: rotating a secret must not orphan the
    -- provenance of facts already authored. Same law the kiosk registry states.
    producer_key text NOT NULL CHECK (btrim(producer_key) <> ''),
    label text NOT NULL,

    -- WHAT it may do. Explicit rather than implied, so revoking one capability
    -- is expressible without revoking the producer.
    capabilities text[] NOT NULL DEFAULT ARRAY['attendance.record']::text[],

    -- The credential is never stored. A SHA-256 digest, and resolution SELECTS
    -- BY it — the same lookup shape the kiosk device credential and the public
    -- form links use, so an attacker learns "a row matched" or "none did" and
    -- there is no per-byte comparison in the application to time.
    credential_hash text,
    -- Shown to an operator so two producers can be told apart when rotating.
    -- Not a secret and not sufficient to authenticate.
    credential_last_four text,

    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    revoked_at timestamptz,
    revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    rotated_at timestamptz,
    last_seen_at timestamptz,
    updated_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT ck_integration_producer_revoked_has_timestamp
        CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
    CONSTRAINT ck_integration_producer_capabilities_nonempty
        CHECK (array_length(capabilities, 1) >= 1)
);

-- One producer identity per org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_producer_key
    ON public.attendance_integration_producers (org_id, producer_key);

-- The authentication lookup. Unique across the deployment because a digest
-- collision between two orgs' producers would make the tenant boundary depend on
-- which row came back first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_producer_credential
    ON public.attendance_integration_producers (credential_hash)
    WHERE credential_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_producer_org_active
    ON public.attendance_integration_producers (org_id, provider_key)
    WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Which sites a producer may author for
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A separate table rather than an array column, because each grant is a decision
-- with its own lifetime, and because a foreign key can then enforce that the
-- site is a real location. Empty denies everything — a producer authorized for
-- no site can author nothing, which is the correct default for a row that was
-- just created.
CREATE TABLE IF NOT EXISTS public.attendance_integration_producer_sites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    producer_id uuid NOT NULL
        REFERENCES public.attendance_integration_producers(id) ON DELETE CASCADE,
    site_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT uq_integration_producer_site UNIQUE (producer_id, site_location_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_producer_sites_lookup
    ON public.attendance_integration_producer_sites (producer_id, org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. External identity mapping
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The provider's identifier for a child or a location, and the canonical Alloy
-- entity it means. Mapping does NOT duplicate identity: the canonical entity is
-- the one the rest of the platform already knows, and this only records a
-- translation somebody explicitly made.
--
-- TYPED TARGETS, NOT A POLYMORPHIC POINTER. A child maps to `customer_members`
-- and a location to `locations`, each with a real foreign key, and a CHECK
-- requires exactly the one matching the declared entity type. The alternative —
-- `internal_table text` + `internal_id uuid` — is what the dormant legacy table
-- does, and it cannot stop a mapping pointing at a row of the wrong kind or a
-- row in another tenant.
CREATE TABLE IF NOT EXISTS public.attendance_integration_mappings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    producer_id uuid NOT NULL
        REFERENCES public.attendance_integration_producers(id) ON DELETE CASCADE,

    external_entity_type text NOT NULL
        CHECK (external_entity_type IN ('child', 'location')),
    external_id text NOT NULL CHECK (btrim(external_id) <> ''),

    child_customer_member_id uuid REFERENCES public.customer_members(id) ON DELETE RESTRICT,
    location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,

    -- Disabled rather than deleted: a mapping that was live when a fact was
    -- authored is part of how that fact came to name the child it names.
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    disabled_at timestamptz,
    disabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Exactly one target, and it must be the one the type declares. Without this
    -- a row could claim to map a child while pointing at a location.
    CONSTRAINT ck_integration_mapping_target_matches_type CHECK (
        (external_entity_type = 'child'
            AND child_customer_member_id IS NOT NULL AND location_id IS NULL)
        OR (external_entity_type = 'location'
            AND location_id IS NOT NULL AND child_customer_member_id IS NULL)
    ),
    CONSTRAINT ck_integration_mapping_disabled_has_timestamp
        CHECK (status <> 'disabled' OR disabled_at IS NOT NULL)
);

/*
 * AMBIGUITY IS IMPOSSIBLE, NOT MERELY DETECTED.
 *
 * One ACTIVE mapping per (org, producer, type, external id). Without it a
 * provider identifier could resolve to two children and the answer would depend
 * on row order — the same failure the kiosk credential index exists to prevent.
 * Partial, so superseded mappings accumulate as history.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_mapping_active_external
    ON public.attendance_integration_mappings
        (org_id, producer_id, external_entity_type, external_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_integration_mapping_lookup
    ON public.attendance_integration_mappings
        (producer_id, external_entity_type, external_id, status);

/*
 * TENANCY AS A DATABASE INVARIANT.
 *
 * The mapping's org, the producer's org and the target's org must agree. A
 * mapping that crossed them would resolve one tenant's provider event onto
 * another tenant's child — the worst failure this table could have, and a
 * cross-row condition no foreign key can express.
 */
CREATE OR REPLACE FUNCTION public.assert_integration_mapping_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_producer_org uuid;
    v_target_org uuid;
BEGIN
    SELECT p.org_id INTO v_producer_org
    FROM public.attendance_integration_producers p WHERE p.id = NEW.producer_id;
    IF v_producer_org IS NULL OR v_producer_org <> NEW.org_id THEN
        RAISE EXCEPTION 'attendance_integration_mappings: producer belongs to a different org'
            USING ERRCODE = 'check_violation';
    END IF;

    /*
     * The declared type must match the populated target BEFORE tenancy is
     * judged. A CHECK constraint says the same thing, but Postgres evaluates
     * BEFORE-triggers first, so without this a row claiming `child` while
     * pointing at a location was refused with "belongs to a different org" —
     * true in the sense that a null target belongs to no org, and useless to
     * whoever has to work out what they got wrong.
     */
    IF NEW.external_entity_type = 'child' THEN
        IF NEW.child_customer_member_id IS NULL OR NEW.location_id IS NOT NULL THEN
            RAISE EXCEPTION 'attendance_integration_mappings: entity type child requires child_customer_member_id and no location_id'
                USING ERRCODE = 'check_violation';
        END IF;
        SELECT cm.org_id INTO v_target_org
        FROM public.customer_members cm WHERE cm.id = NEW.child_customer_member_id;
    ELSE
        IF NEW.location_id IS NULL OR NEW.child_customer_member_id IS NOT NULL THEN
            RAISE EXCEPTION 'attendance_integration_mappings: entity type location requires location_id and no child_customer_member_id'
                USING ERRCODE = 'check_violation';
        END IF;
        SELECT l.org_id INTO v_target_org
        FROM public.locations l WHERE l.id = NEW.location_id;
    END IF;

    IF v_target_org IS NULL OR v_target_org <> NEW.org_id THEN
        RAISE EXCEPTION 'attendance_integration_mappings: mapped entity belongs to a different org'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_integration_mapping_tenancy ON public.attendance_integration_mappings;
CREATE TRIGGER trg_integration_mapping_tenancy
    BEFORE INSERT OR UPDATE OF org_id, producer_id, child_customer_member_id, location_id
    ON public.attendance_integration_mappings
    FOR EACH ROW EXECUTE FUNCTION public.assert_integration_mapping_tenancy();

-- The same tenancy law for the producer's site grants.
CREATE OR REPLACE FUNCTION public.assert_integration_producer_site_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_producer_org uuid;
    v_site_org uuid;
BEGIN
    SELECT p.org_id INTO v_producer_org
    FROM public.attendance_integration_producers p WHERE p.id = NEW.producer_id;
    SELECT l.org_id INTO v_site_org FROM public.locations l WHERE l.id = NEW.site_location_id;
    IF v_producer_org IS NULL OR v_producer_org <> NEW.org_id OR v_site_org IS NULL OR v_site_org <> NEW.org_id THEN
        RAISE EXCEPTION 'attendance_integration_producer_sites: producer and site must share the org'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_integration_producer_site_tenancy ON public.attendance_integration_producer_sites;
CREATE TRIGGER trg_integration_producer_site_tenancy
    BEFORE INSERT OR UPDATE ON public.attendance_integration_producer_sites
    FOR EACH ROW EXECUTE FUNCTION public.assert_integration_producer_site_tenancy();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Provider evidence — NOT attendance truth
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Modelled on `payment_provider_events`, whose own comment names the property
-- that matters: a disposition is "the difference between a log and evidence".
-- Attendance projections read `child_attendance_events` and must never read this
-- table; it exists so a mapping failure, a replay, a correction correlation or a
-- retry can be reconstructed afterwards.
--
-- `org_id` is RESOLVED, never asserted. An event naming a producer Alloy does not
-- know stays here with a null org and an `unattributed` disposition, which is a
-- real answer rather than a silent drop.
CREATE TABLE IF NOT EXISTS public.attendance_integration_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    provider_key text NOT NULL,
    -- The provider's own id for the delivery. The dedupe identity, namespaced by
    -- producer: a mutable full-payload hash would make a corrected event look
    -- like a different event, and a replayed one look new after any field moved.
    provider_event_id text NOT NULL CHECK (btrim(provider_event_id) <> ''),
    provider_event_type text,

    -- As delivered. NOT authority — resolved through the producer registry
    -- before use, exactly as the payments inbox resolves its account reference.
    presented_producer_key text,

    org_id uuid REFERENCES public.orgs(id) ON DELETE RESTRICT,
    producer_id uuid REFERENCES public.attendance_integration_producers(id) ON DELETE RESTRICT,

    /*
     * WHAT WE DID WITH IT.
     *
     *   received        stored, not yet processed
     *   applied         it authored a canonical attendance fact
     *   duplicate       a replay of an event already applied
     *   unmapped        identity could not be resolved; awaiting a mapping
     *   unattributed    the producer itself could not be resolved
     *   conflicted      same event id, different meaning
     *   rejected        refused by authorization or validation
     *
     * Deliberately the SAME words as `payment_provider_events`: an inbox
     * disposition means the same thing whoever the provider is, and a second
     * vocabulary would only make two surfaces that must be learned separately.
     *
     * `duplicate` is what a REPLAY is told, not what its row becomes. Identity
     * here is (producer, provider event id), so a redelivery is the same row —
     * which stays `applied`, because overwriting it with `duplicate` would erase
     * the very outcome the caller is being told about.
     */
    disposition text NOT NULL DEFAULT 'received'
        CHECK (disposition IN ('received', 'applied', 'duplicate', 'unmapped', 'unattributed', 'conflicted', 'rejected')),
    failure_code text,

    -- The canonical fact this event produced, when it produced one. The only
    -- link from evidence to truth, and it points one way.
    attendance_event_id uuid REFERENCES public.child_attendance_events(id) ON DELETE SET NULL,

    -- Detecting conflicting reuse of one external id. Not the dedupe identity —
    -- the identity is the provider's event id; this only tells replay from
    -- contradiction.
    payload_fingerprint text,

    -- Times kept apart on purpose: when it physically happened, when the
    -- provider recorded it, and when Alloy received it are three different facts,
    -- and a late delivery must not be mistaken for a late event.
    physical_event_at timestamptz,
    provider_recorded_at timestamptz,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,

    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

-- Dedupe identity: one row per provider event per producer. Where the producer
-- could not be resolved the provider key still namespaces it, so two providers
-- reusing an id do not collide in the inbox either.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_event_identity
    ON public.attendance_integration_events (provider_key, provider_event_id, producer_id)
    WHERE producer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_event_unattributed
    ON public.attendance_integration_events (provider_key, provider_event_id)
    WHERE producer_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_integration_event_disposition
    ON public.attendance_integration_events (org_id, disposition, received_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row-level security
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CREATE TABLE leaves the default ACL granting ALL, and a GRANT never removes
-- anything. Revoke first or these ship writable by every authenticated user.
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'attendance_integration_producers',
        'attendance_integration_producer_sites',
        'attendance_integration_mappings',
        'attendance_integration_events'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END LOOP;
END $$;

-- Operators may see which producers exist and how events resolved; registering
-- or revoking one decides whose events become attendance truth, so writes are
-- owner and admin only. `ops` runs the day, it does not decide who may write
-- facts.
DROP POLICY IF EXISTS integration_producers_select_org ON public.attendance_integration_producers;
CREATE POLICY integration_producers_select_org ON public.attendance_integration_producers
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS integration_producers_write_org ON public.attendance_integration_producers;
CREATE POLICY integration_producers_write_org ON public.attendance_integration_producers
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));

-- COLUMN-LEVEL on the registry: `credential_hash` is omitted. It is only a
-- digest, but nobody has a reason to read it, and a column nobody can select is
-- one that cannot leak through a generic `select *` read model.
GRANT SELECT (
    id, org_id, provider_key, producer_key, label, capabilities, status,
    credential_last_four, revoked_at, created_at, rotated_at, last_seen_at, metadata
) ON public.attendance_integration_producers TO authenticated;

DROP POLICY IF EXISTS integration_producer_sites_select_org ON public.attendance_integration_producer_sites;
CREATE POLICY integration_producer_sites_select_org ON public.attendance_integration_producer_sites
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));
DROP POLICY IF EXISTS integration_producer_sites_write_org ON public.attendance_integration_producer_sites;
CREATE POLICY integration_producer_sites_write_org ON public.attendance_integration_producer_sites
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));
GRANT SELECT ON public.attendance_integration_producer_sites TO authenticated;

DROP POLICY IF EXISTS integration_mappings_select_org ON public.attendance_integration_mappings;
CREATE POLICY integration_mappings_select_org ON public.attendance_integration_mappings
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));
DROP POLICY IF EXISTS integration_mappings_write_org ON public.attendance_integration_mappings;
CREATE POLICY integration_mappings_write_org ON public.attendance_integration_mappings
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));
GRANT SELECT ON public.attendance_integration_mappings TO authenticated;

-- Evidence is readable by operators resolving a failure; nothing authenticated
-- writes it. The ingestion path runs server-side with the service role.
DROP POLICY IF EXISTS integration_events_select_org ON public.attendance_integration_events;
CREATE POLICY integration_events_select_org ON public.attendance_integration_events
    FOR SELECT TO authenticated
    USING (org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner','admin','ops']));
GRANT SELECT ON public.attendance_integration_events TO authenticated;

COMMENT ON TABLE public.attendance_integration_producers IS
    'Non-human attendance producers that are not kiosks. Resolves INTO the existing NonHumanProducerAuthority rather than creating a second authorization object: producer_key becomes source_key on the fact, the site grants become allowedSiteLocationIds, capabilities become grantedPermissionKeys.';
COMMENT ON TABLE public.attendance_integration_mappings IS
    'A provider identifier and the canonical Alloy entity it means, scoped to one org and one producer. Typed foreign keys rather than a polymorphic pointer, and a trigger requiring org agreement, because this table decides which child a provider event is about.';
COMMENT ON TABLE public.attendance_integration_events IS
    'Durable provider evidence and its disposition. NOT attendance truth: attendance projections read child_attendance_events and must never read this table. org_id is resolved through the producer registry, never asserted by the caller.';
