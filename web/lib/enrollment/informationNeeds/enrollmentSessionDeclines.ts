/**
 * "The participant was asked this, and chose to leave it blank."
 *
 * ## The defect this closes
 *
 * An optional question offered a way out — "Nothing to add", "No known allergies" — and the only way
 * the runtime could stop re-asking was to store the shortcut's own LABEL as the answer. So a parent
 * who had no middle name to give produced, on a signed Oregon health form:
 *
 *     Middle name: Nothing to add
 *
 * The label is a description of what the parent DID. It is not what they said their child's middle
 * name is, and it must never reach a Form, a PDF or a generated document. `No known allergies` is
 * the one case where the words are also a true clinical statement — and that is a property of the
 * allergies concept, not of skipping.
 *
 * ## Settlement is not a value
 *
 * The session already separates these two ideas: `session_value_key` holds what the participant
 * SAID, and the D-99 confirmation store holds the statement that they reviewed it. A decline is the
 * third member of that family — a fact about the interaction, stored beside the confirmations, in
 * the session's own `metadata` extensibility owner. `shared_values` is documented as scalar answers
 * and every consumer renders an entry as a value, so a decline must not live there.
 *
 * ## What it does and does not mean
 *
 * It means: asked, answered "nothing", do not ask again, count it settled, print nothing.
 *
 * It does not mean the fact is unknown to the organization, does not touch a canonical record, and
 * does not satisfy a REQUIRED need — a decline of something the Form insists on is refused, because
 * declining is only ever available where the authored control says the answer is optional.
 *
 * Pure. No I/O.
 */

/** Namespaced so it can never be mistaken for, or collide with, another session concern. */
export const ENROLLMENT_DECLINES_METADATA_KEY = "enrollment_need_declines_v1" as const;

export type EnrollmentNeedDecline = {
    readonly declined_at: string;
};

export type EnrollmentNeedDeclineMap = Readonly<Record<string, EnrollmentNeedDecline>>;

/** Read the decline map out of a session's `metadata`. Absent or malformed reads as empty. */
export function readEnrollmentNeedDeclines(metadata: unknown): EnrollmentNeedDeclineMap {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return {};
    const root = (metadata as Record<string, unknown>)[ENROLLMENT_DECLINES_METADATA_KEY];
    if (root == null || typeof root !== "object" || Array.isArray(root)) return {};

    const out: Record<string, EnrollmentNeedDecline> = {};
    for (const [needKey, raw] of Object.entries(root as Record<string, unknown>)) {
        if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
        const declinedAt = typeof (raw as Record<string, unknown>).declined_at === "string"
            ? String((raw as Record<string, unknown>).declined_at).trim()
            : "";
        // No instant, no decline. Failing closed simply means the question is asked again.
        if (!declinedAt) continue;
        out[needKey] = { declined_at: declinedAt };
    }
    return out;
}

/**
 * Does a stored decline still settle this need?
 *
 * A decline is about ABSENCE, so it is invalidated by the arrival of a value rather than by a value
 * changing — the opposite of a confirmation, and for the same reason: the stored statement must stop
 * being true the moment the world stops matching it. A parent who declines and later supplies the
 * fact has supplied it, and the value speaks for itself.
 */
export function declineSatisfiesAbsence(
    decline: EnrollmentNeedDecline | undefined,
    hasValue: boolean,
): boolean {
    return decline != null && !hasValue;
}

/**
 * The metadata patch that records one decline.
 *
 * Returns the WHOLE metadata object rather than a fragment, so the caller writes it back through the
 * ordinary session update path and no other metadata key is disturbed.
 */
export function buildEnrollmentNeedDeclinePatch(input: {
    readonly metadata: unknown;
    readonly needKey: string;
    /** Injected rather than read from the clock, so the write stays deterministic and testable. */
    readonly declinedAtIso: string;
}): Record<string, unknown> {
    const base =
        input.metadata != null && typeof input.metadata === "object" && !Array.isArray(input.metadata)
            ? { ...(input.metadata as Record<string, unknown>) }
            : {};

    const existing = readEnrollmentNeedDeclines(base);
    return {
        ...base,
        [ENROLLMENT_DECLINES_METADATA_KEY]: {
            ...existing,
            [input.needKey]: { declined_at: input.declinedAtIso },
        },
    };
}
