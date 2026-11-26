/**
 * Shared operational-resolution contracts for the Location Operational Domain.
 *
 * Every canonical resolver in this domain (capacity, ratio, timezone, and the
 * Location/Program/Room providers) reports outcomes through one small set of
 * primitives so consumers branch on a single, uniform status model. Unknown
 * inputs are NEVER silently coerced to 0 / Infinity / a default value — they
 * surface as an explicit `incomplete` / `not_configured` / `conflicted` status
 * with structured warnings.
 *
 * Governing docs (frozen):
 *   docs/platform/rfcs/location-operational-domain-convergence.md (§8, §9, §12)
 *   docs/platform/rfcs/location-operational-domain-phase-a-implementation-plan.md (A8)
 *
 * Pure types + pure helpers only. No IO, no Supabase client, no UI dependency.
 */

/**
 * Outcome of resolving an operational value.
 * - `resolved`       — a value was determined from ≥1 applicable, effective rule.
 * - `incomplete`     — a required input was missing/unknown (e.g. an uncovered
 *                      age group, absent occupancy); the value is not trustworthy.
 * - `not_configured` — no applicable rule exists at any scope for this context.
 * - `conflicted`     — applicable inputs cannot be reconciled into one answer.
 *
 * Ordered here from least to most severe; see {@link mergeResolutionStatus}.
 */
export type OperationalResolutionStatus =
    | "resolved"
    | "incomplete"
    | "not_configured"
    | "conflicted";

/** A structured, machine-readable warning attached to a resolution. */
export type OperationalResolutionWarning = {
    /** Stable kebab/snake code, e.g. `unknown_age_group`, `licensing_absent`. */
    code: string;
    /** Human-readable explanation. */
    message: string;
    /** Optional structured context (ids, scopes) — never free-form prose. */
    context?: Record<string, unknown>;
};

/**
 * A rule that was CONSIDERED while resolving a value. Every applicable rule is
 * reported (for explainability), with `binding: true` on the one that set the
 * result. Enables the UI to say "limited by the 2:11 ratio (effective Sep 1)".
 */
export type AppliedOperationalRule = {
    ruleId: string;
    /** Domain of the rule, e.g. `capacity`, `ratio`, `licensed_capacity`. */
    ruleType: string;
    /** Scope the rule was authored at, e.g. `org` / `site` / `program` / `room`. */
    scopeType: string;
    /** Id of the scoped entity (site/program/room), when scoped. */
    scopeId?: string;
    effectiveStart?: string;
    effectiveEnd?: string;
    /** Provenance, e.g. `licensing` / `organization` / `config` / `location_override`. */
    sourceKey?: string;
    /** True when this rule determined the resolved value. */
    binding?: boolean;
};

const STATUS_SEVERITY: Record<OperationalResolutionStatus, number> = {
    resolved: 0,
    not_configured: 1,
    incomplete: 2,
    conflicted: 3,
};

/**
 * Merge sub-resolution statuses into one, deterministically.
 *
 * Precedence: any `conflicted` ⇒ conflicted; else any `incomplete` ⇒ incomplete;
 * else if every input is `not_configured` ⇒ not_configured; else `resolved`
 * (a mix of resolved + not_configured is `resolved` — an absent constraint is
 * not an error). An empty input list is `not_configured` (nothing was resolved).
 */
export function mergeResolutionStatus(
    statuses: readonly OperationalResolutionStatus[]
): OperationalResolutionStatus {
    if (statuses.length === 0) return "not_configured";
    if (statuses.some((s) => s === "conflicted")) return "conflicted";
    if (statuses.some((s) => s === "incomplete")) return "incomplete";
    if (statuses.every((s) => s === "not_configured")) return "not_configured";
    return "resolved";
}

/** True when the most severe of the two statuses is `a`. Stable ordering helper. */
export function isAtLeastAsSevere(
    a: OperationalResolutionStatus,
    b: OperationalResolutionStatus
): boolean {
    return STATUS_SEVERITY[a] >= STATUS_SEVERITY[b];
}

/**
 * Deterministic ordering for warnings so serialized resolutions are stable
 * across runs (tests rely on this). Orders by `code`, then `message`.
 */
export function sortWarnings(
    warnings: readonly OperationalResolutionWarning[]
): OperationalResolutionWarning[] {
    return warnings.slice().sort((a, b) => {
        if (a.code !== b.code) return a.code < b.code ? -1 : 1;
        if (a.message !== b.message) return a.message < b.message ? -1 : 1;
        return 0;
    });
}

/**
 * Deterministic ordering for applied rules: binding first, then by scope
 * specificity is caller-domain-specific, so here we order by `ruleType`, then
 * `scopeType`, then `ruleId` for a stable, explainable list.
 */
export function sortAppliedRules(
    rules: readonly AppliedOperationalRule[]
): AppliedOperationalRule[] {
    return rules.slice().sort((a, b) => {
        if (!!b.binding !== !!a.binding) return b.binding ? 1 : -1;
        if (a.ruleType !== b.ruleType) return a.ruleType < b.ruleType ? -1 : 1;
        if (a.scopeType !== b.scopeType) return a.scopeType < b.scopeType ? -1 : 1;
        return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
    });
}
