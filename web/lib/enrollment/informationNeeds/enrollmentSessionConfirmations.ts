/**
 * D-99 — session-scoped participant confirmation.
 *
 * "For this Enrollment objective, the participant reviewed the current proposed value for this
 * unique information need and confirmed it as correct."
 *
 * It is deterministic interaction state attached to a NEED, reusable across every occurrence of that
 * need in this Enrollment. It is **not** a legal attestation, a signature, a consent, a permanent
 * canonical verification, AI confidence, or record-level assurance — and it never mutates a
 * canonical record.
 *
 * ## Where it is stored, and why not in `shared_values`
 *
 * `form_packet_sessions.shared_values` is documented by its own column comment as "Shallow-merged
 * scalar answers across steps", and `mergeFormPrefillPayload` applies every entry as scalar PREFILL.
 * Putting structured confirmation objects there would inject non-answers into form payloads — every
 * existing consumer treats an entry as a value to render.
 *
 * `form_packet_sessions.metadata` already exists on the same row, is `NOT NULL DEFAULT '{}'`, and is
 * the session's extensibility owner. No migration is required and no new table is created. This is
 * NOT a parallel answer store: the VALUES stay in `shared_values` and in canonical sources; only the
 * statement "the participant confirmed this" lives here.
 *
 * ## Confirmation is bound to the VALUE, never a bare boolean
 *
 * A detached `confirmed = true` would keep satisfying a need after the value underneath it changed —
 * the parent would have confirmed May 4th and silently be recorded as having confirmed May 9th. So a
 * confirmation stores a fingerprint of the value confirmed, and any change invalidates it
 * automatically. Nothing has to remember to clear a flag.
 *
 * The fingerprint follows the platform convention (`operationalRecommendationFingerprint`): sha256
 * over a stable serialization, truncated. The raw value is deliberately NOT duplicated here —
 * recording that a DOB was confirmed must not create a second copy of the DOB.
 *
 * One entry per NEED, never one per Form occurrence. That is the whole ask-once invariant expressed
 * in storage.
 */

import { createHash } from "crypto";

/** Namespaced so it can never be mistaken for, or collide with, another session concern. */
export const ENROLLMENT_CONFIRMATIONS_METADATA_KEY = "enrollment_need_confirmations_v1" as const;

export type EnrollmentNeedConfirmation = {
    /** Fingerprint of the value the participant actually confirmed. */
    readonly value_fingerprint: string;
    readonly confirmed_at: string;
};

export type EnrollmentNeedConfirmationMap = Readonly<Record<string, EnrollmentNeedConfirmation>>;

/**
 * A stable fingerprint of a confirmed value.
 *
 * Normalizes only what cannot change meaning: a string is trimmed, because trailing whitespace is
 * not a different date of birth. Nothing else is coerced — `"5"` and `5` are deliberately different
 * fingerprints, since collapsing them would be exactly the approximate matching this slice forbids.
 *
 * Null and undefined return null: absence is not something a participant can confirm.
 */
export function enrollmentValueFingerprint(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const normalized = typeof value === "string" ? value.trim() : value;
    if (normalized === "") return null;
    return createHash("sha256")
        .update(JSON.stringify({ v: normalized }), "utf8")
        .digest("hex")
        .slice(0, 32);
}

/** Read the confirmation map out of a session's `metadata`. Absent or malformed reads as empty. */
export function readEnrollmentNeedConfirmations(
    metadata: unknown,
): EnrollmentNeedConfirmationMap {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return {};
    const root = (metadata as Record<string, unknown>)[ENROLLMENT_CONFIRMATIONS_METADATA_KEY];
    if (root == null || typeof root !== "object" || Array.isArray(root)) return {};

    const out: Record<string, EnrollmentNeedConfirmation> = {};
    for (const [needKey, raw] of Object.entries(root as Record<string, unknown>)) {
        if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
        const row = raw as Record<string, unknown>;
        const fingerprint = typeof row.value_fingerprint === "string" ? row.value_fingerprint.trim() : "";
        const confirmedAt = typeof row.confirmed_at === "string" ? row.confirmed_at.trim() : "";
        // A confirmation with no fingerprint is exactly the detached boolean this design exists to
        // prevent. Dropping it fails closed: the need simply still needs confirming.
        if (!fingerprint || !confirmedAt) continue;
        out[needKey] = { value_fingerprint: fingerprint, confirmed_at: confirmedAt };
    }
    return out;
}

/**
 * Does a stored confirmation still satisfy the need, given the value that is current NOW?
 *
 * The comparison is the whole point: a confirmation of a superseded value is not a confirmation of
 * the current one.
 */
export function confirmationSatisfiesCurrentValue(
    confirmation: EnrollmentNeedConfirmation | undefined,
    currentValue: unknown,
): boolean {
    if (!confirmation) return false;
    const current = enrollmentValueFingerprint(currentValue);
    return current !== null && current === confirmation.value_fingerprint;
}

/**
 * The metadata patch that records one confirmation.
 *
 * Returns the WHOLE metadata object rather than a fragment, so the caller writes it back through the
 * ordinary session update path and no other metadata key is disturbed. Returns null when the value
 * cannot be fingerprinted — there is nothing to confirm, and writing an empty confirmation would
 * recreate the detached boolean.
 */
export function buildEnrollmentNeedConfirmationPatch(input: {
    readonly metadata: unknown;
    readonly needKey: string;
    readonly confirmedValue: unknown;
    /** Injected rather than read from the clock, so the write stays deterministic and testable. */
    readonly confirmedAtIso: string;
}): Record<string, unknown> | null {
    const fingerprint = enrollmentValueFingerprint(input.confirmedValue);
    if (!fingerprint) return null;

    const base =
        input.metadata != null && typeof input.metadata === "object" && !Array.isArray(input.metadata)
            ? { ...(input.metadata as Record<string, unknown>) }
            : {};

    const existing = readEnrollmentNeedConfirmations(base);
    return {
        ...base,
        [ENROLLMENT_CONFIRMATIONS_METADATA_KEY]: {
            ...existing,
            [input.needKey]: {
                value_fingerprint: fingerprint,
                confirmed_at: input.confirmedAtIso,
            },
        },
    };
}
