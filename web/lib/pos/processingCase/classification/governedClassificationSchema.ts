/**
 * Governed source-classification recommendation — the operator-facing contract
 * for what a Trust Decision Package may carry about a classification.
 *
 * **Processing owns this schema**, exactly as `lib/ai` owns the enrichment
 * envelope schema that Trust Runtime V1's validation policy calls out to. Trust
 * references this parser by owner and key; it never restates classification
 * vocabulary, and it never learns a keyword or a weight.
 *
 * The recommendation is a faithful projection of `ProcessingClassificationResult`
 * with nothing added and nothing rescaled. `status: "unsupported"` is absent by
 * construction: an unsupported source is rejected before a Decision Contract is
 * created, so no package can ever describe one.
 */

import { MAX_CONFIDENCE } from "./classifyNonFormSource";
import type {
    ClassificationSignal,
    ProcessingClassificationKey,
    ProcessingClassificationResult,
} from "./types";

/** The keys a governed package may carry. Mirrors `ProcessingClassificationKey`. */
export const GOVERNED_CLASSIFICATION_KEYS = [
    "subsidy_contract",
    "remittance",
    "immunization_record",
    "enrollment_document",
    "form_like_document",
    "unknown",
] as const satisfies readonly ProcessingClassificationKey[];

/**
 * The statuses a governed package may carry.
 *
 * `unsupported` is deliberately excluded — it is not a decision, it is the
 * absence of one, and it never reaches the Trust Runtime.
 */
export const GOVERNED_CLASSIFICATION_STATUSES = ["classified", "unknown"] as const;

export type GovernedClassificationStatus = (typeof GOVERNED_CLASSIFICATION_STATUSES)[number];

/**
 * The recommendation payload carried inside a Decision Package.
 *
 * Every field is copied from the classifier's own output. There is no derived
 * field, no rescaled number, and no provider or command identity — the shape
 * simply cannot express any of those.
 */
export interface GovernedSourceClassificationV1 {
    classification_key: ProcessingClassificationKey;
    label: string;
    /** The classifier's own value, unchanged. See {@link isValidClassificationConfidence}. */
    confidence: number;
    status: GovernedClassificationStatus;
    classifier_version: string;
    /** Rule tokens that fired, verbatim. `value` is a fixed rule token, never source content. */
    signals: ClassificationSignal[];
}

/**
 * The classifier's real confidence contract, read from `clampConfidence`:
 * finite, `0 <= c <= MAX_CONFIDENCE`, and rounded to two decimals.
 *
 * Stated by reference to the exported ceiling so the two cannot drift apart.
 */
export function isValidClassificationConfidence(value: unknown): value is number {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if (value < 0 || value > MAX_CONFIDENCE) return false;
    return Math.round(value * 100) / 100 === value;
}

/** The complete key set of a governed recommendation. Nothing else is admissible. */
const RECOMMENDATION_KEYS = [
    "classification_key",
    "label",
    "confidence",
    "status",
    "classifier_version",
    "signals",
] as const;

const SIGNAL_KEYS = ["source", "value", "weight"] as const;

/**
 * Exact-shape check.
 *
 * Closed rather than open on purpose. Phase 0 recorded, as debt, a capability
 * that embedded a provider label inside its own recommendation jsonb — the
 * platform could not police an opaque payload it never interprets. Here the
 * OWNER interprets it, so an extra key is refused: a `provider_key`, a
 * `proposed_command` or any other smuggled field makes the recommendation
 * invalid and the package `failed_validation`.
 */
function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === allowed.length && allowed.every((k) => Object.prototype.hasOwnProperty.call(value, k));
}

function isSignal(value: unknown): value is ClassificationSignal {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const s = value as Record<string, unknown>;
    if (!hasExactKeys(s, SIGNAL_KEYS)) return false;
    return (
        typeof s.source === "string" &&
        typeof s.value === "string" &&
        typeof s.weight === "number" &&
        Number.isFinite(s.weight)
    );
}

/**
 * Structural + confidence validation. Returns the parsed value or `null`.
 *
 * Fails closed: an out-of-range, non-finite or over-precise confidence is
 * rejected, which the Trust Runtime turns into a `failed_validation` package
 * rather than a silently clamped recommendation.
 */
export function safeParseGovernedSourceClassificationV1(
    value: unknown,
): GovernedSourceClassificationV1 | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const r = value as Record<string, unknown>;

    // Closed shape: an extra key — a provider label, a command binding, anything
    // — invalidates the recommendation rather than riding along inside it.
    if (!hasExactKeys(r, RECOMMENDATION_KEYS)) return null;

    if (!(GOVERNED_CLASSIFICATION_KEYS as readonly string[]).includes(r.classification_key as string)) return null;
    if (!(GOVERNED_CLASSIFICATION_STATUSES as readonly string[]).includes(r.status as string)) return null;
    if (typeof r.label !== "string" || !r.label.trim()) return null;
    if (typeof r.classifier_version !== "string" || !r.classifier_version.trim()) return null;
    if (!isValidClassificationConfidence(r.confidence)) return null;
    if (!Array.isArray(r.signals) || !r.signals.every(isSignal)) return null;

    // A key of `unknown` and a status of `classified` cannot coexist: the
    // classifier only emits `unknown` with status `unknown`.
    if (r.classification_key === "unknown" && r.status === "classified") return null;

    return {
        classification_key: r.classification_key as ProcessingClassificationKey,
        label: r.label,
        confidence: r.confidence,
        status: r.status as GovernedClassificationStatus,
        classifier_version: r.classifier_version,
        signals: r.signals as ClassificationSignal[],
    };
}

/**
 * Projects a classifier result into the governed recommendation, unchanged.
 *
 * Returns `null` for `unsupported`, which is what makes "an unsupported source
 * never produces a Decision Contract" a property of the projection rather than
 * a rule the caller has to remember.
 */
export function toGovernedSourceClassification(
    result: ProcessingClassificationResult,
): GovernedSourceClassificationV1 | null {
    if (result.status === "unsupported") return null;
    return {
        classification_key: result.classification_key,
        label: result.label,
        confidence: result.confidence,
        status: result.status,
        classifier_version: result.classifier_version,
        signals: result.signals,
    };
}
