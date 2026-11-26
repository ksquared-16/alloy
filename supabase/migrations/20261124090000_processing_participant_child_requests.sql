-- A FAMILY TELLS THE SCHOOL ABOUT A NEW CHILD — a Processing source, never a child.
--
-- Director-authorized (Enrollment V0.5, Document & Processing Convergence): an authorized participant
-- may tell the school about a child it does not know yet, from the family view. That statement is a
-- SOURCE for the canonical Processing authority, exactly like a form submission or a document: the
-- Processing Case references it, the operator reviews / corrects / rejects / commits it, and only the
-- Processing new-child commit (`addChild`, identity-safe) ever creates the child.
--
-- Why a new source kind, and why its own row:
--   * no existing kind fits — `form_submission` / `form_packet_session` are Forms-owned records of a
--     published form, `create_lead` is operator intake, `document`/`upload`/`import` are files;
--   * a Processing Case "references sources; it never absorbs source data", so the participant's
--     words need an owning row the case can point at (`processing_case_sources.source_id`).
--
-- This migration therefore does exactly two things:
--   1. `processing_participant_child_requests` — the participant's statement (who asked, which
--      household, the child's name and date of birth) and its Processing outcome;
--   2. `chk_pcs_source_kind` gains `participant_child_request`. Every historical value is preserved;
--      the constraint stays a closed list (never arbitrary text).
--
-- Idempotent and replay-safe: IF NOT EXISTS everywhere, constraint DROP IF EXISTS + ADD, policies
-- DROP IF EXISTS + CREATE. Additive only — nothing existing is altered or removed.

CREATE TABLE IF NOT EXISTS public.processing_participant_child_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    -- The household the participant is authorized for; the child can only ever be created here.
    customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
    -- The family's Enrollment episode the request was made from (the Enrollment request target).
    opportunity_id uuid REFERENCES public.opportunities (id) ON DELETE SET NULL,
    -- The authorized participant who made the statement (the access link's recipient).
    requested_by_person_id uuid REFERENCES public.persons (id) ON DELETE SET NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    date_of_birth date NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    -- Set by the Processing commit: the one canonical child this request became.
    customer_member_id uuid REFERENCES public.customer_members (id) ON DELETE SET NULL,
    -- The commit claim: one operator commit at a time (an atomic compare-and-set on this row).
    commit_claimed_at timestamptz,
    commit_claimed_by uuid,
    decided_at timestamptz,
    decided_by uuid,
    decision_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_ppcr_status CHECK (status = ANY (ARRAY['pending'::text, 'committed'::text, 'declined'::text])),
    CONSTRAINT chk_ppcr_first_name CHECK (btrim(first_name) <> ''),
    CONSTRAINT chk_ppcr_last_name CHECK (btrim(last_name) <> ''),
    CONSTRAINT chk_ppcr_committed_child CHECK (status <> 'committed' OR customer_member_id IS NOT NULL)
);

-- A family asking twice for the same child while the first is still with the school is one request.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppcr_one_pending_per_child
    ON public.processing_participant_child_requests (
        org_id, customer_id, lower(btrim(first_name)), lower(btrim(last_name)), date_of_birth
    )
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ppcr_org_customer
    ON public.processing_participant_child_requests (org_id, customer_id);

COMMENT ON TABLE public.processing_participant_child_requests IS
    'A participant''s statement about a new child (family view). A Processing source (source_kind participant_child_request): reviewed and committed only through the Processing new-child commit.';

-- RLS — a new public table without it grants `authenticated` a default SELECT. Operators read
-- through the server; the participant never reads this table directly.
ALTER TABLE public.processing_participant_child_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS processing_participant_child_requests_org_select ON public.processing_participant_child_requests;
CREATE POLICY processing_participant_child_requests_org_select ON public.processing_participant_child_requests
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS processing_participant_child_requests_service ON public.processing_participant_child_requests;
CREATE POLICY processing_participant_child_requests_service ON public.processing_participant_child_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The source taxonomy: every historical value, plus the participant's child request.
ALTER TABLE public.processing_case_sources
    DROP CONSTRAINT IF EXISTS chk_pcs_source_kind;

ALTER TABLE public.processing_case_sources
    ADD CONSTRAINT chk_pcs_source_kind CHECK (
        source_kind = ANY (ARRAY[
            'form_submission'::text,
            'form_packet_session'::text,
            'document'::text,
            'upload'::text,
            'email_attachment'::text,
            'import'::text,
            'recreated_document'::text,
            'create_lead'::text,
            'participant_child_request'::text
        ])
    );

COMMENT ON COLUMN public.processing_case_sources.source_kind IS
    'Polymorphic source taxonomy. create_lead = Manual Create Lead operator intake (D4). participant_child_request = a family''s new-child statement (processing_participant_child_requests).';
