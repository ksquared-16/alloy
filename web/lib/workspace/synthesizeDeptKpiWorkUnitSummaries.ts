import type { DeptPipelineExecSurface } from "@/lib/workspace/resolveDeptPipelineExecSurface";
import { resolveDeptNeedsAttentionWorkUnit } from "@/lib/workspace/resolveDeptNeedsAttentionWorkUnit";

export type DeptKpiWorkUnitSummary = { total: number; needs_attention: number | null };

type WorkUnitLite = {
    id: string;
    key: string | null;
    department_id?: string | null;
    queue_definition?: unknown;
};

type AttentionLite = {
    total?: number;
    needs_attention_buckets?: Array<{ count?: number }>;
};

/**
 * When bootstrap skips queue summaries for enrollment pipeline + needs_attention WUs,
 * derive KPI-facing totals from attention preview + pipeline lane counts so Today's Focus
 * does not show "—" while oper data is authoritative.
 */
function attentionMatchTotal(attention?: AttentionLite | null): number | null {
    if (typeof attention?.total === "number" && Number.isFinite(attention.total)) {
        return Math.max(0, Math.floor(attention.total));
    }
    if (Array.isArray(attention?.needs_attention_buckets)) {
        const bucketSum = attention.needs_attention_buckets.reduce(
            (sum, b) => sum + (typeof b.count === "number" && Number.isFinite(b.count) ? Math.max(0, Math.floor(b.count)) : 0),
            0
        );
        return bucketSum;
    }
    return null;
}

export function synthesizeDeptKpiWorkUnitSummaries(params: {
    workUnits: WorkUnitLite[];
    attention?: AttentionLite | null;
    pipelineSurface?: DeptPipelineExecSurface | null;
    departmentId?: string;
}): Record<string, DeptKpiWorkUnitSummary> {
    const out: Record<string, DeptKpiWorkUnitSummary> = {};
    const { workUnits, attention, pipelineSurface, departmentId } = params;
    const naTotal = attentionMatchTotal(attention);

    const execWu =
        departmentId != null && departmentId.trim() !== ""
            ? resolveDeptNeedsAttentionWorkUnit(workUnits, departmentId)
            : null;

    if (execWu && naTotal != null) {
        if (execWu.mode === "standalone_work_unit") {
            out[execWu.id] = { total: naTotal, needs_attention: naTotal };
        }
    }

    const naWu = workUnits.find((w) => (w.key ?? "").trim().toLowerCase() === "needs_attention");
    if (naWu && naTotal != null && !out[naWu.id]) {
        out[naWu.id] = { total: naTotal, needs_attention: naTotal };
    }

    const enrollWu = workUnits.find((w) => (w.key ?? "").trim().toLowerCase() === "enrollment_pipeline");
    if (enrollWu && pipelineSurface?.lanes?.length) {
        let laneTotal = 0;
        let allResolved = true;
        for (const lane of pipelineSurface.lanes) {
            if (lane.countsDeferred) {
                allResolved = false;
                break;
            }
            if (typeof lane.count === "number" && Number.isFinite(lane.count)) {
                laneTotal += Math.max(0, Math.floor(lane.count));
            } else {
                allResolved = false;
            }
        }
        if (allResolved) {
            const needsAttention =
                execWu?.mode === "pipeline_work_unit" && execWu.id === enrollWu.id && naTotal != null
                    ? naTotal
                    : out[enrollWu.id]?.needs_attention ?? 0;
            out[enrollWu.id] = { total: laneTotal, needs_attention: needsAttention };
        }
    } else if (
        enrollWu &&
        execWu?.mode === "pipeline_work_unit" &&
        execWu.id === enrollWu.id &&
        naTotal != null
    ) {
        out[enrollWu.id] = { total: naTotal, needs_attention: naTotal };
    }

    return out;
}

export function mergeDeptWorkUnitSummariesForKpis(
    base: Record<string, DeptKpiWorkUnitSummary>,
    synthesized: Record<string, DeptKpiWorkUnitSummary>
): Record<string, DeptKpiWorkUnitSummary> {
    return { ...base, ...synthesized };
}
