/**
 * Operational Expectation Ledger Contract (P1 · Wave A — Ledger Substrate).
 *
 * The domain-neutral specification the AUTHORED Operational Expectation ledger
 * must satisfy — the TWIN of the Operational Fact Contract (factContract.ts),
 * with the SAME substrate (identity / lineage / replay / bitemporal) and the
 * OPPOSITE semantics: Facts WITNESS observed reality and are corrected; an
 * Expectation ASSERTS intended reality ("what SHOULD / WILL be") and is revised.
 *
 * This is a CONTRACT (invariants + interface + a conformance harness in
 * expectationLedgerConformance.ts), NOT a base class and NOT a shared table.
 * The `operational_expectations` table conforms to it.
 *
 * SCOPE — Wave A establishes the SUBSTRATE only: the tuple grammar type, the
 * closed vocabularies, and the storage-half invariants (append-only, bitemporal,
 * lineage, org-scope, modality/verb/transition closure). It carries NO authoring
 * intake, NO Authority→Standing resolution, NO evaluation/judgment/gap, NO
 * effector, NO consumer. Those land in later P1 waves and downstream packages.
 *
 * The generic append-only / bitemporal / org-scoped / lineage substrate is NOT
 * re-declared here — it is the shared, platform-owned
 * `AppendOnlyLedgerDescriptor` (operationalLedger/ledgerSubstrateContract.ts)
 * that Facts and Expectations both extend. This file adds ONLY the authored-
 * ledger extensions (modality / verb / transition / standing / tuple grammar /
 * footprint) that genuinely differ from the observed ledger.
 *
 * Authority (frozen, do not reinterpret):
 *   - System design §0 / §5 / §12 — tuple grammar, five verbs, closed modality
 *     set, Standing, Revision≠Correction.
 *   - Engineering Realization §13 (P1) — the Stable Public Interfaces this file
 *     types: tuple grammar, five verbs, Revision≠Correction typing, footprint
 *     declaration, Standing model.
 *   - P0 substrate reconciliation §3 — the twin ledger is a new conformer over
 *     the proven append-only/bitemporal/lineage substrate.
 */

import type { AppendOnlyLedgerDescriptor } from "@/lib/operationalLedger/ledgerSubstrateContract";

// -----------------------------------------------------------------------------
// Closed vocabularies (frozen — a value outside any set is an architecture
// escalation, never an in-thread extension).
// -----------------------------------------------------------------------------

/**
 * The CLOSED set of five operational modalities. Permission/authorization is
 * deliberately excluded (not truth-apt against reality). A sixth modality is an
 * architecture escalation (R16), never a feature. (System design §0.)
 */
export type OperationalModality =
    | "required"
    | "prohibited"
    | "intended"
    | "committed"
    | "predicted";

export const OPERATIONAL_MODALITIES: readonly OperationalModality[] = [
    "required",
    "prohibited",
    "intended",
    "committed",
    "predicted",
] as const;

/**
 * The five authoring verbs — the only acts that write the ledger. There is no
 * "fulfill / complete / mark-done" verb (Law 3): fulfillment happens because a
 * Fact appears, never because the ledger marks it. (System design §5.)
 */
export type ExpectationVerb =
    | "create"
    | "revise"
    | "correct"
    | "replace"
    | "cancel";

export const EXPECTATION_VERBS: readonly ExpectationVerb[] = [
    "create",
    "revise",
    "correct",
    "replace",
    "cancel",
] as const;

/**
 * The typed supersession/transition a non-`create` act carries on lineage. The
 * Revision≠Correction distinction is LOAD-BEARING — consumers branch on it
 * (revision re-plans forward; correction unwinds a never-valid past). Wave A
 * only makes the type storable + distinct; the propagation behavior is Wave D.
 * (System design §4.5.)
 */
export type ExpectationTransitionType =
    | "revision"
    | "correction"
    | "cancellation"
    | "replacement";

export const EXPECTATION_TRANSITION_TYPES: readonly ExpectationTransitionType[] = [
    "revision",
    "correction",
    "cancellation",
    "replacement",
] as const;

/**
 * The canonical verb→transition map. A `create` opens a lineage (no transition);
 * every other verb supersedes a prior row with exactly one transition type. The
 * ledger table encodes this same map as a CHECK constraint (the storage half of
 * the guarantee); intake enforces it at authoring time (Wave B).
 */
export const VERB_TRANSITION_MAP: Readonly<
    Record<ExpectationVerb, ExpectationTransitionType | null>
> = {
    create: null,
    revise: "revision",
    correct: "correction",
    replace: "replacement",
    cancel: "cancellation",
} as const;

/**
 * Standing is MEANING (Law 6), not a workflow status. Binding force derives from
 * the author's standing. Wave A holds the standing value; the Authority→Standing
 * resolution and the authoring gate are Wave C. A `predicted` expectation may
 * stand at `model` standing (imposes no obligation); deontic/commissive
 * standing binds only when authored by an authorized human/policy/process or
 * promoted by a Ratification Act. (System design §12.)
 */
export type ExpectationStanding = "proposed" | "binding" | "model";

export const EXPECTATION_STANDINGS: readonly ExpectationStanding[] = [
    "proposed",
    "binding",
    "model",
] as const;

/** The author classes whose Authority the intake gate (Wave C) resolves to Standing. */
export type ExpectationAuthorClass =
    | "human"
    | "policy"
    | "process"
    | "ai"
    | "external";

export const EXPECTATION_AUTHOR_CLASSES: readonly ExpectationAuthorClass[] = [
    "human",
    "policy",
    "process",
    "ai",
    "external",
] as const;

// -----------------------------------------------------------------------------
// The tuple grammar — an Expectation IS the tuple
// ⟨ Authority · Modality · Subject(s) · Condition · Temporal Frame · [Beneficiary] ⟩.
// Wave A types the SHAPE; it does not evaluate a Condition (that is the pure
// engine, P3) and never names a measurable/sensor (that is a Config binding,
// below the semantic line — P2).
// -----------------------------------------------------------------------------

/** The Authority facet — the declared authority under which the tuple is asserted. */
export interface ExpectationAuthority {
    /** Stable reference to the authority the assertion claims (resolved to Standing in Wave C). */
    authorityKey: string;
    /** The author class making the assertion. */
    authorClass: ExpectationAuthorClass;
}

/** The Subject facet — durable business-subject reference(s) the tuple governs. */
export interface ExpectationSubject {
    /** The subject kind (e.g. "room", "child", "staff") — indexable. */
    kind: string;
    /** Durable business-subject reference(s); never a fact-row id. */
    ref: string | string[];
}

/**
 * The Condition facet — a predicate over a Subject's witnessed state, authored
 * against an Expectation Type that fixes the predicate SHAPE (the author supplies
 * parameters, never free-form logic; never a sensor reference). Wave A stores it;
 * it does not evaluate it. (System design §A1.)
 */
export interface ExpectationCondition {
    /** The Expectation Type whose shape this Condition instantiates (Config, P2). */
    typeKey: string;
    /** The predicate shape fixed by the Type (e.g. "ratio_at_least"). */
    predicateShape: string;
    /** Author-supplied parameters for the fixed shape — on reality, never a sensor. */
    params: Record<string, unknown>;
}

/** The Temporal Frame facet — REQUIRED presence; the valid-time window asserted. */
export interface ExpectationTemporalFrame {
    /** The frame kind (e.g. "instant", "window", "recurring", "operating_hours"). */
    kind: string;
    /** Valid-from (bitemporal valid-time start). */
    validFrom: string;
    /** Valid-to (open-ended when null). */
    validTo?: string | null;
    /** Optional recurrence reference (a Config Recurrence definition, P2). */
    recurrenceRef?: string | null;
}

/**
 * The dependency FOOTPRINT an Expectation declares — the fact-types, over the
 * subject set, within the window, that can change its verdict. Wave A holds the
 * declaration; Processing (P4) maintains the index and drives incremental
 * evaluation from it. (System design §A3.)
 */
export interface ExpectationFootprint {
    /** Fact-types that can change this expectation's verdict. */
    factTypes: string[];
    /** The subject set the footprint spans (defaults to the tuple's subjects). */
    subjectScope?: string[];
    /** The evaluation window (defaults to the temporal frame). */
    window?: { from?: string | null; to?: string | null };
}

/**
 * The authored Expectation tuple. This is the SEMANTIC shape a well-formed ledger
 * row expresses; the physical column layout is Internal Implementation Freedom.
 */
export interface ExpectationTuple {
    authority: ExpectationAuthority;
    modality: OperationalModality;
    subjects: ExpectationSubject[];
    condition: ExpectationCondition;
    temporalFrame: ExpectationTemporalFrame;
    /** Optional Beneficiary facet (a wronged beneficiary on a committed breach). */
    beneficiary?: ExpectationSubject | null;
}

// -----------------------------------------------------------------------------
// The Expectation ledger descriptor — a NARROW authored-ledger EXTENSION of the
// shared AppendOnlyLedgerDescriptor. The generic substrate fields (tableName,
// orgColumn, lineageColumn, effectiveTimeColumn, recordedTimeColumn, appendOnly)
// come from the shared base; only the authored-ledger fields are added here.
// Read by the conformance harness (with runtime probes) to assert the substrate.
// -----------------------------------------------------------------------------

export interface OperationalExpectationLedgerDescriptor extends AppendOnlyLedgerDescriptor {
    /** The modality column (closed-five CHECK). */
    modalityColumn: string;
    /** The authoring-verb column (five-verb CHECK). */
    verbColumn: string;
    /** The typed-transition column (four-type CHECK; NULL on a `create`). */
    transitionTypeColumn: string;
    /** The standing column (proposed|binding|model CHECK). */
    standingColumn: string;
    /** The declared dependency-footprint column (handed to Processing, P4). */
    footprintColumn: string;
    /** The closed modality vocabulary the storage CHECK must enforce. */
    modalityVocabulary: readonly OperationalModality[];
    /** The verb vocabulary the storage CHECK must enforce. */
    verbVocabulary: readonly ExpectationVerb[];
    /** The transition-type vocabulary the storage CHECK must enforce. */
    transitionTypeVocabulary: readonly ExpectationTransitionType[];
    /** The standing vocabulary the storage CHECK must enforce. */
    standingVocabulary: readonly ExpectationStanding[];
}

/**
 * The columns every conforming Expectation-ledger row must carry to express a
 * well-formed authored tuple with lineage + bitemporal stamps + standing +
 * footprint. Used by the conformance harness as a required-column check.
 */
export const OPERATIONAL_EXPECTATION_REQUIRED_COLUMNS = [
    "org_id",
    "authority_key",
    "author_class",
    "modality",
    "subject_kind",
    "subject_ref",
    "condition",
    "temporal_frame",
    "verb",
    "transition_type",
    "standing",
    "supersedes_expectation_id",
    "valid_from",
    "authored_at",
    "footprint",
] as const;
