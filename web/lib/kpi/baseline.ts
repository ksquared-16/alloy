import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceRootMetrics } from "@/components/admin/workspace/WorkspaceRootShell";
import {
    buildWorkspaceRootOrgOpportunityKpis,
    type WorkspaceGrowthDeptSnapshot,
} from "@/lib/workspace/viewModels/workspaceRootRollup";

import {
    workspacePipelineExactTotalInScope,
    type WorkspaceKpiGrowthSnapshot,
    departmentNeedsAttentionSumSafe,
    departmentSumWorkUnitTotals,
    workUnitNeedsAttentionCount,
    workUnitSelectedTabFromContext,
    workUnitTotalInQueueFromContext,
} from "@/lib/kpi/contextKpiMetrics";
import type { WorkUnitKpiContext } from "@/lib/kpi/surfaceContext";
import { resolveQueueGrainPresentation, resolveQueueCountUnit } from "@/lib/ui-v2/queueGrainPresentation";

function formatInt(n: number | null | undefined): string {
    if (n == null || Number.isNaN(n)) return "—";
    return String(Math.max(0, Math.floor(n)));
}

/** Baseline org workspace strip — exact pipeline lane totals, then structure, then org strip. */
export function buildDefaultWorkspaceKpis(
    metrics: WorkspaceRootMetrics | null,
    growthSnapshots: WorkspaceGrowthDeptSnapshot[]
): KPIVm[] {
    const mapped: WorkspaceKpiGrowthSnapshot[] = growthSnapshots.map((s) => ({
        departmentKey: s.key,
        kpis: s.lifecycleAnalytics,
        pipelineExact: s.pipelineExact ?? undefined,
    }));
    const inScope = workspacePipelineExactTotalInScope(mapped);
    const contextFirst: KPIVm[] =
        inScope != null
            ? [
                  {
                      id: "baseline.ctx.workspace.total_in_scope",
                      label: "Inquiries (pipeline lane)",
                      value: String(inScope),
                      lane: "business",
                  },
              ]
            : [];
    const structure: KPIVm[] = [
        { id: "depts", label: "Departments", value: formatInt(metrics?.departments), lane: "business" },
        { id: "wu", label: "Work units", value: formatInt(metrics?.workUnits), lane: "business" },
    ];
    const roll = buildWorkspaceRootOrgOpportunityKpis(growthSnapshots);
    return [...contextFirst, ...structure, ...roll];
}

export type DeptWorkUnitRow = { id: string; name: string | null; key: string | null };

/** Baseline department bridge strip — context aggregates first, then per–work-unit facet (page default). */
export function buildDefaultDepartmentKpis(params: {
    deptWorkUnits: DeptWorkUnitRow[];
    deptWorkUnitSummaries: Record<string, { total: number; needs_attention: number | null }>;
    deptQueueSummariesLoading: boolean;
    deptQueueSummariesError: string | null;
}): KPIVm[] {
    const list = params.deptWorkUnits;
    if (!list.length) return [];

    const agg: KPIVm[] = [];
    if (!params.deptQueueSummariesLoading && !params.deptQueueSummariesError) {
        const total = departmentSumWorkUnitTotals(params);
        const needs = departmentNeedsAttentionSumSafe(params);
        if (total != null) {
            agg.push({
                id: "baseline.ctx.dept.total_in_scope",
                label: "Total in department",
                value: String(total),
                lane: "business",
            });
        }
        if (needs != null) {
            agg.push({
                id: "baseline.ctx.dept.needs_attention_count",
                label: "Needs attention",
                value: String(needs),
                lane: "business",
            });
        }
    }

    const facets: KPIVm[] = list.map((wu) => {
        const summary = params.deptWorkUnitSummaries[wu.id];
        const value =
            params.deptQueueSummariesLoading || params.deptQueueSummariesError
                ? "—"
                : summary
                  ? String(summary.total)
                  : "—";
        const key = (wu.key ?? "").trim().toLowerCase();
        const label =
            key === "enrollment_pipeline" || key === "pipeline_overview" ? "Active inquiries" : wu.name?.trim() || "Work unit";
        return { id: `wu_${wu.id}`, label, value, lane: "business" as const };
    });

    return [...agg, ...facets];
}

function formatMetricValue(n: number | null): string {
    if (n == null || Number.isNaN(n)) return "—";
    return String(Math.max(0, Math.floor(n)));
}

/** Baseline work-unit strip when no placement rows exist for scope — queue-native only. */
export function buildDefaultWorkUnitKpis(context: WorkUnitKpiContext): KPIVm[] {
    if (context.queueSummariesLoading || context.queueSummariesError) return [];

    const normalizedQueueDefinition = context.normalizedQueueDefinition ?? null;
    const items: KPIVm[] = [];
    const all = workUnitTotalInQueueFromContext({
        queueSummaries: context.queueSummaries,
        legacyOpportunityListTotal: context.legacyOpportunityListTotal,
    });
    if (all != null) {
        items.push({
            id: "baseline.ctx.wu.total_in_queue",
            label: "All queues total",
            value: formatMetricValue(all),
            lane: "business",
        });
    }

    const activeSummary = context.selectedQueueKey
        ? context.queueSummaries?.find((q) => q.key === context.selectedQueueKey) ?? context.queueSummaries?.[0]
        : context.queueSummaries?.[0];
    const sel = workUnitSelectedTabFromContext(context);
    if (sel != null && activeSummary) {
        const grainPres = resolveQueueGrainPresentation(activeSummary, normalizedQueueDefinition ?? null);
        const countUnit = resolveQueueCountUnit(grainPres);
        items.push({
            id: "baseline.ctx.wu.selected_queue_count",
            label: activeSummary.label?.trim() || "This queue",
            value: formatMetricValue(sel),
            unit: countUnit.unit,
            lane: "business",
        });
    }

    const needs = workUnitNeedsAttentionCount(context.queueSummaries);
    if (needs != null) {
        items.push({
            id: "baseline.ctx.wu.needs_attention_count",
            label: "Needs attention",
            value: formatMetricValue(needs),
            unit: "items",
            lane: "business",
        });
    }

    return items;
}
