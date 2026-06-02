import type {
    EnrollmentStatusStageRow,
    EnrollmentStatusStagesPayload,
} from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";

export function statusKeySetsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

/** All opportunity status rows visible in the activation picker (deduped by status_key). */
export function collectAllOpportunityStatusRows(
    payload: EnrollmentStatusStagesPayload | null
): EnrollmentStatusStageRow[] {
    if (!payload) return [];
    const seen = new Set<string>();
    const out: EnrollmentStatusStageRow[] = [];
    const pool: EnrollmentStatusStageRow[] = [
        ...payload.unassigned,
        ...Object.values(payload.stages).flatMap((s) => s.statuses),
    ];
    for (const row of pool) {
        if (seen.has(row.status_key)) continue;
        seen.add(row.status_key);
        out.push(row);
    }
    return out.sort((a, b) => a.sort_order - b.sort_order || a.status_label.localeCompare(b.status_label));
}

export function stageSavedStatusKeys(
    payload: EnrollmentStatusStagesPayload | null,
    stageKey: string,
    opts?: { explicitAssignmentsOnly?: boolean }
): string[] {
    const bucket = payload?.stages[stageKey];
    if (!bucket) return [];
    if (opts?.explicitAssignmentsOnly) {
        if (!bucket.has_custom_assignments) return [];
        return bucket.statuses
            .filter((s) => s.assignment_source === "metadata")
            .map((s) => s.status_key);
    }
    return bucket.statuses.map((s) => s.status_key);
}

export function canContinueToWorkUnitQueue(opts: {
    statusesLoading: boolean;
    statusesSaving: boolean;
    savedCount: number;
    draftDirty: boolean;
}): boolean {
    if (opts.statusesLoading || opts.statusesSaving) return false;
    if (opts.savedCount < 1) return false;
    if (opts.draftDirty) return false;
    return true;
}

/** Statuses step — Save & continue enabled when user has selected at least one status. */
export function canConfirmStatusesStep(opts: {
    statusesLoading: boolean;
    statusesSaving: boolean;
    draftCount: number;
}): boolean {
    if (opts.statusesLoading || opts.statusesSaving) return false;
    return opts.draftCount >= 1;
}

export const LIFECYCLE_ACTIVATION_STATUS_STAGES_PATH = "/api/admin/enrollment-process/status-stages";
