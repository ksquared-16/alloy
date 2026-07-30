/**
 * Project operational-state age (+ optional personal unseen) onto QueueRowContext.
 */

import {
    formatCompactRelativeDurationIso,
    formatOperationalAgeAccessibleLabel,
} from "@/lib/format/formatCompactRelativeDuration";
import {
    resolveOperationalStateEnteredAt,
    type OperationalStateGrain,
} from "@/lib/lifecycle/operationalStateEnteredAt";

export type BuildOperationalStateContextInput = {
    orgId: string;
    grain: OperationalStateGrain;
    subjectType: string;
    subjectId: string;
    currentStageKey: string | null | undefined;
    persistedStageEnteredAt?: string | null;
    intakeCreatedAt?: string | null;
    /**
     * When true, allow intake created_at as stage entry (subject never left this stage).
     * Default false — missing persisted time → unknown.
     */
    neverTransitioned?: boolean;
    nowMs?: number;
};

export function buildOperationalStateQueueContext(
    input: BuildOperationalStateContextInput,
): NonNullable<import("@/lib/workUnits/lifecycleSubjectContracts").QueueRowContext["operational_state"]> {
    const resolved = resolveOperationalStateEnteredAt({
        orgId: input.orgId,
        grain: input.grain,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        currentStageKey: input.currentStageKey,
        persistedStageEnteredAt: input.persistedStageEnteredAt,
        intakeCreatedAt: input.intakeCreatedAt,
        neverTransitioned: input.neverTransitioned,
    });
    const nowMs = input.nowMs ?? Date.now();
    const compact = formatCompactRelativeDurationIso(resolved.enteredAtIso, nowMs);
    return {
        stage_key: resolved.stageKey,
        entered_at: resolved.enteredAtIso,
        source: resolved.source,
        age_compact: compact?.compact ?? null,
        age_accessible: formatOperationalAgeAccessibleLabel(resolved.enteredAtIso, nowMs),
    };
}
