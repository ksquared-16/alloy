/**
 * Draft helpers for perspectives_v1 editor (Configuration Runtime Phase 2B).
 */

import type { PerspectiveLaneSource } from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
import {
    coercePerspectivesV1ForLanes,
    normalizePerspectivesV1ForPersist,
    parsePerspectivesV1,
    perspectivesV1Equal,
    type PerspectiveConfigV1,
    type PerspectiveConfigV1Stored,
} from "@/lib/lifecycle/perspectiveConfigV1";

export type PerspectiveEditorDraftRow = PerspectiveConfigV1 & {
    grain?: string;
    foundInDefinition: boolean;
};

function defaultMissionForLane(lane: PerspectiveLaneSource): string {
    if (lane.description?.trim()) return lane.description.trim();
    return `Work ${lane.label.toLowerCase()} records in this stage.`;
}

export function perspectiveDraftFromLanesAndSaved(
    lanes: readonly PerspectiveLaneSource[],
    saved: readonly PerspectiveConfigV1Stored[] | null | undefined,
): PerspectiveEditorDraftRow[] {
    const laneKeys = lanes.map((lane) => lane.queueKey);
    const coerced = coercePerspectivesV1ForLanes(saved, laneKeys);
    const savedByKey = new Map(coerced.map((row) => [row.queue_key, row]));

    return lanes.map((lane) => {
        const stored = savedByKey.get(lane.queueKey);
        return {
            queue_key: lane.queueKey,
            label: stored?.label?.trim() || lane.label.trim() || lane.queueKey,
            mission: stored?.mission?.trim() || defaultMissionForLane(lane),
            visible_in_rail: stored?.visible_in_rail ?? true,
            display_order: stored?.display_order ?? lane.defaultDisplayOrder,
            grain: lane.grain,
            foundInDefinition: lane.foundInDefinition,
        };
    });
}

export function perspectiveDraftToPersisted(
    draft: readonly PerspectiveEditorDraftRow[],
    lanes: readonly PerspectiveLaneSource[],
): PerspectiveConfigV1Stored[] {
    const laneKeys = lanes.map((lane) => lane.queueKey);
    const normalized = normalizePerspectivesV1ForPersist(draft, laneKeys);
    return parsePerspectivesV1(normalized) ?? [];
}

export function perspectiveDraftDirty(
    saved: readonly PerspectiveConfigV1Stored[] | null | undefined,
    draft: readonly PerspectiveEditorDraftRow[],
    lanes: readonly PerspectiveLaneSource[],
): boolean {
    const baseline = perspectiveDraftFromLanesAndSaved(lanes, saved);
    const persistedDraft = perspectiveDraftToPersisted(draft, lanes);
    const persistedBaseline = perspectiveDraftToPersisted(baseline, lanes);
    return !perspectivesV1Equal(persistedBaseline, persistedDraft);
}
