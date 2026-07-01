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
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import type {
    QueueMembershipCountUnit,
    QueueMembershipSubjectType,
    QueueMembershipV1,
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
    const sk = stageKey.trim();
    if (sk === "waitlist") return "candidate";

    const templateDefault = defaultEnrollmentQueueMembershipForStage(sk);
    if (templateDefault?.subject_type) return templateDefault.subject_type;

    const track = stageTrackKeyFromRecord(sk, trackKey);
    if (track === ENROLLMENT_TRACK_CHILD_KEY) return "child";
    return "case";
}

/** Subject grain for Included Statuses — track-aware; ignores stale case grain on child-track stages. */
export function queueMembershipSubjectForStatusOptions(params: {
    stageKey: string;
    trackKey?: string | null;
    queueMembership?: QueueMembershipV1 | null;
}): QueueMembershipSubjectType {
    const sk = params.stageKey.trim();
    const trackDefault = defaultSubjectTypeForStage(sk, params.trackKey);
    const track = stageTrackKeyFromRecord(sk, params.trackKey);
    const saved = params.queueMembership?.subject_type;

    if (!saved) return trackDefault;
    if (track === ENROLLMENT_TRACK_CHILD_KEY && saved === "case") return trackDefault;
    return saved;
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
        ? "/settings/statuses?entity_type=opportunities"
        : "/settings/statuses?entity_type=opportunity_customer_members";
}
