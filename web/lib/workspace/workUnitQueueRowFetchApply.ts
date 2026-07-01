/**
 * Pure apply guards for work-unit queue row fetches — stale in-flight responses must not overwrite the active lane.
 */

export function shouldApplyWorkUnitQueueRowsResponse(args: {
    requestSeq: number;
    latestRequestSeq: number;
    stillSelected: boolean;
}): { apply: boolean; skippedReason: string | null } {
    if (args.requestSeq !== args.latestRequestSeq) {
        return { apply: false, skippedReason: "stale_request_seq" };
    }
    if (!args.stillSelected) {
        return { apply: false, skippedReason: "lane_changed" };
    }
    return { apply: true, skippedReason: null };
}

/** Buffered preview rows may only mask loading when they belong to the active pill lane. */
export function queueRowsBufferMatchesActiveLane(
    bufferQueueKey: string | null,
    activeQueueKey: string,
    keysEquivalent: (a: string, b: string) => boolean
): boolean {
    const active = activeQueueKey.trim();
    const buffered = (bufferQueueKey ?? "").trim();
    if (!active || !buffered) return false;
    return keysEquivalent(buffered, active);
}
