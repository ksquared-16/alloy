/**
 * The stable identity of one operator-review observation.
 *
 * Third use of the same mechanism (Phase 1.5 contract ids, 1.6 supersession,
 * 1.7 execution): the deterministic observation id makes the existing primary
 * key the exactly-once authority, so no second idempotency table and no new
 * constraint is needed.
 *
 * ```text
 * org + package + kind + the durable Processing decision + the effect
 * ```
 *
 * The Processing reference is in it because a later, different decision on the
 * SAME package is a genuinely new review event; the effect is in it because
 * `accepted` and `deferred` are different facts. Re-handling one decision
 * derives one id and cannot append twice.
 *
 * Pure. No I/O, no clock, no randomness.
 */

// The one-shot `hash()` rather than the streaming digest builder. A Phase 0
// structural control forbids the mutating-call syntax anywhere in `lib/trust`,
// on the principle that a Trust module able to write one is a Trust module able
// to mutate a Decision Package — and the control matches source text, including
// comments.
import { hash } from "node:crypto";

export const REVIEW_OBSERVATION_IDENTITY_VERSION = "trust-operator-review-observation-v1" as const;

export type ReviewObservationIdentityInput = {
    readonly org_id: string;
    readonly package_id: string;
    readonly observation_kind: "accepted" | "deferred";
    /** Durable reference into the deciding authority, e.g. `processing_resolution:<uuid>`. */
    readonly processing_reference: string;
    /** The bounded effect category. Never operator prose. */
    readonly effect: string;
};

export function reviewObservationId(input: ReviewObservationIdentityInput): string {
    // Positional, unit-separated: no component value can impersonate a boundary,
    // and object-key order cannot reach the digest.
    const canonical = [
        REVIEW_OBSERVATION_IDENTITY_VERSION,
        input.org_id,
        input.package_id,
        input.observation_kind,
        input.processing_reference,
        input.effect,
    ].join("\u001f");
    const hex = hash("sha256", canonical, "hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
