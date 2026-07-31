/**
 * Reading `status_rollup_v1` off a builder stage.
 *
 * The writer that lived here (`persistStatusRollupForLifecycleStageSave`) issued its own
 * whole-column `UPDATE departments.metadata` and is gone. Authoring now happens in memory via
 * `applyStatusRollupDraft` (lib/lifecycle/stageDraftTransforms.ts) and reaches storage through the
 * one draft write the stage save performs. The status_definitions side of that helper is now an
 * explicit companion write in the orchestrator, where its failure can be reported instead of
 * being entangled with a configuration write.
 */

import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    parseStatusRollupV1,
    STATUS_ROLLUP_METADATA_KEY,
    type StatusRollupV1,
} from "@/lib/lifecycle/statusRollupV1";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

export function readStatusRollupFromStageContainer(container: unknown): StatusRollupV1 | null {
    if (!isRecord(container)) return null;
    return parseStatusRollupV1(container[STATUS_ROLLUP_METADATA_KEY]);
}

export function readStatusRollupFromDepartmentMetadata(
    metadata: Record<string, unknown> | null,
    stageKey: string
): StatusRollupV1 | null {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stage = process?.stages.find((s) => s.key === stageKey.trim() && s.is_active);
    if (!stage) return null;
    return readStatusRollupFromStageContainer(stage);
}
