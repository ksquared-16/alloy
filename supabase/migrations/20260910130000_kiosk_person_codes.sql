-- Thread 5 — how a kiosk learns WHO is standing at it.
--
-- ── WHY A PER-PERSON CODE, AND NOT THE OBVIOUS ALTERNATIVES ──
--
-- The kiosk must answer one narrow question: who is attempting this interaction?
-- It must NOT answer "may they collect this child" — that stays with the
-- relationship graph and the safeguarding resolver, so possession of a code can
-- never become pickup authority.
--
-- A phone-number lookup was the obvious candidate and is rejected: typing a phone
-- number and being told whether it matches a family turns the lobby tablet into
-- an enumeration oracle for who attends this nursery. A surname or child-name
-- search is worse — it exposes a roster. A printed QR badge needs hardware the
-- product cannot assume.
--
-- A code the centre issues to a person is the smallest thing that identifies
-- without revealing: an attempt either resolves or it does not, and a failed
-- attempt discloses nothing about who exists. It is one new primitive, it rotates,
-- and it revokes.
--
-- ── IT IS AN IDENTIFIER, NOT A PERMISSION ──
--
-- The code resolves to `person_id` and stops. Everything downstream — which
-- children, in what capacity, under what restrictions — is read from
-- `person_child_relationships` and `child_safeguarding_restrictions` exactly as
-- it would be for any other channel. A stolen code therefore grants no authority
-- its holder did not already have on paper, and grants none at all over a child
-- the person has no relationship to.
CREATE TABLE IF NOT EXISTS public.person_kiosk_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,

    -- Never the code itself. Resolution hashes what was typed and selects by the
    -- digest, the same lookup shape the device credential and the public form
    -- links use.
    code_hash text NOT NULL,

    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    revoked_at timestamptz,
    revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    issued_at timestamptz NOT NULL DEFAULT now(),
    issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    rotated_at timestamptz,
    last_used_at timestamptz,

    CONSTRAINT ck_person_kiosk_code_revoked_has_timestamp
        CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

-- One ACTIVE code per person. A second live code for the same adult would make
-- "who is this" answerable two ways, and revoking one would look like revoking
-- access when it is not.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_kiosk_code_active_person
    ON public.person_kiosk_codes (org_id, person_id)
    WHERE status = 'active';

-- The resolution lookup. Unique across the deployment: a digest collision between
-- two orgs would make the tenancy boundary depend on row order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_kiosk_code_hash
    ON public.person_kiosk_codes (code_hash);

ALTER TABLE public.person_kiosk_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_kiosk_codes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.person_kiosk_codes FROM PUBLIC;
REVOKE ALL ON public.person_kiosk_codes FROM anon;
REVOKE ALL ON public.person_kiosk_codes FROM authenticated;

-- COLUMN-LEVEL, and `code_hash` is not on the list. An operator needs to know a
-- person HAS a code and when it was issued; nobody needs to read the digest.
GRANT SELECT (
    id, org_id, person_id, status, issued_at, rotated_at, revoked_at, last_used_at
) ON public.person_kiosk_codes TO authenticated;

DROP POLICY IF EXISTS person_kiosk_codes_select_org ON public.person_kiosk_codes;
CREATE POLICY person_kiosk_codes_select_org ON public.person_kiosk_codes
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS person_kiosk_codes_write_org ON public.person_kiosk_codes;
CREATE POLICY person_kiosk_codes_write_org ON public.person_kiosk_codes
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));

COMMENT ON TABLE public.person_kiosk_codes IS
    'Identifies WHO is at a kiosk, and nothing more. Resolves to person_id; every authority question is then read from the relationship graph and safeguarding restrictions as for any other channel, so possession of a code is never pickup authority. Chosen over a phone or name lookup because a failed attempt here discloses nothing about who attends the centre.';
COMMENT ON COLUMN public.person_kiosk_codes.code_hash IS
    'SHA-256 of the issued code. The code is never stored. Resolution selects BY this column rather than comparing in process.';
