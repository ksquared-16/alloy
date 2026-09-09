/**
 * Activated authoring purposes — scoped activation of the Expectations intake.
 *
 * ── WHY THIS EXISTS RATHER THAN FLIPPING THE FLAG ──
 *
 * `oe.ledger.author` is OFF by default and documented as "Facts-only
 * compatibility". It is a ROLLOUT control over the GENERIC intake: any caller,
 * any modality, any subject. Turning it on globally would enable authoring for
 * every domain at once, which is precisely the compatibility the flag exists to
 * hold — and no domain has ever authored a row, so a global flip would make the
 * ledger's first production traffic unbounded.
 *
 * A purpose is a narrow, reviewed use of the ledger: a fixed subject kind, a
 * fixed modality, and a domain that owns the meaning. Listing one here says that
 * use has been reviewed and activated for production; it says nothing about the generic intake,
 * which keeps requiring the env flag exactly as before.
 *
 * So the gate becomes:
 *
 *     generic authoring        → env flag (unchanged, still OFF by default)
 *     activated purpose        → allowed, org opt-out still honoured
 *
 * The org opt-out is deliberately still honoured for purposes. A tenant that has
 * switched the ledger off has switched it off; a purpose is a narrower door, not
 * a way around the lock.
 *
 * This module is domain-neutral by construction — it holds purpose KEYS, never
 * attendance logic. The meaning of each purpose lives in the domain that owns it.
 */

/**
 * An activated purpose. Adding one is a reviewed decision: it puts real rows in a
 * production ledger for that use.
 *
 * "Activated", not the Wave C review word: that term already names a specific
 * ledger act here, and reusing it for a rollout scope would overload it with an
 * unrelated meaning.
 */
export type ActivatedAuthoringPurpose =
    /**
     * Attendance service-day exceptions — known-away intent for a child
     * (planned absence, vacation, same-day sick) and operating prohibitions for
     * a site or operational group (closure). Thread 4 is the ledger's first
     * production consumer; the meaning lives in
     * `web/lib/childcareOperational/attendance/serviceDayExpectations.ts`.
     */
    "attendance.service_day_exception";

/** Every purpose activated for production authoring. */
export const ACTIVATED_AUTHORING_PURPOSES: ReadonlySet<string> = new Set<ActivatedAuthoringPurpose>([
    "attendance.service_day_exception",
]);

export function isActivatedAuthoringPurpose(purpose: string | null | undefined): boolean {
    if (!purpose) return false;
    return ACTIVATED_AUTHORING_PURPOSES.has(purpose.trim());
}
