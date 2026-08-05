import type {
    MetricResolveContext,
    MetricResolveResult,
    OipMetricKey,
    ResolvedMetricValue,
} from "@/lib/metrics/types";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { kpiForMetric } from "@/lib/metrics/kpiRegistry";
import { evaluateKpiForMetric } from "@/lib/metrics/kpiEvaluator";
import { readLatestMetricSnapshot } from "@/lib/metrics/snapshots/readMetricSnapshot";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import {
    resolveEnrollmentTimeToScheduleTour,
    resolveEnrollmentTourConversionRate,
    resolveEnrollmentTourCompletedCount,
} from "@/lib/metrics/resolvers/eventWindowMetrics";
import {
    resolveEnrollmentActiveLeads,
    resolveEnrollmentActiveFamilies,
    resolveEnrollmentNewLeads,
    resolveEnrollmentWaitlisted,
    resolveEnrollmentLeadCountCompat,
} from "@/lib/metrics/resolvers/enrollmentParticipantMetrics";
import {
    resolveOpsWorkOverdueCount,
} from "@/lib/metrics/resolvers/entitySnapshotMetrics";
import {
    resolveCommsDeliveryRate,
    resolveCommsReplyRate,
    resolveCommsFailedDeliveryCount,
} from "@/lib/metrics/resolvers/commsMetrics";
import {
    resolveFormsCompletionRate,
    resolveFormsPacketCompletionTime,
} from "@/lib/metrics/resolvers/formsMetrics";
import {
    resolveOpsWorkflowFailureRate,
    resolveOpsNeedsAttentionCount,
    resolveOpsReadinessGapCount,
} from "@/lib/metrics/resolvers/operationalHealthMetrics";
import {
    resolveTrustDeterministicResolutionRate,
    resolveTrustEscalatedDecisionCount,
    resolveTrustExecutionsCommittedCount,
    resolveTrustGovernedDecisionsCompleted,
    resolveTrustGovernedDecisionsCreated,
    resolveTrustGovernedRefusalRate,
    resolveTrustProviderCostUnits,
    resolveTrustReasoningFailureRate,
    resolveTrustReasoningLatencyP50,
    resolveTrustRecommendationRate,
} from "@/lib/metrics/resolvers/trustMetrics";

async function resolveLiveMetric(ctx: MetricResolveContext, key: OipMetricKey): Promise<ResolvedMetricValue> {
    switch (key) {
        case "enrollment.time_to_schedule_tour":
            return resolveEnrollmentTimeToScheduleTour(ctx);
        case "enrollment.tour_conversion_rate":
            return resolveEnrollmentTourConversionRate(ctx);
        case "enrollment.lead_count":
            return resolveEnrollmentLeadCountCompat(ctx);
        case "enrollment.active_leads":
            return resolveEnrollmentActiveLeads(ctx);
        case "enrollment.active_families":
            return resolveEnrollmentActiveFamilies(ctx);
        case "enrollment.new_leads":
            return resolveEnrollmentNewLeads(ctx);
        case "enrollment.waitlisted":
            return resolveEnrollmentWaitlisted(ctx);
        case "enrollment.tour_completed_count":
            return resolveEnrollmentTourCompletedCount(ctx);
        case "comms.delivery_rate":
            return resolveCommsDeliveryRate(ctx);
        case "comms.reply_rate":
            return resolveCommsReplyRate(ctx);
        case "comms.failed_delivery_count":
            return resolveCommsFailedDeliveryCount(ctx);
        case "forms.completion_rate":
            return resolveFormsCompletionRate(ctx);
        case "forms.packet_completion_time":
            return resolveFormsPacketCompletionTime(ctx);
        case "ops.work_overdue_count":
            return resolveOpsWorkOverdueCount(ctx);
        case "ops.workflow_failure_rate":
            return resolveOpsWorkflowFailureRate(ctx);
        case "ops.needs_attention_count":
            return resolveOpsNeedsAttentionCount(ctx);
        case "ops.readiness_gap_count":
            return resolveOpsReadinessGapCount(ctx);
        case "trust.governed_decisions_created":
            return resolveTrustGovernedDecisionsCreated(ctx);
        case "trust.governed_decisions_completed":
            return resolveTrustGovernedDecisionsCompleted(ctx);
        case "trust.recommendation_rate":
            return resolveTrustRecommendationRate(ctx);
        case "trust.governed_refusal_rate":
            return resolveTrustGovernedRefusalRate(ctx);
        case "trust.reasoning_failure_rate":
            return resolveTrustReasoningFailureRate(ctx);
        case "trust.deterministic_resolution_rate":
            return resolveTrustDeterministicResolutionRate(ctx);
        case "trust.escalated_decision_count":
            return resolveTrustEscalatedDecisionCount(ctx);
        case "trust.reasoning_latency_p50":
            return resolveTrustReasoningLatencyP50(ctx);
        case "trust.provider_cost_units":
            return resolveTrustProviderCostUnits(ctx);
        case "trust.executions_committed_count":
            return resolveTrustExecutionsCommittedCount(ctx);
        default: {
            const _exhaustive: never = key;
            throw new Error(`Unhandled metric key: ${_exhaustive}`);
        }
    }
}

function snapshotScope(ctx: MetricResolveContext): {
    scopeType: "org" | "site" | "work_unit";
    scopeId: string | null;
} {
    if (ctx.workUnitId) return { scopeType: "work_unit", scopeId: ctx.workUnitId };
    if (ctx.siteLocationId) return { scopeType: "site", scopeId: ctx.siteLocationId };
    return { scopeType: "org", scopeId: null };
}

async function resolveFromSnapshotIfAvailable(
    ctx: MetricResolveContext,
    key: OipMetricKey
): Promise<ResolvedMetricValue | null> {
    const def = getMetricDefinition(key);
    const { scopeType, scopeId } = snapshotScope(ctx);
    const dimensionKey = ctx.dimensions?.status_key
        ? "status_key"
        : ctx.dimensions?.lifecycle_stage
          ? "lifecycle_stage"
          : null;
    const dimensionValue =
        ctx.dimensions?.status_key ?? ctx.dimensions?.lifecycle_stage ?? null;

    const row = await readLatestMetricSnapshot(ctx.supabase, {
        orgId: ctx.orgId,
        metricKey: key,
        windowKey: ctx.window,
        scopeType,
        scopeId,
        dimensionKey,
        dimensionValue,
    });
    if (!row) return null;

    const value = row.value_numeric;
    return {
        key,
        label: def.label,
        format: def.format,
        value,
        formattedValue: formatMetricValue(def.format, value),
        window: ctx.window,
        windowStartIso: row.computed_at,
        windowEndIso: row.computed_at,
        computedAtIso: row.computed_at,
        sources: def.sources,
        resolveMode: "snapshot",
        meta: { ...(row.value_json ?? {}), snapshot_id: row.id },
    };
}

export async function resolveSingleMetric(ctx: MetricResolveContext, key: OipMetricKey): Promise<ResolvedMetricValue> {
    if (ctx.mode === "snapshot") {
        const snap = await resolveFromSnapshotIfAvailable(ctx, key);
        if (snap) return snap;
    }
    return resolveLiveMetric(ctx, key);
}

export async function resolveMetrics(params: {
    ctx: MetricResolveContext;
    keys: OipMetricKey[];
    orgMetadata?: unknown;
    includeKpi?: boolean;
}): Promise<MetricResolveResult[]> {
    const { ctx, keys, orgMetadata, includeKpi = true } = params;
    const results: MetricResolveResult[] = [];

    for (const key of keys) {
        const metric = await resolveSingleMetric(ctx, key);
        const result: MetricResolveResult = { metric };

        if (includeKpi) {
            const kpiKey = kpiForMetric(key);
            if (kpiKey) {
                result.kpi = evaluateKpiForMetric({ kpiKey, metric, orgMetadata });
            }
        }

        results.push(result);
    }

    return results;
}
