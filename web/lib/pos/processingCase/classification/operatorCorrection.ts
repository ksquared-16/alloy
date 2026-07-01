/**
 * POS-FP9 (Sprint 2.6) — operator classification correction (pure logic).
 *
 * An operator can CONFIRM, CHANGE, or MARK-UNKNOWN the classification on a case.
 * This module owns the (pure, testable) validation + result construction; the route
 * and the UI both build their payloads/results from here so behavior is identical
 * and unit-tested without a DB or browser.
 *
 * Annotation only — this never proposes a record change, never extracts, and never
 * touches lifecycle status. It produces a `ProcessingClassificationResult` that the
 * existing annotation-only store persists.
 */

import type { ProcessingClassificationKey, ProcessingClassificationResult } from "./types";

/** Real (non-unknown) keys an operator may assign — the Sprint 2 vocabulary. */
export const OPERATOR_CLASSIFIED_KEYS = [
    "subsidy_contract",
    "remittance",
    "immunization_record",
    "enrollment_document",
    "form_like_document",
] as const satisfies readonly ProcessingClassificationKey[];

export type OperatorClassifiedKey = (typeof OPERATOR_CLASSIFIED_KEYS)[number];

/** Operator-facing status (only these two are correctable; `unsupported` is system-only). */
export type OperatorCorrectionStatus = "classified" | "unknown";

/** Human labels for the keys (single source of truth for operator/UI display). */
export const CLASSIFICATION_KEY_LABELS: Record<ProcessingClassificationKey, string> = {
    subsidy_contract: "Subsidy contract",
    remittance: "Remittance",
    immunization_record: "Immunization record",
    enrollment_document: "Enrollment document",
    form_like_document: "Form-like document",
    unknown: "Unknown",
};

/** Confidence an operator decision carries — authoritative (0.95 classified, 0 unknown). */
export const OPERATOR_CLASSIFIED_CONFIDENCE = 0.95;
/** Marks human provenance on the stored result's `classifier_version`. */
export const OPERATOR_CLASSIFIER_VERSION = "operator";

export interface OperatorCorrectionInput {
    classification_key: unknown;
    status: unknown;
}

export type OperatorCorrectionValidation =
    | { ok: true; classification_key: ProcessingClassificationKey; status: OperatorCorrectionStatus }
    | { ok: false; error: string };

function isClassifiedKey(v: unknown): v is OperatorClassifiedKey {
    return typeof v === "string" && (OPERATOR_CLASSIFIED_KEYS as readonly string[]).includes(v);
}

/**
 * Validate the (key, status) pair. The pair must be coherent:
 *  - status "classified" requires a real key (not "unknown")
 *  - status "unknown"    requires key === "unknown"
 */
export function validateOperatorCorrection(input: OperatorCorrectionInput): OperatorCorrectionValidation {
    const { classification_key: key, status } = input;

    if (status !== "classified" && status !== "unknown") {
        return { ok: false, error: 'status must be "classified" or "unknown"' };
    }
    if (typeof key !== "string") {
        return { ok: false, error: "classification_key is required" };
    }

    if (status === "unknown") {
        if (key !== "unknown") {
            return { ok: false, error: 'status "unknown" requires classification_key "unknown"' };
        }
        return { ok: true, classification_key: "unknown", status: "unknown" };
    }

    // status === "classified"
    if (!isClassifiedKey(key)) {
        return {
            ok: false,
            error: `classification_key must be one of: ${OPERATOR_CLASSIFIED_KEYS.join(", ")}`,
        };
    }
    return { ok: true, classification_key: key, status: "classified" };
}

/**
 * Build the deterministic operator result for a validated (key, status) pair.
 * Carries an explicit `operator` signal so the decision's provenance is visible.
 */
export function buildOperatorClassification(args: {
    classification_key: ProcessingClassificationKey;
    status: OperatorCorrectionStatus;
}): ProcessingClassificationResult {
    const isUnknown = args.status === "unknown";
    const confidence = isUnknown ? 0 : OPERATOR_CLASSIFIED_CONFIDENCE;
    return {
        classification_key: args.classification_key,
        label: CLASSIFICATION_KEY_LABELS[args.classification_key],
        confidence,
        signals: [{ source: "operator", value: args.classification_key, weight: confidence }],
        status: args.status,
        classifier_version: OPERATOR_CLASSIFIER_VERSION,
    };
}

// --- UI helper: turn a button intent into a validated request body --------------------

export type OperatorCorrectionIntent =
    | { intent: "confirm"; currentKey: ProcessingClassificationKey }
    | { intent: "change"; key: OperatorClassifiedKey }
    | { intent: "mark_unknown" };

/** Pure: map a UI intent to the PATCH body `{ classification_key, status }` (or null if not actionable). */
export function operatorCorrectionRequestBody(
    intent: OperatorCorrectionIntent
): { classification_key: ProcessingClassificationKey; status: OperatorCorrectionStatus } | null {
    if (intent.intent === "mark_unknown") {
        return { classification_key: "unknown", status: "unknown" };
    }
    if (intent.intent === "change") {
        return { classification_key: intent.key, status: "classified" };
    }
    // confirm: only meaningful for a real key (confirming "unknown" is a no-op).
    if (intent.currentKey === "unknown") return null;
    return { classification_key: intent.currentKey, status: "classified" };
}
