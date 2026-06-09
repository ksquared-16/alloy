import type { WorkUnitQueueSelection } from "@/lib/adminV2/workUnitQueueSelection";
import {
    workUnitActivePillKeyFromSelection,
    workUnitQueuePillKeysEquivalent,
    workUnitQueueSelectionFetchQueueKey,
} from "@/lib/adminV2/workUnitQueueSelection";
import {
    opportunityDrawerSeedFromQueueItem,
    type OpportunityDrawerQueuePreviewSeed,
} from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import { opportunityDrawerSubjectContextFromQueueItem } from "@/lib/admin/opportunityDrawerSubjectContextFromQueueItem";
import type { DrawerSubjectContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

/** Loaded work-unit queue slice — used for in-drawer prev/next (no full-queue fetch). */
export type OpportunityDrawerQueueNavigator = {
    work_unit_id: string;
    department_id: string;
    /** API queue key for the filtered lane (not synthetic pill keys). */
    queue_key: string;
    /** Canonical filter context for this navigator instance. */
    selection: WorkUnitQueueSelection;
    records: Array<{
        id: string;
        preview_seed?: OpportunityDrawerQueuePreviewSeed | null;
        drawer_subject_context?: DrawerSubjectContext | null;
    }>;
    /** Ordered ids from the loaded filtered page — same order as `records`. */
    loaded_record_ids_in_order: string[];
    /** Queue summary total when known (may exceed `records.length`). */
    total_count?: number | null;
    /** Bumps when the source row list / filter changes — adjacent prefetch ignores stale generations. */
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
    selection: WorkUnitQueueSelection;
    displayItems: QueuePreviewItemVm[];
    total_count?: number | null;
    generation: number;
}): OpportunityDrawerQueueNavigator | null {
    const records: OpportunityDrawerQueueNavigator["records"] = [];
    const loaded_record_ids_in_order: string[] = [];
    const seen = new Set<string>();
    for (const item of params.displayItems) {
        const id = String(item.id ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        loaded_record_ids_in_order.push(id);
        records.push({
            id,
            preview_seed: opportunityDrawerSeedFromQueueItem(item),
            drawer_subject_context: opportunityDrawerSubjectContextFromQueueItem(item),
        });
    }
    if (!records.length) return null;
    return {
        work_unit_id: params.work_unit_id,
        department_id: params.department_id,
        queue_key: params.queue_key,
        selection: params.selection,
        records,
        loaded_record_ids_in_order,
        total_count: params.total_count ?? records.length,
        generation: params.generation,
    };
}

/** True when loaded queue rows match the navigator's canonical filter selection. */
export function opportunityDrawerNavigatorMatchesWorkUnitSelection(params: {
    selection: WorkUnitQueueSelection;
    selected_pill_key: string | null;
    loaded_queue_key: string | null;
    attention_bucket_key: string;
    work_unit?: { queue_definition?: unknown } | null;
}): boolean {
    const wu = params.work_unit ?? null;
    const pill = workUnitActivePillKeyFromSelection(params.selection);
    const selectedPill = params.selected_pill_key?.trim() ?? "";
    if (selectedPill !== pill && !workUnitQueuePillKeysEquivalent(wu, selectedPill, pill)) return false;
    const fetchKey = workUnitQueueSelectionFetchQueueKey(params.selection, wu);
    if (params.loaded_queue_key?.trim() !== fetchKey) return false;
    if (fetchKey.toLowerCase() === "needs_attention") {
        return (params.attention_bucket_key ?? "").trim() === (params.selection.attentionBucketKey ?? "").trim();
    }
    return true;
}

export function previewSeedForQueueNavigatorRecord(
    navigator: OpportunityDrawerQueueNavigator | null | undefined,
    recordId: string
): OpportunityDrawerQueuePreviewSeed | null | undefined {
    const id = recordId.trim();
    if (!id || !navigator?.records?.length) return undefined;
    return navigator.records.find((r) => r.id.trim() === id)?.preview_seed ?? undefined;
}

export function drawerSubjectContextForQueueNavigatorRecord(
    navigator: OpportunityDrawerQueueNavigator | null | undefined,
    recordId: string,
): DrawerSubjectContext | null | undefined {
    const id = recordId.trim();
    if (!id || !navigator?.records?.length) return undefined;
    return navigator.records.find((r) => r.id.trim() === id)?.drawer_subject_context ?? undefined;
}
