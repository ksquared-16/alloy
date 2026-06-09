/**
 * Phase C — read queue_membership_v1 in QueueService when enabled.
 *
 * `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=1` — builder metadata drives lane routing
 * when valid config exists. Default unset → legacy / child-grain flag only.
 */

export function isQueueMembershipFromBuilderEnabled(): boolean {
    const raw = process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
    if (raw == null) return false;
    const trimmed = raw.trim().toLowerCase();
    return trimmed === "1" || trimmed === "true";
}

/** Env snapshot for tests. */
export function readQueueMembershipFromBuilderFlagFromEnv(): boolean {
    return isQueueMembershipFromBuilderEnabled();
}
