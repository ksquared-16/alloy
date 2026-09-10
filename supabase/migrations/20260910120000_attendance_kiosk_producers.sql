-- Thread 5 — the two facts a kiosk needs that Alloy did not have.
--
-- Thread 2 already built the kiosk CHANNEL: `child_attendance_events.source_type`
-- admits 'kiosk', and `resolveAttendanceProvenance` refuses a non-human channel
-- that cannot name a producer. Thread 2A already built the GATE:
-- `assertNonHumanCaptureAllowed` denies any producer it cannot positively verify.
-- What has never existed is anything that MINTS a producer — so the gate has
-- denied everything, correctly, since the day it was written.
--
-- This adds that, and one other thing the pickup decision has been missing.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trusted kiosk devices
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A kiosk is a NON-HUMAN PRODUCER, not a user. It holds no role, inherits no
-- session, and is bound to exactly one site. The device identity and the adult
-- standing in front of it are different things and stay in different columns all
-- the way to the fact: the device becomes `source_key`, the adult becomes
-- `actor_person_id`. Collapsing them would make a tablet look like the person who
-- collected a child.
--
-- The credential is never stored. `credential_hash` is a SHA-256 digest and the
-- resolution path SELECTS BY IT — the same lookup shape the public form and tour
-- links use (`web/lib/public/forms/tokenHash.ts` explains why that, and not an
-- in-process compare, is the defence). An attacker learns "a row matched" or "none
-- did"; there is no per-byte comparison in the application to time.
CREATE TABLE IF NOT EXISTS public.attendance_kiosk_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

    -- WHERE this device may operate. One site, always. A kiosk that could roam
    -- would make "which site is this fact for" a question about the request
    -- rather than about the device.
    site_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,

    -- The durable producer identity that lands on every fact this device authors.
    -- Stable across credential rotation: rotating a secret must not orphan the
    -- provenance of facts already written.
    producer_key text NOT NULL,
    -- Operator-facing name. "Front desk tablet", not a uuid.
    label text NOT NULL,

    -- WHAT this device may do. Explicit rather than implied, so revoking one
    -- capability is expressible without revoking the device.
    capabilities text[] NOT NULL DEFAULT ARRAY['attendance.record']::text[],

    credential_hash text NOT NULL,
    -- Shown to an operator so they can tell two tablets apart when rotating.
    -- Not a secret and not sufficient to authenticate.
    credential_last_four text,

    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    revoked_at timestamptz,
    revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    rotated_at timestamptz,
    last_seen_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Revocation must be legible in the row, not inferred from a missing date.
    CONSTRAINT ck_kiosk_revoked_has_timestamp
        CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
    CONSTRAINT ck_kiosk_producer_key_nonempty
        CHECK (btrim(producer_key) <> ''),
    CONSTRAINT ck_kiosk_capabilities_nonempty
        CHECK (array_length(capabilities, 1) >= 1)
);

-- One producer identity per org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kiosk_producer_key
    ON public.attendance_kiosk_devices (org_id, producer_key);

-- The resolution path's only lookup: a presented secret, hashed. Unique across
-- the deployment because a digest collision between two orgs' devices would make
-- the org boundary depend on which row came back first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kiosk_credential_hash
    ON public.attendance_kiosk_devices (credential_hash);

CREATE INDEX IF NOT EXISTS idx_kiosk_org_site_active
    ON public.attendance_kiosk_devices (org_id, site_location_id)
    WHERE status = 'active';

ALTER TABLE public.attendance_kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_kiosk_devices FORCE ROW LEVEL SECURITY;

-- CREATE TABLE leaves the default ACL granting ALL, and a GRANT never removes
-- anything. Revoke first or this ships writable by every authenticated user.
REVOKE ALL ON public.attendance_kiosk_devices FROM PUBLIC;
REVOKE ALL ON public.attendance_kiosk_devices FROM anon;
REVOKE ALL ON public.attendance_kiosk_devices FROM authenticated;

-- COLUMN-LEVEL on purpose: `credential_hash` is omitted. It is only a digest, but
-- an operator has no reason to read it, and a column nobody can select is a column
-- that cannot leak through a generic `select *` read model.
GRANT SELECT (
    id, org_id, site_location_id, producer_key, label, capabilities, status,
    credential_last_four, revoked_at, created_at, rotated_at, last_seen_at, metadata
) ON public.attendance_kiosk_devices TO authenticated;

-- Registering a device is an administrative act; operating one is not. `ops` may
-- see which tablets exist at their sites, and may not mint or revoke one.
DROP POLICY IF EXISTS kiosk_devices_select_org ON public.attendance_kiosk_devices;
CREATE POLICY kiosk_devices_select_org ON public.attendance_kiosk_devices
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS kiosk_devices_write_org ON public.attendance_kiosk_devices;
CREATE POLICY kiosk_devices_write_org ON public.attendance_kiosk_devices
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));

COMMENT ON TABLE public.attendance_kiosk_devices IS
    'Trusted non-human attendance producers. Mints the NonHumanProducerAuthority that Thread 2A''s assertNonHumanCaptureAllowed has denied by default since it was written. The device is never the human: producer_key becomes source_key on the fact, while the adult at the device becomes actor_person_id.';
COMMENT ON COLUMN public.attendance_kiosk_devices.credential_hash IS
    'SHA-256 of the device secret. The secret is never stored. Resolution selects BY this column rather than comparing in process — the lookup shape is the defence, as for form and tour links.';
COMMENT ON COLUMN public.attendance_kiosk_devices.producer_key IS
    'Durable producer identity written to child_attendance_events.source_key. Stable across credential rotation, so rotating a secret never orphans the provenance of facts already authored.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Safeguarding screening evidence
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `resolvePickupAuthorization` has always required `safeguardingScreened` — "was
-- the question asked at all" — and nothing in the platform could answer it. The
-- enrollment packet raises a safeguarding question, and a YES becomes a proposed
-- restriction; a NO leaves no trace at all. So "no restriction on file" has meant
-- both "we asked and there is nothing" and "nobody ever asked", and those must
-- never be the same answer for a question about releasing a child.
--
-- This records only the distinction the resolver needs. It is NOT safeguarding
-- administration: no workflow, no review queue, no case management. Those belong
-- to Thread 8.
--
--   no row                        → not evaluated
--   row, no active restriction    → evaluated, nothing blocking
--   row + active restriction      → evaluated, restriction present
--
-- The third state is answered by child_safeguarding_restrictions, which already
-- owns it. This table answers only the first two.
CREATE TABLE IF NOT EXISTS public.child_safeguarding_screenings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    customer_member_id uuid NOT NULL REFERENCES public.customer_members(id) ON DELETE CASCADE,

    -- WHEN the question was actually asked, which is not when the row was written.
    screened_at timestamptz NOT NULL DEFAULT now(),

    -- Where the answer came from. Same vocabulary as the restriction's `source`,
    -- because they are answers to the same question from the same places.
    source text NOT NULL CHECK (source IN ('enrollment_form', 'processing_case', 'operator')),
    source_reference text,

    screened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_screening_source_reference_nonempty
        CHECK (source_reference IS NULL OR btrim(source_reference) <> '')
);

-- The operational read: has this child been screened at all, and most recently when.
CREATE INDEX IF NOT EXISTS idx_child_safeguarding_screening_member
    ON public.child_safeguarding_screenings (org_id, customer_member_id, screened_at DESC);

ALTER TABLE public.child_safeguarding_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_safeguarding_screenings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.child_safeguarding_screenings FROM PUBLIC;
REVOKE ALL ON public.child_safeguarding_screenings FROM anon;
REVOKE ALL ON public.child_safeguarding_screenings FROM authenticated;
GRANT SELECT ON public.child_safeguarding_screenings TO authenticated;

-- Same narrowness as the restrictions it accompanies: this is safeguarding
-- content, not ordinary profile content, so `manager` is not on the list.
DROP POLICY IF EXISTS child_safeguarding_screening_select_org ON public.child_safeguarding_screenings;
CREATE POLICY child_safeguarding_screening_select_org ON public.child_safeguarding_screenings
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS child_safeguarding_screening_write_org ON public.child_safeguarding_screenings;
CREATE POLICY child_safeguarding_screening_write_org ON public.child_safeguarding_screenings
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));

COMMENT ON TABLE public.child_safeguarding_screenings IS
    'Evidence that the safeguarding question was ASKED for a child. Exists so "no restriction on file" stops meaning both "we asked and there is nothing" and "nobody ever asked" — a distinction resolvePickupAuthorization has always required and nothing could answer. Not safeguarding administration; that is Thread 8.';
