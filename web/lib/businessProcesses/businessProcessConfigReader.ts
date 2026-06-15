/**
 * Generic Business Process config reader — metadata-driven, no template imports.
 */

import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
    LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { parseProcessTracksV1 } from "@/lib/businessProcesses/parseProcessTracksV1";
import type { ProcessSplitRuleV1, ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";

export function processHasTracksConfigured(
    process: LifecycleBuilderProcessRecord | null | undefined,
): boolean {
    if (!process?.tracks_v1) return false;
    return parseProcessTracksV1(process.tracks_v1) != null;
}

export function readProcessTracks(
    process: LifecycleBuilderProcessRecord | null | undefined,
): ProcessTracksV1 | null {
    if (!process?.tracks_v1) return null;
    return parseProcessTracksV1(process.tracks_v1);
}

export function stagesForTrack(
    process: LifecycleBuilderProcessRecord,
    trackKey: string,
): LifecycleBuilderStageRecord[] {
    const key = trackKey.trim();
    return process.stages
        .filter((s) => s.is_active && s.track_key === key)
        .sort((a, b) => a.sort_order - b.sort_order);
}

export function trackKeyForStage(
    process: LifecycleBuilderProcessRecord,
    stageKey: string,
): string | null {
    const stage = process.stages.find((s) => s.key === stageKey.trim() && s.is_active);
    return stage?.track_key?.trim() ?? null;
}

export function splitRuleForStage(
    process: LifecycleBuilderProcessRecord,
    stageKey: string,
): ProcessSplitRuleV1 | null {
    const tracks = readProcessTracks(process);
    if (!tracks) return null;
    const key = stageKey.trim();
    return tracks.split_rules.find((r) => r.from_stage_key === key) ?? null;
}

/** True when any active process in department metadata has configured tracks_v1. */
export function businessProcessTracksConfigured(departmentMetadata: unknown): boolean {
    if (departmentMetadata == null || typeof departmentMetadata !== "object" || Array.isArray(departmentMetadata)) {
        return false;
    }
    const builderRaw = (departmentMetadata as Record<string, unknown>)[LIFECYCLE_BUILDER_METADATA_KEY];
    if (builderRaw == null || typeof builderRaw !== "object" || Array.isArray(builderRaw)) return false;
    const processes = (builderRaw as Record<string, unknown>).processes;
    if (!Array.isArray(processes)) return false;
    for (const p of processes) {
        if (p == null || typeof p !== "object" || Array.isArray(p)) continue;
        const row = p as Record<string, unknown>;
        if (row.is_active === false) continue;
        if (parseProcessTracksV1(row.tracks_v1)) return true;
    }
    return false;
}

export function activeProcessFromConfig(
    config: LifecycleBuilderV1,
): LifecycleBuilderProcessRecord | null {
    if (!config.active_process_id) return null;
    return (
        config.processes.find((p) => p.id === config.active_process_id && p.is_active) ??
        config.processes.find((p) => p.is_active) ??
        null
    );
}

export function activeProcessFromDepartmentMetadata(
    departmentMetadata: unknown,
): LifecycleBuilderProcessRecord | null {
    const config = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    return activeProcessFromConfig(config);
}
