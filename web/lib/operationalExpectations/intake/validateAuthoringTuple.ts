/**
 * Operational Expectations — Authoring Intake grammar validation (P1 · Wave B).
 *
 * PURE, synchronous validation of the frozen tuple grammar before any write. No
 * DB, no IO. Enforces (System Design §0/§5/§A1, Engineering Realization §13 P1):
 *   - modality closure (exactly the closed five; reject any sixth);
 *   - verb ↔ predecessor structural rules (create has none; others require one);
 *   - Temporal-Frame presence + supported shape;
 *   - Subject / Condition structural validity;
 *   - the SEMANTIC LINE — a Condition asserts a predicate over reality and must
 *     NOT smuggle a sensor / measurable / fact reference (that binding is Config,
 *     P2, below the line);
 *   - footprint declaration presence + shape;
 *   - Beneficiary shape (when supplied);
 *   - effective/valid-time coherence.
 *
 * It does NOT evaluate whether the Condition is TRUE (that is the engine, P3), and
 * does NOT resolve Standing/Authority (Wave C). Predecessor existence/tenancy is
 * resolved against the database by the intake service (this module only enforces
 * the structural create-vs-supersede shape).
 */

import {
    OPERATIONAL_MODALITIES,
    EXPECTATION_VERBS,
    VERB_TRANSITION_MAP,
    type ExpectationVerb,
    type OperationalModality,
} from "@/lib/operationalExpectations/expectationLedgerContract";
import type {
    AuthoringInput,
    ValidationOutcome,
} from "@/lib/operationalExpectations/intake/authoringTypes";

const OK: ValidationOutcome = { ok: true };

function reject(
    code: import("@/lib/operationalExpectations/intake/authoringTypes").AuthoringRejectionCode,
    message: string,
    field?: string,
): ValidationOutcome {
    return { ok: false, code, message, field };
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === "string" && v.trim().length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Keys inside a Condition that indicate an author is smuggling a measurable /
 * sensor / observed-fact reference across the semantic line. The Condition names
 * reality; how Facts witness it is a Config measurable binding (A1), never on the
 * expectation. Case-insensitive.
 */
const SEMANTIC_LINE_FORBIDDEN_KEYS = [
    "sensor",
    "measurable",
    "measurablebinding",
    "measurable_binding",
    "facttype",
    "fact_type",
    "factref",
    "fact_ref",
    "factid",
    "fact_id",
    "evidence",
    "evidencing",
    "device",
    "probe",
    "reading",
    "signalsource",
    "signal_source",
    "raw_signal",
];

/** A Condition must be a predicate over reality — never a sensor/measurable ref. */
function conditionCrossesSemanticLine(condition: Record<string, unknown>): string | null {
    // No forbidden key at the Condition top level.
    for (const key of Object.keys(condition)) {
        if (SEMANTIC_LINE_FORBIDDEN_KEYS.includes(key.toLowerCase())) return key;
    }
    // No forbidden key inside params (author supplies parameters, never a sensor).
    const params = condition.params;
    if (isPlainObject(params)) {
        for (const key of Object.keys(params)) {
            if (SEMANTIC_LINE_FORBIDDEN_KEYS.includes(key.toLowerCase())) return `params.${key}`;
        }
    }
    return null;
}

export function isClosedModality(value: unknown): value is OperationalModality {
    return typeof value === "string" && (OPERATIONAL_MODALITIES as readonly string[]).includes(value);
}

export function isKnownVerb(value: unknown): value is ExpectationVerb {
    return typeof value === "string" && (EXPECTATION_VERBS as readonly string[]).includes(value);
}

/**
 * Validate the authoring input against the frozen grammar. Returns the first
 * failure (typed, caller-safe) or `{ ok: true }`. Ordering is deliberate:
 * structural identity → verb/lineage shape → tuple facets → semantic line.
 */
export function validateAuthoringTuple(input: AuthoringInput): ValidationOutcome {
    // -- Intake identity ------------------------------------------------------
    if (!isNonEmptyString(input.idempotencyKey)) {
        return reject("invalid_idempotency_key", "An idempotency key is required.", "idempotencyKey");
    }

    // -- Verb + modality closure ---------------------------------------------
    if (!isKnownVerb(input.verb)) {
        return reject("invalid_verb", `Unknown verb '${String(input.verb)}'.`, "verb");
    }
    if (!isClosedModality(input.modality)) {
        return reject(
            "sixth_modality",
            `Modality '${String(input.modality)}' is outside the closed five (${OPERATIONAL_MODALITIES.join(", ")}).`,
            "modality",
        );
    }

    // -- Verb ↔ predecessor structural rule (Revision≠Correction typed) -------
    const expectedTransition = VERB_TRANSITION_MAP[input.verb];
    const hasPredecessor = isNonEmptyString(input.predecessorId ?? undefined);
    if (input.verb === "create") {
        if (hasPredecessor) {
            return reject("create_with_predecessor", "A create act must not reference a predecessor.", "predecessorId");
        }
    } else {
        if (!hasPredecessor) {
            return reject("missing_predecessor", `A ${input.verb} act requires a predecessor.`, "predecessorId");
        }
    }
    // (expectedTransition is what the intake will persist; the DB verb→transition
    // map CHECK is the final defense. Nothing to validate further here.)
    void expectedTransition;

    // -- Authority facet (stored; Standing resolution is Wave C) --------------
    if (!isPlainObject(input.authority as unknown) || !isNonEmptyString(input.authority?.authorityKey)) {
        return reject("invalid_authority", "An authority reference is required.", "authority");
    }

    // -- Subject(s) -----------------------------------------------------------
    if (!Array.isArray(input.subjects) || input.subjects.length === 0) {
        return reject("invalid_subject", "At least one subject is required.", "subjects");
    }
    for (const s of input.subjects) {
        if (!isPlainObject(s as unknown) || !isNonEmptyString(s.kind) || s.ref == null) {
            return reject("invalid_subject", "Each subject needs a kind and a ref.", "subjects");
        }
    }

    // -- Condition (structural) ----------------------------------------------
    if (!isPlainObject(input.condition as unknown)) {
        return reject("invalid_condition", "A structured condition is required.", "condition");
    }
    if (!isNonEmptyString(input.condition.typeKey) || !isNonEmptyString(input.condition.predicateShape)) {
        return reject("invalid_condition", "A condition needs a typeKey and a predicateShape.", "condition");
    }
    if (!isPlainObject(input.condition.params as unknown)) {
        return reject("invalid_condition", "Condition params must be an object of author-supplied values.", "condition");
    }

    // -- Semantic line — no sensor/measurable/fact smuggled into the Condition
    const crossing = conditionCrossesSemanticLine(input.condition as unknown as Record<string, unknown>);
    if (crossing) {
        return reject(
            "semantic_line_violation",
            `A condition asserts reality, not a measurable — '${crossing}' names a sensor/fact and belongs in a Config measurable binding.`,
            "condition",
        );
    }

    // -- Temporal Frame (required) -------------------------------------------
    if (!isPlainObject(input.temporalFrame as unknown)) {
        return reject("missing_temporal_frame", "A temporal frame is required.", "temporalFrame");
    }
    if (!isNonEmptyString(input.temporalFrame.kind) || !isNonEmptyString(input.temporalFrame.validFrom)) {
        return reject("invalid_temporal_frame", "A temporal frame needs a kind and a validFrom.", "temporalFrame");
    }
    const validFrom = Date.parse(input.temporalFrame.validFrom);
    if (Number.isNaN(validFrom)) {
        return reject("invalid_temporal_frame", "temporalFrame.validFrom is not a valid timestamp.", "temporalFrame");
    }
    const rawValidTo = input.temporalFrame.validTo;
    if (rawValidTo != null) {
        const validTo = Date.parse(rawValidTo);
        if (Number.isNaN(validTo)) {
            return reject("invalid_temporal_frame", "temporalFrame.validTo is not a valid timestamp.", "temporalFrame");
        }
        if (validTo < validFrom) {
            return reject("invalid_valid_window", "validTo must be on or after validFrom.", "temporalFrame");
        }
    }

    // -- Beneficiary (optional; when present must be well-formed) --------------
    if (input.beneficiary != null) {
        const b = input.beneficiary;
        if (!isPlainObject(b as unknown) || !isNonEmptyString(b.kind) || b.ref == null) {
            return reject("invalid_beneficiary", "A beneficiary, when supplied, needs a kind and a ref.", "beneficiary");
        }
    }

    // -- Footprint declaration (required; handed to P4) -----------------------
    if (!isPlainObject(input.footprint as unknown)) {
        return reject("missing_footprint", "A dependency footprint declaration is required.", "footprint");
    }
    if (!Array.isArray(input.footprint.factTypes) || input.footprint.factTypes.length === 0) {
        return reject("invalid_footprint", "The footprint must declare at least one fact-type.", "footprint");
    }
    if (!input.footprint.factTypes.every((t) => isNonEmptyString(t))) {
        return reject("invalid_footprint", "Footprint fact-types must be non-empty strings.", "footprint");
    }

    return OK;
}
