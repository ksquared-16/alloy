-- =============================================================================
-- Staff & Workforce V2 · Slice 3 — Qualification authority
--
-- Four concepts, kept separate because they answer different questions and
-- change on different clocks:
--
--   staff_qualification_types         what a qualification IS      (vocabulary)
--   staff_qualifications             that an employment HOLDS one  (fact)
--   staff_qualification_evidence     what SUPPORTS it              (reference)
--   staff_qualification_requirements where one is REQUIRED         (policy)
--
-- ── WHY THIS IS NEW AUTHORITY ──
-- Measured before building: no table owns these concepts (`app_credentials` is
-- authentication, `organization_provider_credential_events` is payments), and no
-- module does either. The deployed primary carries three certification-SHAPED
-- field definitions on location and vendor with ZERO values — vocabulary debt on
-- unrelated verticals, not a qualification authority — and they are neither
-- migrated nor reinterpreted here.
--
-- ── GRAIN: EMPLOYMENT, NOT PERSON ──
-- A qualification is held under an organization's verification, with that org's
-- evidence and effective dates. "CPR verified by this employer during this
-- employment" does not transfer to another employer just because the human is
-- the same. Employment is therefore the subject. A Person-global credential
-- concept is deliberately NOT created: nothing measured requires one, and two
-- authorities for one fact is the failure this separation exists to avoid.
--
-- ── EXPIRATION IS DERIVED, NEVER TOGGLED ──
-- There is no `is_expired` column and no cron. A qualification is expired when
-- `expires_on < today`, which is a fact about the date rather than about who last
-- ran a job. Types that never expire carry `expires_on IS NULL`. This keeps the
-- projection compatible with the readiness engine's existing `expired` failure
-- kind and `freshness` scope without wiring readiness here.
--
-- ── EVIDENCE IS REFERENCED, NEVER COPIED ──
-- Artifact bytes stay in `documents`, reached through the Forms estate that
-- already holds 47 definitions, 250 submissions and 151 documents. This slice
-- adds no bucket, no upload path and no second submission row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Qualification type — the tenant's vocabulary
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_qualification_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    description text,
    -- Grouping only. Deliberately free text against a short convention rather
    -- than an enum: "what kinds of credential exist" is a vertical question and
    -- a platform enum would be wrong within a release.
    category text,
    -- Whether an expiry date is EXPECTED. Not whether one is present: a type may
    -- expect expiry while a particular held qualification has not recorded it yet.
    expiration_expected boolean NOT NULL DEFAULT true,
    -- Convenience for authoring only. Code never derives an expiry from this;
    -- the held fact always carries its own date.
    default_validity_days integer,
    evidence_required_default boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_qualification_types_org_key_key UNIQUE (org_id, key),
    CONSTRAINT staff_qualification_types_key_format_check
        CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT staff_qualification_types_label_not_blank_check
        CHECK (length(btrim(label)) > 0),
    CONSTRAINT staff_qualification_types_validity_positive_check
        CHECK (default_validity_days IS NULL OR default_validity_days > 0)
);

COMMENT ON TABLE public.staff_qualification_types IS
    'Configuration-owned qualification vocabulary (CPR, First Aid, Background Check, licences, training). Tenant words, not a platform enum.';

CREATE INDEX IF NOT EXISTS staff_qualification_types_org_active_idx
    ON public.staff_qualification_types (org_id, is_active, sort_order, label);

-- -----------------------------------------------------------------------------
-- 2) Held qualification — the effective fact
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_qualifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    employment_id uuid NOT NULL REFERENCES public.employments (id) ON DELETE CASCADE,
    qualification_type_id uuid NOT NULL
        REFERENCES public.staff_qualification_types (id) ON DELETE RESTRICT,

    issued_on date,
    -- NULL means "does not expire", not "unknown". The type says whether an
    -- expiry was expected; this column says whether one exists.
    expires_on date,

    verification_state text NOT NULL DEFAULT 'unverified',
    verified_at timestamptz,
    verified_by uuid,

    -- Renewal keeps history: the new row supersedes the old one, and the old row
    -- stays readable. Nothing is updated in place to represent a renewal.
    supersedes_qualification_id uuid
        REFERENCES public.staff_qualifications (id) ON DELETE SET NULL,
    revoked_at timestamptz,
    revoked_reason text,

    source_key text NOT NULL DEFAULT 'operator',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT staff_qualifications_verification_state_check
        CHECK (verification_state = ANY (ARRAY['unverified'::text, 'verified'::text, 'rejected'::text])),
    CONSTRAINT staff_qualifications_verified_has_timestamp_check
        CHECK (verification_state <> 'verified' OR verified_at IS NOT NULL),
    CONSTRAINT staff_qualifications_date_order_check
        CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on),
    CONSTRAINT staff_qualifications_no_self_supersede_check
        CHECK (supersedes_qualification_id IS NULL OR supersedes_qualification_id <> id),
    CONSTRAINT staff_qualifications_revoked_has_timestamp_check
        CHECK (revoked_reason IS NULL OR revoked_at IS NOT NULL)
);

COMMENT ON TABLE public.staff_qualifications IS
    'A qualification held by one EMPLOYMENT. Expiration is derived from expires_on, never stored as a flag. Renewal supersedes rather than overwrites, so history survives.';
COMMENT ON COLUMN public.staff_qualifications.expires_on IS
    'NULL means the qualification does not expire. Expired is derived: expires_on < the org calendar day.';

CREATE INDEX IF NOT EXISTS staff_qualifications_org_employment_idx
    ON public.staff_qualifications (org_id, employment_id, qualification_type_id);
CREATE INDEX IF NOT EXISTS staff_qualifications_org_expiry_idx
    ON public.staff_qualifications (org_id, expires_on)
    WHERE revoked_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3) Evidence — a reference, never a copy
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_qualification_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    staff_qualification_id uuid NOT NULL
        REFERENCES public.staff_qualifications (id) ON DELETE CASCADE,
    -- The artifact itself stays in the canonical document store.
    document_id uuid NOT NULL REFERENCES public.documents (id) ON DELETE RESTRICT,
    -- Provenance when the artifact arrived through a form. Optional, because an
    -- operator may attach a document that no submission produced.
    form_submission_id uuid REFERENCES public.form_submissions (id) ON DELETE SET NULL,
    note text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_qualification_evidence_unique UNIQUE (staff_qualification_id, document_id)
);

COMMENT ON TABLE public.staff_qualification_evidence IS
    'Many-to-one reference from a held qualification to existing documents. Owns no bytes; creates no second document or submission.';

CREATE INDEX IF NOT EXISTS staff_qualification_evidence_qualification_idx
    ON public.staff_qualification_evidence (staff_qualification_id);

-- -----------------------------------------------------------------------------
-- 4) Requirement policy — org default plus scoped contributions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_qualification_requirements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    qualification_type_id uuid NOT NULL
        REFERENCES public.staff_qualification_types (id) ON DELETE CASCADE,

    -- The applicability axis. `organization` carries no scope_id; the other three
    -- name what they apply to. Assignment type is the operational axis, and it is
    -- the reason a requirement can explain itself as "because this employment is
    -- assigned as Toddler Classroom Coverage".
    scope_type text NOT NULL DEFAULT 'organization',
    scope_id uuid,

    -- Reuses the platform's requirement vocabulary rather than inventing a second
    -- enforcement enum. Slice 3 configures the level; ENFORCEMENT belongs to the
    -- later Readiness slice and is deliberately not wired here.
    requirement_level text NOT NULL DEFAULT 'required',
    evidence_required boolean NOT NULL DEFAULT false,

    effective_start date,
    effective_end date,
    is_active boolean NOT NULL DEFAULT true,
    note text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT staff_qualification_requirements_scope_type_check
        CHECK (scope_type = ANY (ARRAY['organization'::text, 'position'::text, 'site'::text, 'assignment_type'::text])),
    CONSTRAINT staff_qualification_requirements_scope_id_presence_check
        CHECK ((scope_type = 'organization' AND scope_id IS NULL)
            OR (scope_type <> 'organization' AND scope_id IS NOT NULL)),
    CONSTRAINT staff_qualification_requirements_level_check
        CHECK (requirement_level = ANY (ARRAY['off'::text, 'suggested'::text, 'recommended'::text, 'required'::text, 'enforced'::text])),
    CONSTRAINT staff_qualification_requirements_date_order_check
        CHECK (effective_end IS NULL OR effective_start IS NULL OR effective_end >= effective_start),
    CONSTRAINT staff_qualification_requirements_unique_scope
        UNIQUE (org_id, qualification_type_id, scope_type, scope_id)
);

COMMENT ON TABLE public.staff_qualification_requirements IS
    'Where a qualification is required: organization default plus position, site and operational-assignment-type contributions. Configures the level; the Readiness slice owns enforcement.';

CREATE INDEX IF NOT EXISTS staff_qualification_requirements_org_scope_idx
    ON public.staff_qualification_requirements (org_id, scope_type, scope_id)
    WHERE is_active;
