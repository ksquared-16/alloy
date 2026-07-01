import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricEvaluationResult, MetricRollupRow } from "@/lib/metrics/platform/types";
import type { MetricEvaluationContext } from "@/lib/metrics/platform/types";
import { evaluateMetricDefinitionsBatch } from "@/lib/metrics/platform/metricEvaluator";
import { loadMetricDefinitionsByIds } from "@/lib/metrics/platform/placementResolver";

export type RollupResult = {
    rollupId: string;
    key: string;
    label: string;
    rollupType: string;
    value: number | null;
    healthState: "healthy" | "warning" | "critical" | "unknown";
    childResults: MetricEvaluationResult[];
};

function rollupValues(type: string, values: number[], weights?: number[]): number | null {
    const finite = values.filter((v) => Number.isFinite(v));
    if (!finite.length) return null;

    switch (type) {
        case "sum":
            return finite.reduce((a, b) => a + b, 0);
        case "avg":
            return finite.reduce((a, b) => a + b, 0) / finite.length;
        case "weighted_avg": {
            if (!weights || weights.length !== finite.length) return null;
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            if (totalWeight === 0) return null;
            return finite.reduce((acc, v, i) => acc + v * (weights[i] ?? 0), 0) / totalWeight;
        }
        case "best":
            return Math.max(...finite);
        case "worst":
            return Math.min(...finite);
        case "composite_score":
            return finite.reduce((a, b) => a + b, 0) / finite.length;
        case "health_score": {
            const healthy = finite.filter((v) => v >= 0.8).length;
            return healthy / finite.length;
        }
        default:
            return null;
    }
}

export async function computeMetricRollup(params: {
    supabase: SupabaseClient;
    rollup: MetricRollupRow;
    ctx: MetricEvaluationContext;
}): Promise<RollupResult> {
    const childConfig = params.rollup.child_metric_config as {
        version?: number;
        metrics?: { metricDefinitionId: string; weight?: number }[];
    };
    const childIds = (childConfig.metrics ?? []).map((m) => m.metricDefinitionId);
    const definitions = await loadMetricDefinitionsByIds(params.supabase, params.ctx.orgId, childIds);
    const evaluations = await evaluateMetricDefinitionsBatch({
        supabase: params.supabase,
        definitions,
        ctx: params.ctx,
    });

    const values = evaluations.map((e) => e.value).filter((v): v is number => v != null);
    const weights = (childConfig.metrics ?? []).map((m) => m.weight ?? 1);
    const value = rollupValues(params.rollup.rollup_type, values, weights);

    let healthState: RollupResult["healthState"] = "unknown";
    if (params.rollup.rollup_type === "health_score" && value != null) {
        if (value >= 0.8) healthState = "healthy";
        else if (value >= 0.5) healthState = "warning";
        else healthState = "critical";
    }

    return {
        rollupId: params.rollup.id,
        key: params.rollup.key,
        label: params.rollup.label,
        rollupType: params.rollup.rollup_type,
        value,
        healthState,
        childResults: evaluations,
    };
}
