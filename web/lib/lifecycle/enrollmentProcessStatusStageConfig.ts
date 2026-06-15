/**
 * Build enrollment process stage ↔ status buckets for Settings API + hub.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { hasProcessStageMetadataOverride, parseProcessStageKeyFromStatusMetadata } from "@/lib/businessProcesses/processStageMetadata";
import {
    effectiveEnrollmentOperatorStage,
    effectiveStageKeyAssignment,
    type EnrollmentOperatorStageAssignmentSource,
} from "@/lib/lifecycle/enrollmentOperatorStage";

export type EnrollmentStatusStageRow = {
    status_key: string;
    status_label: string;
    sort_order: number;
    assignment_source: EnrollmentOperatorStageAssignmentSource;
    has_metadata_override: boolean;
};

export type EnrollmentStatusStagesPayload = {
    entity_type: "opportunities";
    stages: Record<
        string,
        {
            statuses: EnrollmentStatusStageRow[];
            has_custom_assignments: boolean;
        }
    >;
    unassigned: EnrollmentStatusStageRow[];
    stage_keys: string[];
};

type StatusInput = {
    status_key: string;
    status_label: string | null;
    sort_order: number;
    metadata: Record<string, unknown> | null;
};

function toRow(
    row: StatusInput,
    assignment_source: EnrollmentOperatorStageAssignmentSource
): EnrollmentStatusStageRow {
    const metadata = row.metadata ?? null;
    return {
        status_key: row.status_key,
        status_label: row.status_label?.trim() || row.status_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        sort_order: row.sort_order,
        assignment_source,
        has_metadata_override: hasProcessStageMetadataOverride(metadata),
    };
}

export function buildEnrollmentStatusStagesPayload(
    rows: StatusInput[],
    stageKeys: readonly string[] = LIFECYCLE_STAGE_ORDER
): EnrollmentStatusStagesPayload {
    const keys = stageKeys.length ? [...stageKeys] : [...LIFECYCLE_STAGE_ORDER];
    const stages = Object.fromEntries(
        keys.map((stage) => [stage, { statuses: [] as EnrollmentStatusStageRow[], has_custom_assignments: false }])
    ) as EnrollmentStatusStagesPayload["stages"];

    const unassigned: EnrollmentStatusStageRow[] = [];

    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.status_key.localeCompare(b.status_key));

    for (const row of sorted) {
        const { stage, source } = effectiveStageKeyAssignment(row.status_key, row.metadata, keys);
        const item = toRow(row, source);
        if (stage && stages[stage]) {
            stages[stage].statuses.push(item);
            const metaStage = parseProcessStageKeyFromStatusMetadata(row.metadata);
            if (typeof metaStage === "string" && metaStage !== "unassigned" && metaStage === stage) {
                stages[stage].has_custom_assignments = true;
            }
        } else {
            unassigned.push(item);
        }
    }

    return {
        entity_type: "opportunities",
        stages,
        unassigned,
        stage_keys: keys,
    };
}
