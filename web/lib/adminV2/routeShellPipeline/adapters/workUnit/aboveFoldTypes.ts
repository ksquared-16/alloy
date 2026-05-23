import type { ActionsVm } from "@/lib/ui-v2/workspace-types";

export const WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX = "__attention_bucket:";

export type WorkUnitAboveFoldSlotState = "skeleton" | "ready";

export type WorkUnitAboveFoldChipCount = "skeleton" | "emdash" | number;

export type WorkUnitAboveFoldChip = {
    key: string;
    label: string;
    priority: "standard" | "attention" | "critical";
    selected: boolean;
    count: WorkUnitAboveFoldChipCount;
    counts_deferred?: boolean;
    synthetic_attention_bucket?: boolean;
    attention_bucket_raw_key?: string | null;
    description?: string;
};

export type WorkUnitAboveFoldChipSection = {
    key: string;
    label: string;
    chips: WorkUnitAboveFoldChip[];
};

export type WorkUnitAboveFoldHeaderSlot = {
    visible: boolean;
    state: WorkUnitAboveFoldSlotState;
    sections: WorkUnitAboveFoldChipSection[];
    error_message?: string | null;
    active_queue_description?: string | null;
    show_other_pill?: boolean;
    other_pill?: {
        selected: boolean;
        count: number | "emdash";
        all_records_queue_key: string;
    } | null;
};

export type WorkUnitAboveFoldActionsRailSlot = {
    visible: boolean;
    state: WorkUnitAboveFoldSlotState;
    actions_rail: ActionsVm;
};

export type WorkUnitAboveFoldQueueLaneSlot = {
    visible: boolean;
    state: WorkUnitAboveFoldSlotState;
    skeleton_row_count: number;
};

/**
 * Atomic above-fold composition for work-unit route — header, actions rail, and queue lane
 * mount together; slots stay visible and hydrate in place (drawer-style).
 */
export type WorkUnitAboveFoldRenderModel = {
    header: WorkUnitAboveFoldHeaderSlot;
    actions_rail: WorkUnitAboveFoldActionsRailSlot;
    queue_lane: WorkUnitAboveFoldQueueLaneSlot;
};

export type WorkUnitAboveFoldStructureKey = "header" | "actions_rail" | "queue_lane";

export function workUnitAboveFoldStructureKeys(model: WorkUnitAboveFoldRenderModel): WorkUnitAboveFoldStructureKey[] {
    const keys: WorkUnitAboveFoldStructureKey[] = [];
    if (model.header.visible) keys.push("header");
    if (model.actions_rail.visible) keys.push("actions_rail");
    if (model.queue_lane.visible) keys.push("queue_lane");
    return keys;
}

/** All above-fold slots mounted with skeleton or ready — not omitted, not swapped. */
export function workUnitAboveFoldAtomicPaintReady(model: WorkUnitAboveFoldRenderModel): boolean {
    return (
        model.header.visible &&
        model.actions_rail.visible &&
        model.queue_lane.visible &&
        (model.header.state === "skeleton" || model.header.state === "ready") &&
        (model.actions_rail.state === "skeleton" || model.actions_rail.state === "ready") &&
        (model.queue_lane.state === "skeleton" || model.queue_lane.state === "ready")
    );
}

export function workUnitAboveFoldQueueRowsLoading(model: WorkUnitAboveFoldRenderModel): boolean {
    return model.queue_lane.visible && model.queue_lane.state === "skeleton";
}
