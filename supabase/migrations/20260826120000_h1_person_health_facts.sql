-- =============================================================================
-- H1 — the canonical Health entity.
--
-- Per docs/platform/operator/health-foundation-h1-h4-contract.md: ONE entity with a
-- `fact_kind` discriminator, not three tables. Three tables would give the collection
-- resolver three shapes, three provider kinds and three correction lineages for what is
-- one idea — "a durable health fact about a person" — and immunization would still not
-- fit any of them.
--
-- WHAT THIS IS NOT
--
--   * not a second medical model: Enrollment/Forms collect, Processing/Trust interpret,
--     Documents hold evidence, Business Process owns requirements. This owns APPROVED
--     DURABLE TRUTH and nothing else.
--   * not requirement satisfaction: that is evaluated at read time, never stored.
--   * not a copy of provider/emergency relationships: those stay in Relationships.
--
-- NOTHING IS EVER DELETED. A correction writes a new row carrying `supersedes_id` and
-- closes the old row's `effective_to`; ending a fact sets `status = ended`. This mirrors
-- attendance's original | correction | reversal so the platform keeps ONE mental model
-- for safety-sensitive history — and, as with attendance, the database enforces it rather
-- than trusting every future caller to remember.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.person_health_facts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE RESTRICT,

    -- Polymorphic subject, exactly as `documents` already is. `customer_member` is the
    -- child grain the whole contract assumes (D-H1); `person` is admitted because a staff
    -- member's allergy is the same idea and must not need a second table.
    subject_entity_type text NOT NULL,
    subject_entity_id uuid NOT NULL,

    fact_kind text NOT NULL,

    -- Validated per kind against ORG CONFIGURATION, not against a code branch. A
    -- jurisdiction that requires a different vaccine series differs by configuration.
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,

    status text NOT NULL DEFAULT 'active',
    effective_from date,
    effective_to date,

    -- Provenance is REQUIRED, because a health fact with no answer to "who said so" cannot
    -- be safely acted on. `source_ref` points at the submission, document or action.
    source_kind text NOT NULL,
    source_ref text,

    confirmed_by uuid,
    confirmed_at timestamptz,

    -- Correction lineage. Self-referencing: the new row points BACK at what it replaces.
    supersedes_id uuid REFERENCES public.person_health_facts (id) ON DELETE RESTRICT,
    -- A medication points at the allergy or condition it treats. Deliberately NOT a
    -- payload field: it is a relationship between two facts, and burying it in jsonb would
    -- make "what treats this allergy" unqueryable.
    related_fact_id uuid REFERENCES public.person_health_facts (id) ON DELETE SET NULL,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT person_health_facts_subject_type_chk
        CHECK (subject_entity_type = ANY (ARRAY['customer_member'::text, 'person'::text])),
    CONSTRAINT person_health_facts_kind_chk
        CHECK (fact_kind = ANY (ARRAY[
            'allergy'::text, 'condition'::text, 'medication'::text, 'immunization'::text
        ])),
    CONSTRAINT person_health_facts_status_chk
        CHECK (status = ANY (ARRAY['active'::text, 'ended'::text, 'superseded'::text])),
    CONSTRAINT person_health_facts_source_kind_chk
        CHECK (source_kind = ANY (ARRAY[
            'form_submission'::text, 'document_extraction'::text, 'operator'::text, 'import'::text
        ])),
    CONSTRAINT person_health_facts_effective_range_chk
        CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
    -- A superseded or ended fact must say WHEN it stopped being true. Without this a closed
    -- row is indistinguishable from an active one to any date-filtered read.
    CONSTRAINT person_health_facts_closed_has_end_chk
        CHECK (status = 'active' OR effective_to IS NOT NULL),
    CONSTRAINT person_health_facts_no_self_supersede_chk
        CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_person_health_facts_subject
    ON public.person_health_facts (org_id, subject_entity_type, subject_entity_id);

-- The resolver's exact predicate: one subject's ACTIVE facts of one kind.
CREATE INDEX IF NOT EXISTS idx_person_health_facts_active_kind
    ON public.person_health_facts (org_id, subject_entity_id, fact_kind)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_person_health_facts_supersedes
    ON public.person_health_facts (supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_person_health_facts_related
    ON public.person_health_facts (related_fact_id)
    WHERE related_fact_id IS NOT NULL;

-- One row may be superseded by at most one successor. Without this, two concurrent
-- corrections both "replace" the same fact and the lineage forks with no way to say which
-- is current.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_health_facts_one_successor
    ON public.person_health_facts (supersedes_id)
    WHERE supersedes_id IS NOT NULL;

COMMENT ON TABLE public.person_health_facts IS
    'H1. Approved durable Health truth: allergy | condition | medication | immunization, one entity with a fact_kind discriminator. Append-only lineage — corrections supersede, never overwrite. Requirement satisfaction is NEVER stored here; it is evaluated at read time.';
COMMENT ON COLUMN public.person_health_facts.payload IS
    'Per-kind canonical payload, validated against org configuration. Immunization is ONE fact per vaccine with its dose series inside: { vaccine_key, doses: [{ administered_on, dose_number, source_ref }], history_state }. Exemption is NOT here — it is a Business Process requirement exception (D-H2).';
COMMENT ON COLUMN public.person_health_facts.related_fact_id IS
    'A medication points at the allergy/condition it treats. A relationship between facts, deliberately not a payload field.';

DROP TRIGGER IF EXISTS trg_person_health_facts_updated_at ON public.person_health_facts;
CREATE TRIGGER trg_person_health_facts_updated_at
    BEFORE UPDATE ON public.person_health_facts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Append-only enforcement, at the database.
--
-- Attendance taught this the expensive way: a fixture tried to delete history, the DB
-- refused, and the refusal cascaded into a half-removed graph. The lesson kept was that
-- the REFUSAL IS CORRECT and belongs here — not that callers should be careful.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_person_health_fact_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'person_health_facts is append-only: DELETE is not allowed for fact % — end it (status=ended) or supersede it with a correction',
            OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- The identity of a fact never changes. Its STATE may advance (active → ended /
    -- superseded) and its closing date may be set, because that is how a fact stops being
    -- true. Rewriting what it SAYS is a correction, and a correction is a new row.
    IF OLD.subject_entity_type IS DISTINCT FROM NEW.subject_entity_type
        OR OLD.subject_entity_id IS DISTINCT FROM NEW.subject_entity_id
        OR OLD.fact_kind IS DISTINCT FROM NEW.fact_kind
        OR OLD.payload IS DISTINCT FROM NEW.payload
        OR OLD.source_kind IS DISTINCT FROM NEW.source_kind
        OR OLD.supersedes_id IS DISTINCT FROM NEW.supersedes_id
    THEN
        RAISE EXCEPTION
            'health fact % is immutable: what a fact SAYS cannot change in place — write a correction carrying supersedes_id',
            OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- A closed fact never reopens. Reopening would make the history unreadable: the row
    -- would claim to be true again with no record of the interval in which it was not.
    IF OLD.status <> 'active' AND NEW.status = 'active' THEN
        RAISE EXCEPTION
            'health fact % is %; it cannot return to active — assert a new fact instead',
            OLD.id, OLD.status
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_person_health_facts_immutability ON public.person_health_facts;
CREATE TRIGGER trg_person_health_facts_immutability
    BEFORE UPDATE OR DELETE ON public.person_health_facts
    FOR EACH ROW EXECUTE FUNCTION public.enforce_person_health_fact_immutability();

-- -----------------------------------------------------------------------------
-- RLS — same-org, matching the platform's established shape.
--
-- NOTE, deliberately recorded here: this grants org members access to health facts on the
-- same terms as every other org-scoped table. A HEALTH-SPECIFIC visibility permission
-- (D-H6) does not exist yet — the permission catalogue holds 57 keys and none is health.
-- Until D-H6 lands, no surface may present these rows to a wider audience than already
-- sees `child.allergies`, and Safety Signals must not ship at all.
-- -----------------------------------------------------------------------------
ALTER TABLE public.person_health_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_health_facts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.person_health_facts FROM PUBLIC;
REVOKE ALL ON public.person_health_facts FROM anon;
-- Default privileges grant ALL at CREATE TABLE; REVOKE before GRANT or `authenticated`
-- keeps write access nothing here asked for.
REVOKE ALL ON public.person_health_facts FROM authenticated;
GRANT SELECT ON public.person_health_facts TO authenticated;
GRANT ALL ON public.person_health_facts TO service_role;

DROP POLICY IF EXISTS person_health_facts_same_org_select ON public.person_health_facts;
CREATE POLICY person_health_facts_same_org_select ON public.person_health_facts
    FOR SELECT TO authenticated
    USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS person_health_facts_service_role_all ON public.person_health_facts;
CREATE POLICY person_health_facts_service_role_all ON public.person_health_facts
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
