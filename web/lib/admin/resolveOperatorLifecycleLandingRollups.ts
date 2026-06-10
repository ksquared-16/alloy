import { pickDeptPipelineWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import type { OperatorLifecycleLandingCard, OperatorLifecycleWorkUnitRow } from "@/lib/admin/buildOperatorLifecycleLanding";

export type LifecycleQueueSummaryRow = {
    key?: string;
    count?: number;
    counts_deferred?: boolean;
};

export type LifecycleWorkUnitSummaryRow = {
    id?: string;
    work_unit_scope_total?: number | null;
    queues?: LifecycleQueueSummaryRow[];
    error?: string;
};

export type LifecycleDepartmentSummariesResponse = {
    work_units?: LifecycleWorkUnitSummaryRow[];
    error?: string;
};

export type OperatorLifecycleLandingRollups = {
    activeRecordCount: number | null;
    needsAttentionCount: number | null;
};

/**
 * Derive lifecycle tile rollups from department queue summaries (pipeline work unit).
 * Returns null counts when summaries are missing or deferred — never fabricates values.
 */
export function resolveLifecycleRollupsFromDepartmentSummaries(args: {
    departmentId: string;
    workUnits: OperatorLifecycleWorkUnitRow[];
    summaries: LifecycleWorkUnitSummaryRow[];
}): OperatorLifecycleLandingRollups {
    const pipelineWu = pickDeptPipelineWorkUnit(
        args.workUnits.filter((wu) => wu.department_id === args.departmentId),
        args.departmentId,
    );
    if (!pipelineWu) {
        return { activeRecordCount: null, needsAttentionCount: null };
    }

    const pipelineRow = args.summaries.find((row) => row.id === pipelineWu.id && !row.error);
    if (!pipelineRow) {
        return { activeRecordCount: null, needsAttentionCount: null };
    }

    const activeRecordCount =
        typeof pipelineRow.work_unit_scope_total === "number" && Number.isFinite(pipelineRow.work_unit_scope_total)
            ? Math.max(0, Math.floor(pipelineRow.work_unit_scope_total))
            : null;

    let needsAttentionCount: number | null = null;
    for (const row of args.summaries) {
        if (row.error) continue;
        const naRow = (row.queues ?? []).find((q) => (q.key ?? "").trim().toLowerCase() === "needs_attention");
        if (!naRow || naRow.counts_deferred === true || typeof naRow.count !== "number") continue;
        needsAttentionCount = Math.max(0, Math.floor(naRow.count));
        break;
    }

    return { activeRecordCount, needsAttentionCount };
}

export function applyOperatorLifecycleLandingRollups(
    cards: OperatorLifecycleLandingCard[],
    rollupsByLifecycleId: ReadonlyMap<string, OperatorLifecycleLandingRollups>,
): OperatorLifecycleLandingCard[] {
    return cards.map((card) => {
        const rollups = rollupsByLifecycleId.get(card.id);
        if (!rollups) return card;
        return {
            ...card,
            activeRecordCount: rollups.activeRecordCount,
            needsAttentionCount: rollups.needsAttentionCount,
        };
    });
}
