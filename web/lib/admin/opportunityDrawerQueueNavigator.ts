import {
    opportunityDrawerSeedFromQueueItem,
    type OpportunityDrawerQueuePreviewSeed,
} from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

/** Loaded work-unit queue slice — used for in-drawer prev/next (no full-queue fetch). */
export type OpportunityDrawerQueueNavigator = {
    work_unit_id: string;
    department_id: string;
    queue_key: string;
    records: Array<{ id: string; preview_seed?: OpportunityDrawerQueuePreviewSeed | null }>;
    /** Queue summary total when known (may exceed `records.length`). */
    total_count?: number | null;
    /** Bumps when the source row list changes — adjacent prefetch ignores stale generations. */
    generation: number;
    /** Bumps on each in-drawer prev/next — rolls adjacent prefetch forward. */
    drawer_nav_generation?: number;
};

export type QueueNavigatorPosition = {
    index: number;
    /** 1-based position for UI label. */
    position: number;
    total: number;
    has_prev: boolean;
    has_next: boolean;
    prev_id: string | null;
    next_id: string | null;
};

export function opportunityDrawerQueueNavigatorRecordIds(
    navigator: OpportunityDrawerQueueNavigator | null | undefined
): string[] {
    if (!navigator?.records?.length) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const row of navigator.records) {
        const id = row.id.trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

export function resolveOpportunityQueueNavigatorPosition(
    currentRecordId: string,
    navigator: OpportunityDrawerQueueNavigator | null | undefined
): QueueNavigatorPosition | null {
    const ids = opportunityDrawerQueueNavigatorRecordIds(navigator);
    const current = currentRecordId.trim();
    if (!current || !ids.length) return null;
    const index = ids.indexOf(current);
    if (index < 0) return null;
    const total =
        typeof navigator?.total_count === "number" && navigator.total_count >= ids.length
            ? navigator.total_count
            : ids.length;
    return {
        index,
        position: index + 1,
        total,
        has_prev: index > 0,
        has_next: index < ids.length - 1,
        prev_id: index > 0 ? ids[index - 1]! : null,
        next_id: index < ids.length - 1 ? ids[index + 1]! : null,
    };
}

export function resolveOpportunityQueueNavigateTargetId(
    direction: "prev" | "next",
    currentRecordId: string,
    navigator: OpportunityDrawerQueueNavigator | null | undefined
): string | null {
    const pos = resolveOpportunityQueueNavigatorPosition(currentRecordId, navigator);
    if (!pos) return null;
    return direction === "prev" ? pos.prev_id : pos.next_id;
}

export function buildOpportunityDrawerQueueNavigatorFromDisplayItems(params: {
    work_unit_id: string;
    department_id: string;
    queue_key: string;
    displayItems: QueuePreviewItemVm[];
    total_count?: number | null;
    generation: number;
}): OpportunityDrawerQueueNavigator | null {
    const records: OpportunityDrawerQueueNavigator["records"] = [];
    const seen = new Set<string>();
    for (const item of params.displayItems) {
        const id = String(item.id ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        records.push({ id, preview_seed: opportunityDrawerSeedFromQueueItem(item) });
    }
    if (!records.length) return null;
    return {
        work_unit_id: params.work_unit_id,
        department_id: params.department_id,
        queue_key: params.queue_key,
        records,
        total_count: params.total_count ?? records.length,
        generation: params.generation,
    };
}

export function previewSeedForQueueNavigatorRecord(
    navigator: OpportunityDrawerQueueNavigator | null | undefined,
    recordId: string
): OpportunityDrawerQueuePreviewSeed | null | undefined {
    const id = recordId.trim();
    if (!id || !navigator?.records?.length) return undefined;
    return navigator.records.find((r) => r.id.trim() === id)?.preview_seed ?? undefined;
}
