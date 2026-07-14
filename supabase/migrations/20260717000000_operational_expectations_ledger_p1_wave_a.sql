-- =============================================================================
-- Operational Expectations — P1 · Wave A: Authored Expectation Ledger (substrate)
-- =============================================================================
-- The extensional, append-only, bitemporal, lineage-tracked store of Expectation
-- ASSERTIONS — the TWIN of the Operational Facts ledger, same substrate, opposite
-- semantics. A Fact WITNESSES observed reality ("what IS"); an Expectation ASSERTS
-- intended reality ("what SHOULD / WILL be"). Facts are corrected; Expectations
-- are revised.
--
-- An Expectation IS the tuple
--   ⟨ Authority · Modality · Subject(s) · Condition · Temporal Frame · [Beneficiary] ⟩.
--
-- SCOPE (Wave A — substrate ONLY):
--   - This migration stands up the LEDGER TABLE with the substrate primitives:
--     append-only (prevent-mutation trigger, no updated_at), bitemporal
--     (valid_from vs authored_at), lineage (supersedes self-FK + no-self-ref +
--     create-vs-supersede link shape), org scope + RLS, and CLOSED-vocabulary
--     CHECKs (modality=5, verb=5, transition=4, standing=3).
--   - It does NOT implement authoring intake / the write path (Wave B), the
--     Authority→Standing resolution gate (Wave C), or Revision≠Correction
--     PROPAGATION behavior (Wave D). It stores well-formed authored tuples; it
--     never evaluates a Condition, derives a judgment/gap, or invokes anything.
--   - It never writes a Fact and never selects a response.
--
-- Doctrine (frozen):
--   docs/platform/operational-expectations-system-design.md (§0, §5, §12, §A),
--   docs/platform/milestones/operational-expectations-engineering-realization.md (§13 P1),
--   docs/platform/milestones/operational-expectations-p1-wave-a-ledger-substrate.md.
--
-- Pattern reference (proven conformer): child_attendance_events
--   (supabase/migrations/20260629120000_childcare_attendance_facts_p2.sql).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.operational_expectations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,

    -- Authority facet — the declared authority under which the tuple is asserted.
    -- (Authority→Standing RESOLUTION and the authoring gate are Wave C; this stores
    -- the declared authority + author class for the audit log.)
    authority_key text NOT NULL,
    author_class text NOT NULL,

    -- Modality facet — CLOSED set of five (no sixth; a sixth is an architecture
    -- escalation, not a value).
    modality text NOT NULL,

    -- Subject(s) facet — durable business-subject reference(s); never a fact-row id.
    subject_kind text NOT NULL,
    subject_ref jsonb NOT NULL,

    -- Condition facet — a predicate over reality, authored against an Expectation
    -- Type that fixes the predicate shape. Parameters only, never a sensor
    -- reference (the measurable binding is Config, below the semantic line — P2).
    condition jsonb NOT NULL,

    -- Temporal Frame facet — REQUIRED presence; the valid-time window asserted.
    temporal_frame jsonb NOT NULL,

    -- Beneficiary facet — optional (e.g. the wronged beneficiary of a committed breach).
    beneficiary jsonb,

    -- Authoring verb — the five acts; the ONLY writes to the ledger. There is no
    -- fulfill/complete/close verb (Law 3).
    verb text NOT NULL,

    -- Typed supersession/transition on lineage. NULL for a `create`; exactly one
    -- transition type for every superseding act. Revision≠Correction is
    -- load-bearing — consumers branch on it (Wave D wires the propagation).
    transition_type text,

    -- Lineage — supersede-by-reference (never mutate). The prior row this act
    -- supersedes, and the root of the lineage chain (a `create` roots itself).
    supersedes_expectation_id uuid REFERENCES public.operational_expectations (id) ON DELETE RESTRICT,
    lineage_root_id uuid REFERENCES public.operational_expectations (id) ON DELETE RESTRICT,

    -- Standing — MEANING (Law 6), not a workflow status. Held here; resolved by
    -- the intake gate in Wave C. `predicted` may stand at `model` standing.
    standing text NOT NULL,

    -- Dependency footprint — the fact-types × subject set × window that can change
    -- this expectation's verdict. Declared here; the index + incremental eval it
    -- feeds are Processing (P4).
    footprint jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Bitemporal — valid/effective time (the frame asserted, author-supplied) vs
    -- recorded/transaction time (server-assigned in the BEFORE INSERT trigger,
    -- never client-forgeable; immutable via append-only).
    valid_from timestamptz NOT NULL,
    valid_to timestamptz,
    authored_at timestamptz NOT NULL DEFAULT now(),

    -- Config version-at-authoring — RESERVED STRUCTURAL PROVENANCE (nullable). It
    -- records, WHEN AVAILABLE, the config version a tuple was authored against, for
    -- later replay (P4) reading config version-at-authoring. Wave A only STORES it:
    -- there is no FK to any (unimplemented) P2 config structure, no config lookup,
    -- and no replay capability. Storage exists; resolution behavior does not.
    config_version_ref jsonb,

    -- Audit / attribution — the ledger IS the audit log (actor · authority ·
    -- standing · transaction-time).
    authored_by_user_id uuid,
    authored_by_label text,

    schema_version integer NOT NULL DEFAULT 1,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- append-only: authored_at only, NO updated_at (rows are never modified).
    created_by uuid,

    -- Closed modality set (five) — a sixth is forbidden at the storage layer.
    CONSTRAINT operational_expectations_modality_check
        CHECK (modality = ANY (ARRAY[
            'required'::text,
            'prohibited'::text,
            'intended'::text,
            'committed'::text,
            'predicted'::text
        ])),
    -- Five authoring verbs.
    CONSTRAINT operational_expectations_verb_check
        CHECK (verb = ANY (ARRAY[
            'create'::text,
            'revise'::text,
            'correct'::text,
            'replace'::text,
            'cancel'::text
        ])),
    -- Four transition types (NULL allowed only for a `create`; see link shape).
    CONSTRAINT operational_expectations_transition_type_check
        CHECK (transition_type IS NULL OR transition_type = ANY (ARRAY[
            'revision'::text,
            'correction'::text,
            'cancellation'::text,
            'replacement'::text
        ])),
    -- Three standings.
    CONSTRAINT operational_expectations_standing_check
        CHECK (standing = ANY (ARRAY['proposed'::text, 'binding'::text, 'model'::text])),
    -- Author classes.
    CONSTRAINT operational_expectations_author_class_check
        CHECK (author_class = ANY (ARRAY[
            'human'::text, 'policy'::text, 'process'::text, 'ai'::text, 'external'::text
        ])),
    -- Create-vs-supersede link shape: a `create` opens a lineage (no prior row, no
    -- transition); every other verb supersedes a prior row with a transition type.
    CONSTRAINT operational_expectations_create_link_shape CHECK (
        (verb = 'create'
            AND supersedes_expectation_id IS NULL
            AND transition_type IS NULL)
        OR (verb <> 'create'
            AND supersedes_expectation_id IS NOT NULL
            AND transition_type IS NOT NULL)
    ),
    -- Canonical verb→transition map (revise↔revision, correct↔correction,
    -- replace↔replacement, cancel↔cancellation). A `create` has no transition.
    CONSTRAINT operational_expectations_verb_transition_map CHECK (
        (verb = 'create'  AND transition_type IS NULL)
        OR (verb = 'revise'  AND transition_type = 'revision')
        OR (verb = 'correct' AND transition_type = 'correction')
        OR (verb = 'replace' AND transition_type = 'replacement')
        OR (verb = 'cancel'  AND transition_type = 'cancellation')
    ),
    -- A row may not supersede itself (defense-in-depth; id is server-set).
    CONSTRAINT operational_expectations_no_self_reference
        CHECK (supersedes_expectation_id IS NULL OR supersedes_expectation_id <> id),
    -- Temporal Frame presence — the frame is required (non-empty object).
    CONSTRAINT operational_expectations_temporal_frame_present
        CHECK (jsonb_typeof(temporal_frame) = 'object' AND temporal_frame <> '{}'::jsonb),
    -- Subject reference presence — a governed subject is required.
    CONSTRAINT operational_expectations_subject_ref_present
        CHECK (subject_ref IS NOT NULL AND subject_ref <> 'null'::jsonb),
    -- Valid-time window well-formed.
    CONSTRAINT operational_expectations_valid_window
        CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

COMMENT ON TABLE public.operational_expectations IS
    'Authored Expectation ledger (P1 Wave A). Append-only, bitemporal, lineage-tracked store of expectation ASSERTIONS — the twin of Operational Facts with opposite semantics. Superseding acts (revise/correct/replace/cancel) are NEW rows referencing supersedes_expectation_id; rows are never updated/deleted. Substrate only: no authoring intake, no evaluation, no gaps, no effectors.';

COMMENT ON COLUMN public.operational_expectations.modality IS
    'Closed set of five: required | prohibited | intended | committed | predicted. A sixth is an architecture escalation, not a value.';
COMMENT ON COLUMN public.operational_expectations.verb IS
    'Authoring verb: create | revise | correct | replace | cancel. No fulfill/complete/close verb (Law 3).';
COMMENT ON COLUMN public.operational_expectations.transition_type IS
    'Typed supersession: revision | correction | cancellation | replacement. NULL for a create. Revision≠Correction is load-bearing (consumers branch on it).';
COMMENT ON COLUMN public.operational_expectations.supersedes_expectation_id IS
    'The prior expectation this act supersedes. Supersede-by-reference, never by mutation; the prior row remains in history.';
COMMENT ON COLUMN public.operational_expectations.standing IS
    'proposed | binding | model. Standing is meaning (Law 6). Resolved by the intake gate (Wave C); held here.';
COMMENT ON COLUMN public.operational_expectations.footprint IS
    'Declared dependency footprint (fact-types × subject set × window) handed to Processing (P4) for incremental evaluation.';
COMMENT ON COLUMN public.operational_expectations.valid_from IS
    'Bitemporal valid-time start (the frame asserted), distinct from authored_at (transaction-time).';
COMMENT ON COLUMN public.operational_expectations.authored_at IS
    'Recorded/transaction time — SERVER-ASSIGNED in the BEFORE INSERT trigger (never client-forgeable) and immutable (append-only, no updated_at). Distinct from valid_from (author-supplied effective time).';
COMMENT ON COLUMN public.operational_expectations.config_version_ref IS
    'RESERVED structural provenance (nullable). Records the config version-at-authoring WHEN available, for later replay (P4). No FK, no config resolution, no replay in Wave A — storage only.';

CREATE INDEX IF NOT EXISTS idx_operational_expectations_org_subject_valid
    ON public.operational_expectations (org_id, subject_kind, valid_from);
CREATE INDEX IF NOT EXISTS idx_operational_expectations_org_modality_valid
    ON public.operational_expectations (org_id, modality, valid_from);
CREATE INDEX IF NOT EXISTS idx_operational_expectations_supersedes
    ON public.operational_expectations (org_id, supersedes_expectation_id)
    WHERE supersedes_expectation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operational_expectations_lineage_root
    ON public.operational_expectations (org_id, lineage_root_id);

-- -----------------------------------------------------------------------------
-- Append-only enforcement: block UPDATE and DELETE for ALL roles. Revisions and
-- corrections are NEW rows referencing supersedes_expectation_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_operational_expectations_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'operational_expectations is append-only: % is not allowed. Author a revise/correct/replace/cancel act (a new row) instead.', TG_OP
        USING ERRCODE = '0A000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_operational_expectations_mutation ON public.operational_expectations;
CREATE TRIGGER trg_prevent_operational_expectations_mutation
    BEFORE UPDATE OR DELETE ON public.operational_expectations
    FOR EACH ROW EXECUTE FUNCTION public.prevent_operational_expectations_mutation();

-- -----------------------------------------------------------------------------
-- Structural consistency (substrate-level only — NOT the authoring gate). The
-- Authority→Standing resolution and grammar/semantic-line enforcement are the
-- authoring intake's job (Wave B/C). Here we only keep lineage coherent:
--   - a supersession target must be a prior row on the SAME org;
--   - lineage_root defaults to the target's root (or self for a create).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_operational_expectations_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    prior_org uuid;
    prior_root uuid;
BEGIN
    -- Recorded (transaction) time is ALWAYS server-assigned — a caller may not
    -- forge it. Valid/effective time (valid_from) is separate and author-supplied.
    -- Immutability is guaranteed by the append-only trigger (no UPDATE).
    NEW.authored_at := now();

    IF NEW.verb = 'create' THEN
        -- A create roots its own lineage.
        IF NEW.lineage_root_id IS NULL THEN
            NEW.lineage_root_id := NEW.id;
        ELSIF NEW.lineage_root_id <> NEW.id THEN
            RAISE EXCEPTION 'operational_expectations: a create must root its own lineage' USING ERRCODE = '23514';
        END IF;
    ELSE
        SELECT e.org_id, e.lineage_root_id
        INTO prior_org, prior_root
        FROM public.operational_expectations e
        WHERE e.id = NEW.supersedes_expectation_id;

        IF prior_org IS NULL THEN
            RAISE EXCEPTION 'operational_expectations: supersedes_expectation_id % not found', NEW.supersedes_expectation_id
                USING ERRCODE = '23503';
        END IF;
        IF prior_org <> NEW.org_id THEN
            RAISE EXCEPTION 'operational_expectations: supersession must target a row on the same org' USING ERRCODE = '23514';
        END IF;
        -- Inherit the lineage root; default it when not supplied.
        IF NEW.lineage_root_id IS NULL THEN
            NEW.lineage_root_id := COALESCE(prior_root, NEW.supersedes_expectation_id);
        ELSIF NEW.lineage_root_id <> COALESCE(prior_root, NEW.supersedes_expectation_id) THEN
            RAISE EXCEPTION 'operational_expectations: lineage_root_id must match the superseded row''s root' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_operational_expectations_lineage ON public.operational_expectations;
CREATE TRIGGER trg_validate_operational_expectations_lineage
    BEFORE INSERT ON public.operational_expectations
    FOR EACH ROW EXECUTE FUNCTION public.validate_operational_expectations_lineage();

-- -----------------------------------------------------------------------------
-- RLS + WRITE BOUNDARY (Wave A posture).
--
-- Wave A is the STORAGE substrate. It deliberately exposes NO client-facing
-- authoring path: the sole supported authoring interface is the Wave B intake
-- (which will run server-side and, from Wave C, enforce Authority→Standing).
-- Therefore:
--   - `authenticated` gets SELECT only (org-scoped) — NO INSERT grant, NO INSERT
--     policy. An ordinary application caller CANNOT author directly.
--   - `anon` gets nothing (no grant, no policy).
--   - UPDATE/DELETE are ungranted AND trigger-blocked (append-only).
--   - `service_role` may insert as INFRASTRUCTURE (RLS-bypassing). This is NOT the
--     product authoring contract — it is the privileged channel the Wave B intake
--     will run behind. No ordinary role reaches it.
-- The coarse org gate here is tenant read protection; the Authority→Standing
-- authoring gate is Wave C application logic, not RLS.
-- -----------------------------------------------------------------------------
ALTER TABLE public.operational_expectations ENABLE ROW LEVEL SECURITY;

-- Read: org-scoped, authenticated tenant members only.
DROP POLICY IF EXISTS operational_expectations_select_org ON public.operational_expectations;
CREATE POLICY operational_expectations_select_org
    ON public.operational_expectations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = operational_expectations.org_id
        )
    );

-- Deliberately NO `authenticated`/`anon` INSERT policy: direct client authoring
-- is not a Wave A capability. Writes arrive only through the Wave B intake behind
-- service infrastructure. (Any future intake RPC/definer function is Wave B.)

-- Infrastructure only: service_role (RLS-bypassing) — the privileged channel the
-- Wave B intake runs behind, never a product-facing authoring surface.
DROP POLICY IF EXISTS operational_expectations_service_all ON public.operational_expectations;
CREATE POLICY operational_expectations_service_all
    ON public.operational_expectations
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

-- SELECT only for authenticated (NO INSERT). service_role holds infrastructure ALL.
GRANT SELECT ON TABLE public.operational_expectations TO authenticated;
GRANT ALL ON TABLE public.operational_expectations TO service_role;
