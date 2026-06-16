/**
 * Generic status → process stage rollup assignment (metadata-driven).
 */

import {
    parseProcessStageKeyFromStatusMetadata,
    PROCESS_STAGE_UNASSIGNED,
} from "@/lib/businessProcesses/processStageMetadata";
import {
    legacyCanonicalProcessStageForStatusKey,
    legacyGranularProcessStageForStatusKey,
} from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";

export type ProcessStageAssignmentSource = "metadata" | "legacy_canonical" | "unassigned";

/** Resolve which configured builder stage a status belongs to. */
export function resolveStatusProcessStageAssignment(
    statusKey: string,
    metadata: Record<string, unknown> | null | undefined,
    configuredStageKeys: readonly string[],
): { stage: string | null; source: ProcessStageAssignmentSource } {
    const parsed = parseProcessStageKeyFromStatusMetadata(metadata);
    if (parsed === PROCESS_STAGE_UNASSIGNED) {
        return { stage: null, source: "unassigned" };
    }
    if (typeof parsed === "string" && configuredStageKeys.includes(parsed)) {
        return { stage: parsed, source: "metadata" };
    }

    const legacy = legacyCanonicalProcessStageForStatusKey(statusKey);
    if (legacy && configuredStageKeys.includes(legacy)) {
        return { stage: legacy, source: "legacy_canonical" };
    }

    const granular = legacyGranularProcessStageForStatusKey(statusKey);
    if (granular && configuredStageKeys.includes(granular)) {
        return { stage: granular, source: "legacy_canonical" };
    }

    return { stage: null, source: "unassigned" };
}
