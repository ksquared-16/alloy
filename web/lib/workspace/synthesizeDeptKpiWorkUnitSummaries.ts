import type { DeptPipelineExecSurface } from "@/lib/workspace/resolveDeptPipelineExecSurface";

export type DeptKpiWorkUnitSummary = { total: number; needs_attention: number | null };

type WorkUnitLite = { id: string; key: string | null };

type AttentionLite = {
    total?: number;
    needs_attention_buckets?: Array<{ count?: number }>;
};

/**
 * When bootstrap skips queue summaries for enrollment pipeline + needs_attention WUs,
 * derive KPI-facing totals from attention preview + pipeline lane counts so Today's Focus
 * does not show "—" while oper data is authoritative.
 */
export function synthesizeDeptKpiWorkUnitSummaries(params: {
    workUnits: WorkUnitLite[];
    attention?: AttentionLite | null;
    pipelineSurface?: DeptPipelineExecSurface | null;
}): Record<string, DeptKpiWorkUnitSummary> {
    const out: Record<string, DeptKpiWorkUnitSummary> = {};
    const { workUnits, attention, pipelineSurface } = params;

    const naWu = workUnits.find((w) => (w.key ?? "").trim().toLowerCase() === "needs_attention");
    if (naWu) {
        let naTotal: number | null = null;
        if (typeof attention?.total === "number" && Number.isFinite(attention.total)) {
            naTotal = Math.max(0, Math.floor(attention.total));
        } else if (Array.isArray(attention?.needs_attention_buckets)) {
            const bucketSum = attention.needs_attention_buckets.reduce(
                (sum, b) => sum + (typeof b.count === "number" && Number.isFinite(b.count) ? Math.max(0, Math.floor(b.count)) : 0),
                0
            );
            naTotal = bucketSum;
        }
        if (naTotal != null) {
            out[naWu.id] = { total: naTotal, needs_attention: naTotal };
        }
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
            out[enrollWu.id] = { total: laneTotal, needs_attention: 0 };
        }
    }

    return out;
}

export function mergeDeptWorkUnitSummariesForKpis(
    base: Record<string, DeptKpiWorkUnitSummary>,
    synthesized: Record<string, DeptKpiWorkUnitSummary>
): Record<string, DeptKpiWorkUnitSummary> {
    return { ...base, ...synthesized };
}
