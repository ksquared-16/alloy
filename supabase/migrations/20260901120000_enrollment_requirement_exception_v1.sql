-- =============================================================================
-- Governed requirement exception V1 — the canonical way to say
-- "this exact requirement is legitimately excepted".
-- =============================================================================
-- THE GAP THIS CLOSES
--
--   Business Process owns WHICH requirements exist and at what level.
--   Forms owns the EVIDENCE that satisfies one.
--   `evaluateEnrollmentCompletionSufficiency` owns whether they BLOCK.
--
-- Nothing owned "a person decided this one does not apply to this family". The only ways to get
-- an enrolment past a requirement that genuinely does not apply were to fabricate a Form
-- submission, to edit the Business Process for everybody, or to move the child by hand. All three
-- destroy the record of what was actually true.
--
-- THIS IS NOT A WAIVER PLATFORM. One disposition, one subject, one requirement, one reason, one
-- approver, and a state machine narrow enough to be correct: active, revoked, superseded. There is
-- no approval workflow, no expiry engine, no waiver catalogue and no policy language, because none
-- of those is required to make one requirement non-blocking and keep the record honest.
--
-- WHAT AN EXCEPTION IS NOT
--
-- It is not evidence. The requirement's own status is untouched, so it stays visibly OUTSTANDING
-- and separately EXCEPTED. An operator reading the journey later sees that a person decided this,
-- not that paperwork arrived. Marking the Form submitted would have been fewer moving parts and
-- would have made the two indistinguishable forever.
--
-- SUBJECT: THE ENROLLMENT PARTICIPATION
--
-- `opportunity_customer_members` is the canonical child Enrollment Participation and the durable
-- subject of an Enrollment episode. A process instance is not the subject — a journey can be
-- re-anchored, and an exception must not evaporate when it is. The Opportunity is not the subject
-- either: a legitimate Enrollment may have no acquisition episode at all.
--
-- REQUIREMENT IDENTITY IS (stage_key, requirement_id)
--
-- `StageRequirementV1.requirement_id` is documented as "stable within the stage" — so the stage is
-- part of the identity, not decoration. Keying on `requirement_id` alone would let an exception
-- granted against one stage's requirement silently apply to a same-named requirement on another.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.enrollment_requirement_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,

    -- The durable Enrollment subject. CASCADE because an exception is meaningless without the
    -- participation it excepts a requirement for.
    enrollment_participation_id uuid NOT NULL
        REFERENCES public.opportunity_customer_members(id) ON DELETE CASCADE,

    -- Exact process requirement identity.
    stage_key text NOT NULL,
    requirement_id text NOT NULL,

    -- V1 VOCABULARY, deliberately one value. `excepted` means "this requirement does not apply to
    -- this enrolment". A CHECK with one member is not redundant: it makes adding a second
    -- disposition a decision someone makes on purpose, in a migration, rather than a string a
    -- caller invents.
    disposition text NOT NULL DEFAULT 'excepted' CHECK (disposition IN ('excepted')),

    -- REQUIRED. An exception with no stated reason is indistinguishable from a mistake.
    reason text NOT NULL CHECK (btrim(reason) <> ''),

    state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'revoked', 'superseded')),

    -- WHO DECIDED, and when. Separate from created_at: a row may be written by a job acting on a
    -- decision, and the decision is the thing that matters.
    approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at timestamptz NOT NULL DEFAULT now(),

    revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at timestamptz,
    revoke_reason text,

    -- HISTORY. An exception is never edited in place; a replacement supersedes it, so what was
    -- true on any past date stays answerable.
    supersedes_id uuid REFERENCES public.enrollment_requirement_exceptions(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz,

    -- A revoked exception must say who revoked it and when, or "revoked" is an assertion with no
    -- author -- which is exactly the state this table exists to prevent.
    CONSTRAINT ck_enrollment_requirement_exception_revocation
        CHECK (state <> 'revoked' OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);

-- ONE ACTIVE EXCEPTION per subject per requirement. This is what makes "apply an exception"
-- idempotent at the storage layer rather than by convention: a retry cannot produce a second
-- active row, whatever the caller believes about what it already wrote.
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollment_requirement_exception_active
    ON public.enrollment_requirement_exceptions
       (org_id, enrollment_participation_id, stage_key, requirement_id)
    WHERE state = 'active';

-- The operational read: what is currently excepted on this enrolment.
CREATE INDEX IF NOT EXISTS idx_enrollment_requirement_exception_subject
    ON public.enrollment_requirement_exceptions (org_id, enrollment_participation_id, state);

ALTER TABLE public.enrollment_requirement_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_requirement_exceptions FORCE ROW LEVEL SECURITY;

-- The `postgres` role's default ACL grants ALL at CREATE TABLE and a GRANT never removes anything.
-- Revoke before granting, or this ships writable by every authenticated user.
REVOKE ALL ON public.enrollment_requirement_exceptions FROM PUBLIC;
REVOKE ALL ON public.enrollment_requirement_exceptions FROM anon;
REVOKE ALL ON public.enrollment_requirement_exceptions FROM authenticated;
GRANT SELECT ON public.enrollment_requirement_exceptions TO authenticated;

-- RLS carries TENANCY. It is not the authorization decision: that is the permission key below,
-- checked server-side at the write seam, because the writer holds a service-role client and RLS
-- would never see it. Both exist on purpose -- the policy is what protects the table from a
-- direct client, the permission is what protects it from an operator who merely has a route.
DROP POLICY IF EXISTS enrollment_requirement_exception_select_org ON public.enrollment_requirement_exceptions;
CREATE POLICY enrollment_requirement_exception_select_org ON public.enrollment_requirement_exceptions
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS enrollment_requirement_exception_write_org ON public.enrollment_requirement_exceptions;
CREATE POLICY enrollment_requirement_exception_write_org ON public.enrollment_requirement_exceptions
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));

COMMENT ON TABLE public.enrollment_requirement_exceptions IS
    'Canonical owner of "this exact Enrollment requirement is legitimately excepted for this child". Never evidence: the requirement keeps its own status, so excepted and satisfied stay distinguishable.';

-- =============================================================================
-- AUTHORIZATION IS A PERMISSION, NOT A JOB TITLE
-- =============================================================================
-- One key. Granting an exception and revoking one are the same authority: whoever may decide a
-- requirement does not apply may also decide it applies again. Splitting them would produce a role
-- that can excuse a requirement and cannot put it back, which is the worse half to hold alone.
--
-- Granted to `admin` only by default, following D-H6. `ops` is not granted: an operator who works
-- the Enrollment queue every day is not automatically the person who decides a requirement does not
-- apply. An org that wants that grants it explicitly -- a decision someone made, rather than a
-- default nobody noticed.
INSERT INTO public.permission_definitions (key, group_key, label, description)
VALUES
    ('enrollment.requirement_exception.manage', 'enrollment', 'Except Enrollment requirements',
     'Record that a specific Enrollment requirement is excepted for one child, and revoke that exception. Never marks paperwork submitted.')
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now();

INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'enrollment.requirement_exception.manage', true
  FROM public.role_definitions rd
 WHERE rd.role_key = 'admin'
   AND rd.is_active
   AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = rd.org_id
          AND g.role_key = rd.role_key
          AND g.permission_key = 'enrollment.requirement_exception.manage'
   );
