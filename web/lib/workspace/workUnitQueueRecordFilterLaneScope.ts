import { loadQueueDefinitionBundle, resolveQueueKeyFromDefinition } from "@/lib/config/queueDefinitionV2Runtime";
import type { WorkUnitQueueRecordFilterState } from "@/lib/workspace/workUnitQueueRecordFilterTypes";

/** Status keys declared on the active lane's queue definition filters (v1 execution shape). */
export function resolveWorkUnitLaneStatusFilterValues(
    wu: { queue_definition?: unknown } | null | undefined,
    queueOrPillKey: string | null | undefined
): string[] {
    const pill = (queueOrPillKey ?? "").trim();
    if (!wu?.queue_definition || !pill) return [];
    try {
        const bundle = loadQueueDefinitionBundle(wu.queue_definition);
        const resolution = resolveQueueKeyFromDefinition(pill, bundle.normalized.queues);
        const laneKey = resolution.resolvedKey.trim() || pill;
        const q = bundle.def.queues.find((row) => row.key === laneKey);
        if (!q) return [];
        const keys = new Set<string>();
        for (const f of q.filters) {
            if (f.type === "status" && f.operator === "in") {
                for (const v of f.values ?? []) {
                    if (typeof v === "string" && v.trim()) keys.add(v.trim().toLowerCase());
                }
            }
        }
        return [...keys];
    } catch {
        return [];
    }
}

/** Drop lane-local filters when the operator changes queue pills. */
export function clearLaneScopedWorkUnitRecordFilters(
    filters: WorkUnitQueueRecordFilterState
): WorkUnitQueueRecordFilterState {
    if (!filters.statusKey.trim() && !filters.attentionReasonCode.trim()) return filters;
    return {
        ...filters,
        statusKey: "",
        attentionReasonCode: "",
    };
}

/**
 * Remove a stale status filter when it cannot apply to the active lane
 * (e.g. `rf_status=new_inquiry` while viewing Tours / `tour_scheduled`).
 */
export function sanitizeWorkUnitRecordFiltersForLane(
    filters: WorkUnitQueueRecordFilterState,
    allowedStatusKeys: ReadonlyArray<string>
): WorkUnitQueueRecordFilterState {
    const sk = filters.statusKey.trim();
    if (!sk || allowedStatusKeys.length === 0) return filters;
    const allowed = new Set(allowedStatusKeys.map((k) => k.trim().toLowerCase()).filter(Boolean));
    if (allowed.has(sk.toLowerCase())) return filters;
    return { ...filters, statusKey: "" };
}
