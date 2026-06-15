/**
 * Stage status rollup — subject grain, entity type, and picker rows for Business Processes.
 */

import {
    ENROLLMENT_CHILD_STAGE_SPECS,
    ENROLLMENT_TRACK_CHILD_KEY,
    ENROLLMENT_TRACK_FAMILY_KEY,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { parseProcessStageKeyFromStatusMetadata } from "@/lib/businessProcesses/processStageMetadata";
import type { EnrollmentStatusStageRow } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import type { QueueMembershipStatusOption } from "@/lib/lifecycle/loadQueueMembershipStatusOptions";
import type {
    QueueMembershipCountUnit,
    QueueMembershipSubjectType,
} from "@/lib/lifecycle/queueMembershipV1";

export type StageStatusEntityType = "opportunities" | "opportunity_customer_members";

const CHILD_STAGE_KEYS = new Set<string>(ENROLLMENT_CHILD_STAGE_SPECS.map((s) => s.key));

export function stageTrackKeyFromRecord(
    stageKey: string,
    trackKey?: string | null
): string | null {
    const tk = trackKey?.trim();
    if (tk) return tk;
    return CHILD_STAGE_KEYS.has(stageKey.trim()) ? ENROLLMENT_TRACK_CHILD_KEY : ENROLLMENT_TRACK_FAMILY_KEY;
}

export function defaultSubjectTypeForStage(stageKey: string, trackKey?: string | null): QueueMembershipSubjectType {
    const track = stageTrackKeyFromRecord(stageKey, trackKey);
    if (track === ENROLLMENT_TRACK_CHILD_KEY) return "child";
    if (stageKey.trim() === "waitlist") return "candidate";
    return "case";
}

export function statusEntityTypeForSubject(subject: QueueMembershipSubjectType): StageStatusEntityType {
    return subject === "case" ? "opportunities" : "opportunity_customer_members";
}

export function statusEntityTypeForStage(stageKey: string, trackKey?: string | null): StageStatusEntityType {
    return statusEntityTypeForSubject(defaultSubjectTypeForStage(stageKey, trackKey));
}

/** Deduped count-unit options valid for the selected subject. */
export function countUnitsForSubject(subject: QueueMembershipSubjectType): QueueMembershipCountUnit[] {
    switch (subject) {
        case "case":
            return ["cases"];
        case "child":
            return ["enrollment_tracks"];
        case "candidate":
            return ["candidates"];
    }
}

export function queueMembershipStatusOptionsToStageRows(
    options: readonly QueueMembershipStatusOption[]
): EnrollmentStatusStageRow[] {
    return options.map((o) => ({
        status_key: o.status_key,
        status_label: o.status_label,
        sort_order: o.sort_order,
        assignment_source: "metadata" as const,
        has_metadata_override: false,
    }));
}

export function assignedStatusKeysFromMetadataRows(
    rows: readonly { status_key: string; metadata: Record<string, unknown> | null }[],
    stageKey: string
): string[] {
    const sk = stageKey.trim();
    if (!sk) return [];
    return rows
        .filter((r) => parseProcessStageKeyFromStatusMetadata(r.metadata) === sk)
        .map((r) => r.status_key);
}

export function statusesSettingsHrefForEntity(entityType: StageStatusEntityType): string {
    return entityType === "opportunities"
        ? "/admin/settings/statuses?entity_type=opportunities"
        : "/admin/settings/statuses?entity_type=opportunity_customer_members";
}
