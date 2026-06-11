import { workUnitQueuePillKeysEquivalent } from "@/lib/adminV2/workUnitQueueSelection";

export type WorkUnitQueueLaneOwnershipArgs = {
    workUnitId: string;
    activeWorkUnitId: string;
    activeQueueKey: string;
    queueItems: { queue?: { key?: string } } | null;
    queueDefinition?: unknown;
};

/** Row payload belongs to the active work-unit lane — never paint stale rows under a new pill. */
export function queuePayloadMatchesActiveLane(args: WorkUnitQueueLaneOwnershipArgs): boolean {
    const { queueItems, workUnitId, activeWorkUnitId, activeQueueKey, queueDefinition } = args;
    if (!queueItems?.queue || !activeQueueKey.trim()) return false;
    if (String(workUnitId).trim() !== String(activeWorkUnitId).trim()) return false;
    const payloadKey = String(queueItems.queue.key ?? "").trim();
    if (!payloadKey) return false;
    if (payloadKey === activeQueueKey) return true;
    return workUnitQueuePillKeysEquivalent(
        queueDefinition ? { queue_definition: queueDefinition } : null,
        payloadKey,
        activeQueueKey
    );
}
