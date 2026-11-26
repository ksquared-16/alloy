/**
 * Bounded retry for READ-ONLY certification reads that cross the network.
 *
 * WHY THIS EXISTS, NARROWLY. One of two back-to-back full driver runs failed because P_handoff
 * could not READ the hosted certification database — `TypeError: fetch failed`. Nothing about the
 * product was wrong; the transport dropped. The phase refused rather than converting an unreadable
 * result into a false "zero operational outputs" N/A, which was correct, and the cost was a
 * repeatability verdict that reflected the network rather than the software.
 *
 * WHAT IT MUST NEVER DO. A retry that widens into "try again until it looks right" would destroy
 * the one invariant P_handoff exists to protect: with the handoff gate ON, zero operational outputs
 * is a FAILURE, and no amount of retrying may turn it into a pass. So this retries TRANSPORT
 * failures only — the cases where no authoritative application answer was ever received — and
 * treats every answered read as final, including an answer of zero rows.
 *
 * It is deliberately not general infrastructure. It wraps reads. It never wraps a write, never
 * re-executes Complete Enrollment, and never re-runs a phase.
 */

/** Total attempts, including the first. Small and fixed: a flaky link, not a broken service. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Transport failures, which carry no application answer.
 *
 * Matched on the message because that is what the client surfaces; each entry is a failure where
 * the request did not reach a verdict, so repeating it can legitimately produce a different one.
 */
const TRANSIENT_PATTERNS: readonly RegExp[] = [
    /fetch failed/i,
    /network|socket hang up/i,
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND/i,
    /connection (reset|refused|closed|terminated)/i,
    /timed? ?out/i,
    /service unavailable|bad gateway|gateway timeout/i,
];

/**
 * Deterministic failures, which DID produce an authoritative answer.
 *
 * Checked FIRST and never retried. A schema error retried three times is a schema error reported
 * three times later; an authorization failure retried is an authorization failure that looks
 * intermittent. Both mislead, and both are the product telling us something true.
 */
const DETERMINISTIC_PATTERNS: readonly RegExp[] = [
    /permission denied|not authorized|unauthorized|forbidden|row-level security|JWT|API key/i,
    /does not exist|unknown column|undefined column|schema|relation .* does not exist/i,
    /invalid input syntax|syntax error|malformed|violates .* constraint/i,
];

/** Is this failure worth attempting again, or is it the answer? */
export function isTransientReadFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (!message) return false;
    // Deterministic wins: a message that names a real product answer is never retried, even if it
    // also happens to contain a word like "connection".
    if (DETERMINISTIC_PATTERNS.some((rx) => rx.test(message))) return false;
    return TRANSIENT_PATTERNS.some((rx) => rx.test(message));
}

export type BoundedReadResult<T> =
    | { ok: true; value: T; attempts: number; transientErrors: string[] }
    | { ok: false; error: string; attempts: number; transientErrors: string[]; deterministic: boolean };

/**
 * Run a read up to `maxAttempts` times, retrying ONLY transport failures.
 *
 * The transient is reported even when a later attempt succeeds. Hiding it would make a degrading
 * link invisible until it failed permanently, and the whole reason this exists is that a network
 * blip was indistinguishable from a product verdict.
 *
 * `read` may signal failure by throwing OR by returning `{ error }` — the Supabase client does the
 * latter — so both are classified the same way.
 */
export async function boundedRead<T>(
    read: () => Promise<T>,
    options: {
        maxAttempts?: number;
        /** Reports a failure carried in the RESULT rather than thrown. */
        errorOf?: (value: T) => string | null;
        /** Injected for tests; production waits briefly between attempts. */
        sleep?: (ms: number) => Promise<void>;
    } = {},
): Promise<BoundedReadResult<T>> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    const errorOf = options.errorOf ?? (() => null);
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const transientErrors: string[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let failure: unknown = null;
        try {
            const value = await read();
            const carried = errorOf(value);
            if (!carried) {
                return { ok: true, value, attempts: attempt, transientErrors };
            }
            failure = new Error(carried);
        } catch (e) {
            failure = e;
        }

        const message = failure instanceof Error ? failure.message : String(failure);
        if (!isTransientReadFailure(failure)) {
            // An authoritative answer. Reported as it stands, on the attempt that produced it.
            return { ok: false, error: message, attempts: attempt, transientErrors, deterministic: true };
        }
        transientErrors.push(message);
        if (attempt < maxAttempts) {
            // Short and fixed. Long backoff here would only make a broken link fail slower.
            await sleep(250 * attempt);
        }
    }

    return {
        ok: false,
        error: transientErrors[transientErrors.length - 1] ?? "read failed",
        attempts: maxAttempts,
        transientErrors,
        deterministic: false,
    };
}
