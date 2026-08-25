-- =============================================================================
-- Safeguarding V1 — the canonical owner of "what is currently forbidden"
-- =============================================================================
-- Alloy could say who a person IS to a child (`person_child_relationships`). It could not say what
-- is currently RESTRICTED. `custody_notes` looked like the answer — free text on one relationship
-- edge — which is why the gap was invisible: it reads as coverage while carrying nothing an
-- operational decision can consult.
--
-- A restriction is NOT a negative relationship. An `authorized_pickup` relationship and an active
-- "may not pick up" restriction may both be true at once; the restriction constrains the action, it
-- does not delete the relationship. Modelling it as `prohibited_pickup` would lose that, and would
-- make revoking a restriction indistinguishable from deleting a family tie.
--
-- Scope is what the real enrollment packet proves and nothing more. This is not case management,
-- not an incident log, and not a child-welfare ontology.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.child_safeguarding_restrictions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,

    -- SUBJECT: always the child. A restriction protects a child, so the child is the grain even
    -- when the restriction is "about" an adult.
    customer_member_id uuid NOT NULL REFERENCES public.customer_members(id) ON DELETE CASCADE,

    -- AFFECTED PARTY: nullable on purpose. "There is a custody arrangement" is a real restriction
    -- with no single named person; forcing one would invent a fact the family did not state.
    affected_person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL,
    -- When the family named someone Alloy has no person record for yet.
    affected_party_description text,

    restriction_kind text NOT NULL CHECK (restriction_kind IN (
        'custody_restriction',
        'protective_or_restraining_order',
        'pickup_or_contact_restriction'
    )),

    -- WHAT IT DOES. Separate from the kind: a restraining order and a custody arrangement can have
    -- the same operational effect, and the same kind can have different effects in two families.
    operational_effect text NOT NULL CHECK (operational_effect IN (
        'may_not_pick_up',
        'contact_restricted',
        'informational_only'
    )),

    -- LIFECYCLE. `proposed` is the arrival state: nothing a parent typed or a document said is
    -- active until it is approved. See review_state below.
    status text NOT NULL DEFAULT 'proposed' CHECK (status IN (
        'proposed', 'active', 'expired', 'superseded', 'revoked'
    )),
    effective_from date,
    effective_to date,

    -- EVIDENCE. Documents owns the artifact; this references it and never copies its content.
    -- `evidence_basis` is REQUIRED so that "a restriction with no document attached" stays
    -- distinguishable from "no restriction" and from "a restriction backed by a court order".
    evidence_basis text NOT NULL CHECK (evidence_basis IN (
        'document', 'parent_declaration', 'operator_entry'
    )),
    evidence_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,

    -- PROVENANCE. Where the assertion came from, kept distinct from who approved it.
    source text NOT NULL CHECK (source IN (
        'enrollment_form', 'processing_case', 'operator'
    )),
    source_reference text,

    -- APPROVAL. A restriction is a safety control; participant free text and document extraction
    -- must never activate one on their own.
    review_state text NOT NULL DEFAULT 'pending_review' CHECK (review_state IN (
        'pending_review', 'approved', 'rejected'
    )),
    reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    review_note text,

    -- HISTORY. A restriction is never edited in place — a change supersedes the prior row, so the
    -- state on any past date remains answerable.
    supersedes_id uuid REFERENCES public.child_safeguarding_restrictions(id) ON DELETE SET NULL,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz,

    -- Only an APPROVED restriction may be active. The database enforces it so no code path can
    -- activate an unreviewed assertion.
    CONSTRAINT ck_safeguarding_active_requires_approval
        CHECK (status <> 'active' OR review_state = 'approved'),
    -- A document basis must name the document.
    CONSTRAINT ck_safeguarding_document_basis
        CHECK (evidence_basis <> 'document' OR evidence_document_id IS NOT NULL),
    CONSTRAINT ck_safeguarding_effective_range
        CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_child_safeguarding_org_member
    ON public.child_safeguarding_restrictions (org_id, customer_member_id);
CREATE INDEX IF NOT EXISTS idx_child_safeguarding_org_person
    ON public.child_safeguarding_restrictions (org_id, affected_person_id)
    WHERE affected_person_id IS NOT NULL;
-- The operational read: what is active on this child right now.
CREATE INDEX IF NOT EXISTS idx_child_safeguarding_active
    ON public.child_safeguarding_restrictions (org_id, customer_member_id, status)
    WHERE status = 'active';

ALTER TABLE public.child_safeguarding_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_safeguarding_restrictions FORCE ROW LEVEL SECURITY;

-- The `postgres` role's default ACL grants ALL at CREATE TABLE, and a GRANT never removes anything.
-- Revoke before granting, or this table ships writable by every authenticated user.
REVOKE ALL ON public.child_safeguarding_restrictions FROM PUBLIC;
REVOKE ALL ON public.child_safeguarding_restrictions FROM anon;
REVOKE ALL ON public.child_safeguarding_restrictions FROM authenticated;
GRANT SELECT ON public.child_safeguarding_restrictions TO authenticated;

-- Reading a safeguarding restriction is NARROWER than reading a relationship. The comparable table
-- `person_child_relationships` admits owner/admin/ops/manager; a child's protective order must not
-- read like ordinary profile content, so `manager` is not on this list. Writes are narrower still:
-- activation is an approval, and the CHECK constraint above already forbids activating an
-- unreviewed row whatever the caller's role.
DROP POLICY IF EXISTS child_safeguarding_select_org ON public.child_safeguarding_restrictions;
CREATE POLICY child_safeguarding_select_org ON public.child_safeguarding_restrictions
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS child_safeguarding_write_org ON public.child_safeguarding_restrictions;
CREATE POLICY child_safeguarding_write_org ON public.child_safeguarding_restrictions
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']));

COMMENT ON TABLE public.child_safeguarding_restrictions IS
    'Canonical owner of active restrictions on a child. NOT a negative relationship: an authorized_pickup relationship and an active may_not_pick_up restriction may coexist, and the restriction constrains the action.';

-- The access boundary, registered in the canonical permission catalog.
INSERT INTO public.permission_definitions (key, group_key, label, description, is_active, updated_at)
VALUES
    ('crm.customers.safeguarding.view', 'crm', 'View safeguarding restrictions',
     'See custody, protective-order and pickup restrictions recorded on a child.', true, now()),
    ('crm.customers.safeguarding.manage', 'crm', 'Manage safeguarding restrictions',
     'Approve, activate, supersede or revoke a safeguarding restriction on a child.', true, now())
ON CONFLICT (key) DO UPDATE SET
    group_key = EXCLUDED.group_key,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();
