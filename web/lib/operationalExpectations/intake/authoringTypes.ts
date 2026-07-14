/**
 * Operational Expectations — Authoring Intake types (P1 · Wave B).
 *
 * The typed public contract of the ONE authoring intake into the authored
 * Expectation ledger. Callers express the FROZEN tuple grammar
 * ⟨Authority·Modality·Subject·Condition·TemporalFrame·[Beneficiary]⟩ through this
 * typed input — never raw table columns, never arbitrary JSON that bypasses typed
 * validation.
 *
 * SCOPE (Wave B — authoring intake only):
 *   - Admits the five verbs, validates the frozen grammar, resolves the
 *     predecessor with tenancy, is idempotent, and emits one Authoring Act.
 *   - Does NOT resolve Authority→Standing (Wave C), does NOT implement
 *     revision/correction PROPAGATION behavior (Wave D), does NOT evaluate,
 *     judge, derive gaps, or invoke effectors.
 *
 * Authority (frozen): System Design §5 (five author classes, one intake grammar),
 * §12 (Standing/Authority — resolution is Wave C), §A1 (Condition on reality, not
 * a sensor), §A3 (footprint); Engineering Realization §13 (P1 Stable Public
 * Interfaces: tuple grammar, five verbs, Revision≠Correction typing, footprint,
 * Standing).
 */

import type {
    ExpectationAuthority,
    ExpectationCondition,
    ExpectationFootprint,
    ExpectationSubject,
    ExpectationTemporalFrame,
    ExpectationVerb,
    OperationalModality,
} from "@/lib/operationalExpectations/expectationLedgerContract";

/**
 * The server-TRUSTED context. The org and actor are resolved server-side from the
 * authenticated principal — NEVER from caller input. Wave B enforces tenancy and
 * a minimal authenticated-actor gate; final Authority→Standing resolution is
 * Wave C.
 */
export interface AuthoringContext {
    /** Trusted org id (server-resolved; never client-supplied). */
    orgId: string;
    /** The authenticated actor performing the act (server-resolved). */
    actorUserId: string | null;
    /** Optional human-readable actor label for the audit log. */
    actorLabel?: string | null;
    /**
     * Whether the actor is a server/service principal permitted to reach the
     * intake at all. Wave B requires an authenticated actor context; it does NOT
     * decide Standing from this (Wave C). Absent/false → unauthorized.
     */
    actorAuthenticated: boolean;
}

/**
 * The typed authoring input — the frozen tuple grammar plus intake identity. The
 * organization is NOT accepted here (it is server-trusted context). Recorded time
 * is NOT accepted here (it is database-assigned, Wave A).
 */
export interface AuthoringInput {
    /** The idempotency key — same key + same payload returns the existing act. */
    idempotencyKey: string;
    /** Authoring verb (create · revise · correct · replace · cancel). */
    verb: ExpectationVerb;
    /** Authority facet (declared authority + author class). Standing = Wave C. */
    authority: ExpectationAuthority;
    /** Modality — must be one of the closed five. */
    modality: OperationalModality;
    /** Subject(s) the tuple governs (≥ 1). */
    subjects: ExpectationSubject[];
    /** Condition — a predicate over reality; never a sensor/measurable reference. */
    condition: ExpectationCondition;
    /** Temporal Frame — REQUIRED. */
    temporalFrame: ExpectationTemporalFrame;
    /** Optional Beneficiary facet. */
    beneficiary?: ExpectationSubject | null;
    /** Dependency footprint declaration — REQUIRED (handed to P4). */
    footprint: ExpectationFootprint;
    /** Optional config version-at-authoring provenance (stored only when supplied). */
    configVersionRef?: unknown;
    /** Predecessor row id — REQUIRED for non-create verbs, FORBIDDEN for create. */
    predecessorId?: string | null;
}

// NOTE: Standing is NOT a caller input. Wave B DERIVES a provisional, non-binding
// standing from modality alone (predicted → model, else → proposed) and NEVER
// binding. Final Authority→Standing resolution + ratification are Wave C.

/** Why an authoring act was rejected (typed, caller-safe). */
export type AuthoringRejectionCode =
    | "unauthorized"
    | "sixth_modality"
    | "missing_temporal_frame"
    | "invalid_temporal_frame"
    | "invalid_valid_window"
    | "invalid_subject"
    | "invalid_condition"
    | "semantic_line_violation"
    | "missing_beneficiary"
    | "invalid_beneficiary"
    | "missing_footprint"
    | "invalid_footprint"
    | "invalid_authority"
    | "invalid_verb"
    | "create_with_predecessor"
    | "missing_predecessor"
    | "predecessor_not_found"
    | "cross_org_predecessor"
    | "subject_lineage_mismatch"
    | "self_reference"
    | "invalid_idempotency_key";

/** The committed authored act (the ledger row identity + typed facets). */
export interface AuthoredExpectationAct {
    id: string;
    orgId: string;
    verb: ExpectationVerb;
    modality: OperationalModality;
    transitionType: "revision" | "correction" | "cancellation" | "replacement" | null;
    supersedesExpectationId: string | null;
    lineageRootId: string | null;
    standing: "proposed" | "binding" | "model";
    /** Server-assigned recorded/transaction time (ISO). */
    authoredAt: string;
}

/** The discriminated result of an authoring attempt. Never throws to the caller. */
export type AuthoringResult =
    | {
          /** The flag `oe.ledger.author` is OFF — Facts-only; nothing written. */
          status: "disabled";
      }
    | {
          /** A well-formed act was committed (or returned idempotently). */
          status: "authored";
          act: AuthoredExpectationAct;
          /** The one canonical Authoring Act event id. */
          authoringActEventId: string;
          /** True when returned from an existing act via idempotency (no new row). */
          idempotent: boolean;
      }
    | {
          /** The grammar/tenancy validation rejected the act. Nothing written. */
          status: "rejected";
          code: AuthoringRejectionCode;
          message: string;
          field?: string;
      }
    | {
          /** Same idempotency key, materially different payload. Nothing written. */
          status: "conflict";
          code: "idempotency_conflict";
          message: string;
      }
    | {
          /** An infrastructure failure (no raw DB error leaked). Nothing authoritative claimed. */
          status: "failed";
          message: string;
      };

/** A typed rejection helper shape used by the pure validators. */
export interface AuthoringRejection {
    ok: false;
    code: AuthoringRejectionCode;
    message: string;
    field?: string;
}

export interface AuthoringOk {
    ok: true;
}

export type ValidationOutcome = AuthoringOk | AuthoringRejection;
