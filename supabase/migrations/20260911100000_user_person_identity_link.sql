-- =============================================================================
-- The canonical bridge between an authenticated user and the person they are
-- =============================================================================
-- Thread 6, Slice 1. Attendance authorization is keyed on `auth.users.id`.
-- Staff operational assignments are keyed on `persons.id`. Nothing in this
-- schema joined the two: a query for public tables carrying `person_id`
-- intersected with those carrying `user_id` returned the empty set, and no code
-- anywhere resolved "who is the logged-in human" to a Person. Staff presence
-- takes a `person_id` as an INPUT — an operator names the staff member, because
-- staff have never been able to name themselves.
--
-- Without this, assignment-scoped teacher authority is unimplementable: the
-- session knows a user, the assignment knows a person, and the gap between them
-- is where the authority decision has to happen.
--
-- ── WHY A LINK TABLE AND NOT `persons.user_id` ──
--
-- `persons` is canonical human identity and it long predates anyone having an
-- account; most persons in an org are children and families who will never have
-- one. Authentication identity is a different concern with its own lifecycle —
-- a link is granted, and later revoked, by someone, at a time, for a reason.
-- A nullable column on `persons` can record none of that, and it would make
-- every future change to how humans authenticate a change to the Person model.
--
-- ── WHAT THIS IS NOT ──
--
-- Not an identity provider, not an invitation system, not account lifecycle, and
-- emphatically not customer/parent authentication — that remains unsolved and
-- out of scope. This links an EXISTING authenticated user to an EXISTING person.
-- It is deliberately the smallest thing that lets a server answer one question:
-- which person is this session?
--
-- ── IDENTITY IS NEVER INFERRED ──
--
-- The tempting shortcut is `persons.email = auth.users.email`. It is refused
-- here and must stay refused. Email is mutable, is unique by no constraint in
-- this schema, and is shared in practice — two guardians on one address, a
-- shared centre inbox. A silent mismatch either locks out a real teacher or
-- hands one teacher another person's assignments, and neither failure announces
-- itself. Linking is an explicit, recorded, revocable act or it does not happen.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_person_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

    -- The authenticated identity. ON DELETE CASCADE: an account that no longer
    -- exists cannot resolve to anybody, and keeping the row would leave a link
    -- pointing at nothing that a future reader might treat as meaningful.
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- The human. RESTRICT rather than CASCADE: a person carrying live links is
    -- one an operator must deal with deliberately, not lose as a side effect.
    person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,

    -- Lifecycle, not a soft delete. A revoked link is evidence that this user
    -- WAS this person for a period, which is exactly what an audit of past
    -- attendance provenance needs to reconstruct.
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),

    linked_at timestamptz NOT NULL DEFAULT now(),
    linked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at timestamptz,
    revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Why, in the operator's words. An identity decision with no recorded reason
    -- is one nobody can review later.
    note text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz,

    -- Revocation must be legible in the row rather than inferred from a missing
    -- date, the same shape the kiosk device registry uses.
    CONSTRAINT ck_user_person_link_revoked_has_timestamp
        CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

-- ── CARDINALITY, ENFORCED BY THE DATABASE RATHER THAN BY CAREFUL CALLERS ──
--
-- One ACTIVE person per user per org, and one ACTIVE user per person per org.
-- Both directions matter and they fail differently: without the first, one login
-- resolves to two people and "who is this session" has two answers; without the
-- second, two logins both claim one teacher's assignments and revoking one
-- changes nothing. Partial indexes so revoked history accumulates freely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_person_link_active_user
    ON public.user_person_links (org_id, user_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_person_link_active_person
    ON public.user_person_links (org_id, person_id)
    WHERE status = 'active';

-- The resolution lookup: session user + org, active only.
CREATE INDEX IF NOT EXISTS idx_user_person_link_lookup
    ON public.user_person_links (org_id, user_id, status);

/*
 * TENANCY IS A DATABASE INVARIANT HERE, NOT A CALLER'S PROMISE.
 *
 * `org_id` on this row and `persons.org_id` could disagree, and if they did the
 * link would resolve a user in org A to a person in org B — a cross-tenant
 * identity, which is the worst failure this table could have. The FK cannot
 * express it because it is a cross-row condition, so a trigger does.
 */
CREATE OR REPLACE FUNCTION public.assert_user_person_link_same_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_person_org uuid;
BEGIN
    SELECT p.org_id INTO v_person_org FROM public.persons p WHERE p.id = NEW.person_id;
    IF v_person_org IS NULL THEN
        RAISE EXCEPTION 'user_person_links: person % does not exist', NEW.person_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_person_org <> NEW.org_id THEN
        RAISE EXCEPTION 'user_person_links: person % belongs to org %, not %',
            NEW.person_id, v_person_org, NEW.org_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_person_link_same_org ON public.user_person_links;
CREATE TRIGGER trg_user_person_link_same_org
    BEFORE INSERT OR UPDATE OF org_id, person_id ON public.user_person_links
    FOR EACH ROW EXECUTE FUNCTION public.assert_user_person_link_same_org();

DROP TRIGGER IF EXISTS set_user_person_links_updated_at ON public.user_person_links;
CREATE TRIGGER set_user_person_links_updated_at
    BEFORE UPDATE ON public.user_person_links
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_person_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_person_links FORCE ROW LEVEL SECURITY;

-- CREATE TABLE leaves the default ACL granting ALL, and a GRANT never removes
-- anything. Revoke first or this ships writable by every authenticated user.
REVOKE ALL ON public.user_person_links FROM PUBLIC;
REVOKE ALL ON public.user_person_links FROM anon;
REVOKE ALL ON public.user_person_links FROM authenticated;
GRANT SELECT ON public.user_person_links TO authenticated;

-- Reading who is linked is administrative visibility, not a secret. Creating and
-- revoking a link decides whose assignments a login inherits, so it is owner and
-- admin only — `ops` runs the day, it does not decide identity.
DROP POLICY IF EXISTS user_person_links_select_org ON public.user_person_links;
CREATE POLICY user_person_links_select_org ON public.user_person_links
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS user_person_links_write_org ON public.user_person_links;
CREATE POLICY user_person_links_write_org ON public.user_person_links
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));

COMMENT ON TABLE public.user_person_links IS
    'The canonical bridge between an authenticated Alloy user and the person that human IS. Attendance authorization is keyed on auth.users.id while staff operational assignments are keyed on persons.id, and nothing joined them. Identity is never inferred from email, phone, name or employee number — mutable attributes cannot carry an authority decision. A link is an explicit, recorded, revocable act.';
COMMENT ON COLUMN public.user_person_links.status IS
    'active or revoked. Revocation is lifecycle, never a soft delete: a revoked row is the evidence that this user WAS this person for a period, which is what reconstructing past provenance requires.';
COMMENT ON COLUMN public.user_person_links.person_id IS
    'The canonical person. ON DELETE RESTRICT so a person carrying live links must be dealt with deliberately rather than lost as a side effect.';
