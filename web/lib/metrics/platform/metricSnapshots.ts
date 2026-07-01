import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    MetricDefinitionRow,
    MetricEvaluationResult,
    MetricPlatformSnapshotRow,
} from "@/lib/metrics/platform/types";
import type { MetricEvaluationContext } from "@/lib/metrics/platform/types";
import { evaluateMetricDefinition } from "@/lib/metrics/platform/metricEvaluator";

export type CreateSnapshotInput = {
    orgId: string;
    metricDefinitionId: string;
    contextType?: string;
    contextId?: string | null;
    periodStart: string;
    periodEnd: string;
    granularity?: string;
    value: number | null;
    numeratorValue?: number | null;
    denominatorValue?: number | null;
    dimensionValues?: Record<string, unknown> | null;
    healthState?: string;
    computedAt?: string;
};

export async function createMetricPlatformSnapshot(
    supabase: SupabaseClient,
    input: CreateSnapshotInput
): Promise<{ id: string | null; error: string | null }> {
    const { data, error } = await supabase
        .from("metric_platform_snapshots")
        .insert({
            org_id: input.orgId,
            metric_definition_id: input.metricDefinitionId,
            context_type: input.contextType ?? "org",
            context_id: input.contextId ?? null,
            period_start: input.periodStart,
            period_end: input.periodEnd,
            granularity: input.granularity ?? "day",
            value: input.value,
            numerator_value: input.numeratorValue ?? null,
            denominator_value: input.denominatorValue ?? null,
            dimension_values: input.dimensionValues ?? null,
            health_state: input.healthState ?? "unknown",
            computed_at: input.computedAt ?? new Date().toISOString(),
        })
        .select("id")
        .single();

    if (error) return { id: null, error: error.message };
    return { id: (data as { id: string }).id, error: null };
}

export async function snapshotFromEvaluation(
    supabase: SupabaseClient,
    orgId: string,
    evaluation: MetricEvaluationResult,
    contextType = "org",
    contextId: string | null = null
): Promise<{ id: string | null; error: string | null }> {
    return createMetricPlatformSnapshot(supabase, {
        orgId,
        metricDefinitionId: evaluation.metricDefinitionId,
        contextType,
        contextId,
        periodStart: evaluation.periodStart,
        periodEnd: evaluation.periodEnd,
        value: evaluation.value,
        numeratorValue: evaluation.numeratorValue,
        denominatorValue: evaluation.denominatorValue,
        healthState: evaluation.healthState,
        computedAt: evaluation.computedAt,
    });
}

export async function evaluateAndSnapshotMetric(params: {
    supabase: SupabaseClient;
    definition: MetricDefinitionRow;
    ctx: MetricEvaluationContext;
}): Promise<{ evaluation: MetricEvaluationResult; snapshotId: string | null; error: string | null }> {
    const evaluation = await evaluateMetricDefinition({
        supabase: params.supabase,
        definition: params.definition,
        ctx: params.ctx,
    });
    const { id, error } = await snapshotFromEvaluation(
        params.supabase,
        params.ctx.orgId,
        evaluation,
        params.ctx.contextType ?? "org",
        params.ctx.contextId ?? null
    );
    return { evaluation, snapshotId: id, error };
}

export async function getLatestMetricPlatformSnapshot(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        metricDefinitionId: string;
        contextType?: string;
        contextId?: string | null;
    }
): Promise<MetricPlatformSnapshotRow | null> {
    let query = supabase
        .from("metric_platform_snapshots")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("metric_definition_id", params.metricDefinitionId)
        .order("computed_at", { ascending: false })
        .limit(1);

    if (params.contextType) query = query.eq("context_type", params.contextType);
    if (params.contextId !== undefined) {
        query = params.contextId
            ? query.eq("context_id", params.contextId)
            : query.is("context_id", null);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return data as MetricPlatformSnapshotRow;
}

export async function getMetricPlatformSnapshotSeries(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        metricDefinitionId: string;
        contextType?: string;
        contextId?: string | null;
        limit?: number;
    }
): Promise<MetricPlatformSnapshotRow[]> {
    let query = supabase
        .from("metric_platform_snapshots")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("metric_definition_id", params.metricDefinitionId)
        .order("computed_at", { ascending: true })
        .limit(params.limit ?? 30);

    if (params.contextType) query = query.eq("context_type", params.contextType);
    if (params.contextId !== undefined) {
        query = params.contextId
            ? query.eq("context_id", params.contextId)
            : query.is("context_id", null);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as MetricPlatformSnapshotRow[];
}
