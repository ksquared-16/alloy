/**
 * GOVERNED SCHEDULED WORK — the contract three domains share.
 *
 * "Governed" here means registered execution authority, durable admission and an
 * audited attempt — NOT a human approving every occurrence. A schedule is
 * established through its own domain's authority, with whatever confirmation that
 * domain requires; once it exists, the clock may wake it. Requiring approval per
 * occurrence would mean Autopay and automatic Billing are not automatic, which is
 * the point of having them.
 */

/** Only registered code runs. Never a URL, never configuration-supplied. */
export type ScheduledWorkHandlerKey = string;

export type ScheduledWorkContext = {
    scheduledWorkId: string;
    occurrenceId: string;
    orgId: string | null;
    handlerKey: ScheduledWorkHandlerKey;
    dueAt: string;
    /** Distinguishes THIS try from other tries at the same occurrence. */
    attemptNumber: number;
    workerId: string;
    /** Opaque. The scheduler stored it and hands it back; it never reads inside. */
    domainRef: Record<string, unknown>;
};

/**
 * The three outcomes, and the distinction that matters most:
 *
 * COMPLETED includes a DOMAIN NO-OP. Billing evaluating and finding nothing due,
 * aging finding no qualifying charge, autopay finding a zero collectible — each is
 * a successful scheduler execution. Treating "nothing to do" as failure would fill
 * the failure surface with healthy days and teach operators to ignore it.
 *
 * RETRYABLE_FAILURE is infrastructure: the runtime could not complete the attempt.
 *
 * TERMINAL_FAILURE is the handler saying this occurrence cannot succeed. Generic
 * retry stops; the occurrence stays visible.
 */
export type ScheduledWorkOutcomeKind = "completed" | "retryable_failure" | "terminal_failure";

export type ScheduledWorkOutcome = {
    kind: ScheduledWorkOutcomeKind;
    /** Operator-safe. Never a stack trace, never a secret. */
    reason?: string;
    diagnostic?: Record<string, unknown>;
    /**
     * A domain that computes its own cadence returns the next moment here.
     * The scheduler stores it without understanding why.
     */
    nextDueAt?: string | null;
};

export type ScheduledWorkHandler = (
    ctx: ScheduledWorkContext,
) => Promise<ScheduledWorkOutcome>;

export type RecurrenceKind = "one_time" | "daily" | "interval" | "domain_computed";

/** Bounded, per the V1 decision: an initial run plus three infrastructure retries. */
export const SCHEDULED_WORK_MAX_ATTEMPTS = 4;

/** Increasing delay. Not indefinite — exhausting the budget is terminal. */
export function retryDelaySeconds(attemptNumber: number): number {
    return [60, 300, 900][Math.min(Math.max(attemptNumber, 1), 3) - 1]!;
}

/**
 * The next due moment for a generic recurrence.
 *
 * `domain_computed` returns null: that domain told us, or will, and guessing on
 * its behalf is how a scheduler starts owning economics it cannot reason about.
 */
export function computeNextDueAt(
    kind: RecurrenceKind,
    dueAt: string,
    intervalSeconds: number | null,
): string | null {
    const base = new Date(dueAt).getTime();
    if (Number.isNaN(base)) return null;
    if (kind === "daily") return new Date(base + 86_400_000).toISOString();
    if (kind === "interval" && intervalSeconds && intervalSeconds > 0) {
        return new Date(base + intervalSeconds * 1000).toISOString();
    }
    // one_time is finished; domain_computed is not ours to compute.
    return null;
}
