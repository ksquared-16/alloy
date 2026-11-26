/**
 * Trust pack metrics — governed reasoning execution.
 *
 * Reads only the Trust Runtime's own append-only records:
 * `trust_decision_contracts`, `trust_decision_packages`,
 * `trust_reasoning_usage`, `trust_decision_observations`.
 *
 * Three rules this resolver exists to hold:
 *
 *  1. **Provider identity never comes from a Decision Package.** ADR-2 puts
 *     provider/model identity in usage/economics telemetry. Cost is read from
 *     `trust_reasoning_usage`; no recommendation or evidence JSON is opened.
 *  2. **Requested is not completed, and accepted is not executed.** Contracts
 *     count requests, packages count completions, and only an `executed`
 *     observation counts as an execution.
 *  3. **Site scope is unsupported, loudly.** No Trust table carries a site,
 *     location or work-unit column, so a narrowed scope returns `null` with
 *     `scope_unsupported` in meta rather than the org-wide number wearing a site
 *     label.
 *
 * The Metric Engine remains the only calculation path; every number below is
 * computed here from bounded, org-scoped queries.
 */

import type { MetricResolveContext, OipMetricKey, ResolvedMetricValue } from "@/lib/metrics/types";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { buildMetricResultBase } from "@/lib/metrics/resolvers/metricResolveBase";

/** Upper bound on rows any single Trust metric will scan. Keeps every query bounded. */
export const TRUST_METRIC_ROW_CAP = 5000;

/**
 * Package outcomes the platform DELIBERATELY refused, as opposed to failed at.
 * Mirrors `DECISION_PACKAGE_OUTCOMES`; kept as data here so the resolver does
 * not import the Trust Runtime.
 */
export const GOVERNED_REFUSAL_OUTCOMES: readonly string[] = [
    "refused_policy",
    "refused_permission",
    "refused_unsupported_class",
    "refused_insufficient_information",
    "refused_privacy",
    "refused_budget",
];

/** Outcomes where execution of the runtime itself broke, rather than refusing. */
export const REASONING_FAILURE_OUTCOMES: readonly string[] = ["failed_validation", "failed_reasoning"];

export type TrustPackageRow = { outcome: string };
export type TrustUsageRow = {
    escalation_level: number | null;
    latency_ms: number | null;
    provider_cost_units: number | string | null;
    decision_class_key: string | null;
};
export type TrustExecutionObservationRow = { package_id: string };

// ---------------------------------------------------------------------------
// Pure computation — exported so certification asserts the maths, not the client
// ---------------------------------------------------------------------------

export function computeOutcomeMix(rows: readonly TrustPackageRow[]): {
    total: number;
    recommended: number;
    governedRefusals: number;
    reasoningFailures: number;
    byOutcome: Record<string, number>;
} {
    const byOutcome: Record<string, number> = {};
    let recommended = 0;
    let governedRefusals = 0;
    let reasoningFailures = 0;
    for (const row of rows) {
        const outcome = row.outcome;
        byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
        if (outcome === "recommended") recommended += 1;
        else if (GOVERNED_REFUSAL_OUTCOMES.includes(outcome)) governedRefusals += 1;
        else if (REASONING_FAILURE_OUTCOMES.includes(outcome)) reasoningFailures += 1;
    }
    return { total: rows.length, recommended, governedRefusals, reasoningFailures, byOutcome };
}

/** Null on an empty cohort — a rate over zero decisions is undefined, not zero. */
export function rateOf(numerator: number, denominator: number): number | null {
    return denominator === 0 ? null : numerator / denominator;
}

export function computeDeterministicResolution(rows: readonly TrustUsageRow[]): {
    total: number;
    deterministic: number;
    escalated: number;
    byEscalationLevel: Record<string, number>;
} {
    const byEscalationLevel: Record<string, number> = {};
    let deterministic = 0;
    for (const row of rows) {
        const level = Number(row.escalation_level ?? 0);
        byEscalationLevel[String(level)] = (byEscalationLevel[String(level)] ?? 0) + 1;
        if (level === 0) deterministic += 1;
    }
    return {
        total: rows.length,
        deterministic,
        escalated: rows.length - deterministic,
        byEscalationLevel,
    };
}

/** Median latency in milliseconds. Null on an empty cohort. */
export function computeLatencyP50Ms(rows: readonly TrustUsageRow[]): number | null {
    const values = rows
        .map((r) => Number(r.latency_ms ?? 0))
        .filter((v) => Number.isFinite(v) && v >= 0)
        .sort((a, b) => a - b);
    if (values.length === 0) return null;
    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 1 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}

/**
 * Sums provider cost units without losing decimals.
 *
 * `numeric` arrives from PostgREST as a string when it exceeds JS-safe integer
 * precision, so every value is coerced explicitly rather than relying on the
 * driver's guess.
 */
export function computeCostUnits(rows: readonly TrustUsageRow[]): { total: number; nonZeroRows: number } {
    let total = 0;
    let nonZeroRows = 0;
    for (const row of rows) {
        const raw = row.provider_cost_units;
        const value = typeof raw === "string" ? Number.parseFloat(raw) : Number(raw ?? 0);
        if (!Number.isFinite(value)) continue;
        total += value;
        if (value !== 0) nonZeroRows += 1;
    }
    // Guard against binary-float drift on repeated decimal addition.
    return { total: Number(total.toFixed(6)), nonZeroRows };
}

/** Distinct packages with a committed execution. A replayed observation cannot double-count. */
export function computeCommittedExecutions(rows: readonly TrustExecutionObservationRow[]): {
    distinctPackages: number;
    observationRows: number;
} {
    const seen = new Set<string>();
    for (const row of rows) if (row.package_id) seen.add(row.package_id);
    return { distinctPackages: seen.size, observationRows: rows.length };
}

export function countByDecisionClass(rows: readonly TrustUsageRow[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of rows) {
        const key = row.decision_class_key ?? "unknown";
        out[key] = (out[key] ?? 0) + 1;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

/**
 * True when the caller asked for a narrower scope than Trust records can answer.
 *
 * Site and work-unit both count: neither is expressible from a Trust table.
 */
export function trustScopeIsUnsupported(ctx: MetricResolveContext): boolean {
    return Boolean(ctx.siteLocationId?.trim()) || Boolean(ctx.workUnitId?.trim());
}

function unsupportedScopeResult(ctx: MetricResolveContext, key: OipMetricKey, now: Date): ResolvedMetricValue {
    const def = getMetricDefinition(key);
    return {
        ...buildMetricResultBase(ctx, def, now),
        value: null,
        formattedValue: formatMetricValue(def.format, null),
        meta: {
            scope_unsupported: true,
            requested_scope: ctx.workUnitId?.trim() ? "work_unit" : "site",
            reason:
                "Trust Runtime records carry no site, location or work-unit linkage, so this metric can only be " +
                "answered for the whole organization. Reporting the org-wide value under a narrower scope would " +
                "misstate it.",
            org_scope_only: true,
        },
    };
}

// ---------------------------------------------------------------------------
// Bounded, org-scoped loads
// ---------------------------------------------------------------------------

async function loadPackages(ctx: MetricResolveContext, start: Date, end: Date): Promise<TrustPackageRow[]> {
    const { data, error } = await ctx.supabase
        .from("trust_decision_packages")
        .select("outcome")
        .eq("org_id", ctx.orgId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .limit(TRUST_METRIC_ROW_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []) as TrustPackageRow[];
}

async function loadUsage(ctx: MetricResolveContext, start: Date, end: Date): Promise<TrustUsageRow[]> {
    const { data, error } = await ctx.supabase
        .from("trust_reasoning_usage")
        .select("escalation_level, latency_ms, provider_cost_units, decision_class_key")
        .eq("org_id", ctx.orgId)
        .gte("recorded_at", start.toISOString())
        .lte("recorded_at", end.toISOString())
        .limit(TRUST_METRIC_ROW_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []) as TrustUsageRow[];
}

async function countContracts(ctx: MetricResolveContext, start: Date, end: Date): Promise<number> {
    const { count, error } = await ctx.supabase
        .from("trust_decision_contracts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
    if (error) throw new Error(error.message);
    return count ?? 0;
}

async function loadExecutionObservations(
    ctx: MetricResolveContext,
    start: Date,
    end: Date,
): Promise<TrustExecutionObservationRow[]> {
    const { data, error } = await ctx.supabase
        .from("trust_decision_observations")
        .select("package_id")
        .eq("org_id", ctx.orgId)
        .eq("observation_kind", "executed")
        .gte("observed_at", start.toISOString())
        .lte("observed_at", end.toISOString())
        .limit(TRUST_METRIC_ROW_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []) as TrustExecutionObservationRow[];
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

type Built = { def: ReturnType<typeof getMetricDefinition>; now: Date; start: Date; end: Date };

function prepare(ctx: MetricResolveContext, key: OipMetricKey): Built {
    const def = getMetricDefinition(key);
    const now = ctx.now ?? new Date();
    const base = buildMetricResultBase(ctx, def, now);
    return { def, now, start: new Date(base.windowStartIso), end: new Date(base.windowEndIso) };
}

function finish(
    ctx: MetricResolveContext,
    key: OipMetricKey,
    now: Date,
    value: number | null,
    meta: Record<string, unknown>,
): ResolvedMetricValue {
    const def = getMetricDefinition(key);
    return {
        ...buildMetricResultBase(ctx, def, now),
        value,
        formattedValue: formatMetricValue(def.format, value),
        meta: { ...meta, org_scope_only: true, row_cap: TRUST_METRIC_ROW_CAP },
    };
}

export async function resolveTrustGovernedDecisionsCreated(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.governed_decisions_created";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const count = await countContracts(ctx, start, end);
    return finish(ctx, key, now, count, { counts: "decision_contracts_created", measures: "requested_not_completed" });
}

export async function resolveTrustGovernedDecisionsCompleted(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.governed_decisions_completed";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const rows = await loadPackages(ctx, start, end);
    const mix = computeOutcomeMix(rows);
    return finish(ctx, key, now, mix.total, {
        counts: "decision_packages_created",
        measures: "completed_not_requested",
        by_outcome: mix.byOutcome,
    });
}

export async function resolveTrustRecommendationRate(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.recommendation_rate";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const mix = computeOutcomeMix(await loadPackages(ctx, start, end));
    return finish(ctx, key, now, rateOf(mix.recommended, mix.total), {
        numerator: mix.recommended,
        denominator: mix.total,
        by_outcome: mix.byOutcome,
    });
}

export async function resolveTrustGovernedRefusalRate(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.governed_refusal_rate";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const mix = computeOutcomeMix(await loadPackages(ctx, start, end));
    return finish(ctx, key, now, rateOf(mix.governedRefusals, mix.total), {
        numerator: mix.governedRefusals,
        denominator: mix.total,
        refusal_outcomes: GOVERNED_REFUSAL_OUTCOMES,
        excludes_reasoning_failures: REASONING_FAILURE_OUTCOMES,
        by_outcome: mix.byOutcome,
    });
}

export async function resolveTrustReasoningFailureRate(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.reasoning_failure_rate";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const mix = computeOutcomeMix(await loadPackages(ctx, start, end));
    return finish(ctx, key, now, rateOf(mix.reasoningFailures, mix.total), {
        numerator: mix.reasoningFailures,
        denominator: mix.total,
        failure_outcomes: REASONING_FAILURE_OUTCOMES,
        excludes_governed_refusals: GOVERNED_REFUSAL_OUTCOMES,
    });
}

export async function resolveTrustDeterministicResolutionRate(
    ctx: MetricResolveContext,
): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.deterministic_resolution_rate";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const usage = await loadUsage(ctx, start, end);
    const d = computeDeterministicResolution(usage);
    return finish(ctx, key, now, rateOf(d.deterministic, d.total), {
        numerator: d.deterministic,
        denominator: d.total,
        by_escalation_level: d.byEscalationLevel,
        by_decision_class: countByDecisionClass(usage),
        local_model_indistinguishable: true,
    });
}

export async function resolveTrustEscalatedDecisionCount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.escalated_decision_count";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const d = computeDeterministicResolution(await loadUsage(ctx, start, end));
    return finish(ctx, key, now, d.escalated, {
        by_escalation_level: d.byEscalationLevel,
        denominator: d.total,
        measures: "escalation_depth_not_provider_usage",
    });
}

export async function resolveTrustReasoningLatencyP50(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.reasoning_latency_p50";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const usage = await loadUsage(ctx, start, end);
    const p50Ms = computeLatencyP50Ms(usage);
    // The platform duration format is hours; convert once, here.
    const hours = p50Ms === null ? null : p50Ms / 3_600_000;
    return finish(ctx, key, now, hours, {
        p50_ms: p50Ms,
        sample_size: usage.length,
        validation_latency_not_persisted: true,
    });
}

export async function resolveTrustProviderCostUnits(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.provider_cost_units";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const usage = await loadUsage(ctx, start, end);
    const cost = computeCostUnits(usage);
    return finish(ctx, key, now, cost.total, {
        sample_size: usage.length,
        non_zero_rows: cost.nonZeroRows,
        // The one place provider economics may be read (ADR-2).
        source_record: "trust_reasoning_usage",
        provider_identity_not_persisted: true,
    });
}

export async function resolveTrustExecutionsCommittedCount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "trust.executions_committed_count";
    const { now, start, end } = prepare(ctx, key);
    if (trustScopeIsUnsupported(ctx)) return unsupportedScopeResult(ctx, key, now);
    const rows = await loadExecutionObservations(ctx, start, end);
    const executions = computeCommittedExecutions(rows);
    return finish(ctx, key, now, executions.distinctPackages, {
        observation_rows: executions.observationRows,
        deduplicated_by: "package_id",
        counts_only_observation_kind: "executed",
        accepted_is_not_executed: true,
    });
}
