/**
 * WS0-A — the scope rules every metric read obeys, in one place.
 *
 * A metric value is a claim about some set of records. The caller is entitled to claims about the
 * records their access scope admits and nothing else. Three ways that used to break:
 *
 *   1. OMISSION WIDENED. A resolver that only narrowed when a `site_id` was passed answered a
 *      site-restricted caller with the whole organization's figure when they asked at org scope.
 *   2. STORAGE WIDENED. Snapshots are materialised once, with canonical (unrestricted) scope, and
 *      read back by anyone. A stored org figure is the org figure — it cannot be narrowed after the
 *      fact — so serving it to a restricted caller hands them records they may not see.
 *   3. A FIGURE WITH NO SCOPE LINKAGE WAS LABELLED AS SCOPED. A source with no site/department
 *      columns (workflow runs, comms messages, form sessions, the integration inbox, trust ledgers)
 *      can only ever produce the org figure. Answering a site request — or a restricted caller —
 *      with it is the same leak as (1) wearing a site label.
 *
 * The answer in every refused case is UNAVAILABLE: `value: null` plus `meta.unavailable_reason`.
 * Never zero. Zero is an answer ("nobody is here", "no leads"), and it would be an answer about
 * records the caller has no right to know anything about.
 */

import {
    accessScopeRestrictsData,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { resolveMetricTimeWindowBounds } from "@/lib/metrics/timeWindow";
import type { MetricSnapshotScopeType } from "@/lib/metrics/snapshots/types";
import type { MetricResolveContext, OipMetricKey, ResolvedMetricValue } from "@/lib/metrics/types";

export type MetricUnavailableReason =
    /** The caller's stored scope admits no records at all, or the requested site/work unit is outside it. */
    | "scope_impossible"
    /** The metric has no scope linkage and the request narrowed (site or work unit). */
    | "org_scope_only"
    /** The metric has no scope linkage and the caller's access is restricted, so the org figure would leak. */
    | "org_scope_only_restricted_caller"
    /** The metric cannot apply the caller's department restriction without an explicit work unit. */
    | "department_scope_requires_work_unit";

/**
 * THE ONE SCOPE A MATERIALISATION MAY USE.
 *
 * Snapshot writers produce canonical truth for a named scope (org, or one site). A restricted
 * operator's scope must never be the input: the row would be labelled `org` while holding a
 * restricted value, and every later reader would be told a narrowed number is the org number.
 * Authority to MATERIALISE (`reports.write`, or the cron credential) is not authority to READ —
 * read paths apply `snapshotReadableForScope` below.
 */
export const CANONICAL_MATERIALIZATION_SCOPE: AdminAccessScopeDimensions = Object.freeze({
    departmentScope: "all",
    allowedDepartmentIds: [],
    siteScope: "all",
    allowedSiteLocationIds: [],
}) as AdminAccessScopeDimensions;

/** An honest "no answer for you" — distinguishable from zero and from "no data in window". */
export function metricUnavailable(
    ctx: Pick<MetricResolveContext, "window" | "mode" | "now">,
    key: OipMetricKey,
    reason: MetricUnavailableReason,
    extraMeta: Record<string, unknown> = {},
): ResolvedMetricValue {
    const def = getMetricDefinition(key);
    const now = ctx.now ?? new Date();
    const { windowStart, windowEnd } = resolveMetricTimeWindowBounds(ctx.window, now);
    return {
        key,
        label: def.label,
        format: def.format,
        value: null,
        formattedValue: formatMetricValue(def.format, null),
        window: ctx.window,
        windowStartIso: windowStart.toISOString(),
        windowEndIso: windowEnd.toISOString(),
        computedAtIso: now.toISOString(),
        sources: def.sources,
        resolveMode: ctx.mode ?? "live",
        meta: {
            ...extraMeta,
            ...(reason === "org_scope_only" || reason === "org_scope_only_restricted_caller"
                ? ORG_SCOPE_ONLY_META
                : {}),
            unavailable: true,
            unavailable_reason: reason,
        },
    };
}

/**
 * The org-only refusal meta Trust and Attendance already published, kept as the shared contract so
 * every org-only metric reads the same way whichever one a consumer asks for.
 */
const ORG_SCOPE_ONLY_META = Object.freeze({
    scope_unsupported: true,
    org_scope_only: true,
    reason:
        "This metric's source records carry no site, location or work-unit linkage, so it can only be " +
        "answered for the whole organization, and only to a caller whose access covers the whole " +
        "organization. Reporting the org-wide value under a narrower scope would misstate it.",
});

/**
 * Rule 3: a metric declared `orgScopeOnly` answers only an unnarrowed request from an unrestricted
 * caller. Department and site restrictions both count — the source has neither linkage, so
 * `recordReadableWithoutDeptSiteLinkage` semantics apply.
 */
export function orgScopeOnlyRefusal(
    ctx: Pick<MetricResolveContext, "scope" | "siteLocationId" | "workUnitId">,
    key: OipMetricKey,
): MetricUnavailableReason | null {
    if (!getMetricDefinition(key).orgScopeOnly) return null;
    if (ctx.siteLocationId?.trim() || ctx.workUnitId?.trim()) return "org_scope_only";
    if (accessScopeRestrictsData(ctx.scope)) return "org_scope_only_restricted_caller";
    return null;
}

/**
 * Rule 2: may this caller read a snapshot materialised (canonically) for this scope?
 *
 * True only where the canonical value is exactly the value the caller's own live read would
 * produce:
 *   - org (and anything not a single site): only an unrestricted caller;
 *   - site: the caller sees every department, and the site is inside their site scope.
 *
 * Pure — routes still perform their own site check against the location hierarchy first.
 */
export function snapshotReadableForScope(
    scope: AdminAccessScopeDimensions,
    scopeType: MetricSnapshotScopeType | string,
    scopeId: string | null,
): boolean {
    if (!accessScopeRestrictsData(scope)) return true;
    if (scopeType !== "site" || !scopeId) return false;
    if (scope.departmentScope !== "all") return false;
    if (scope.siteScope === "all") return true;
    return (scope.allowedSiteLocationIds ?? []).map(String).includes(String(scopeId));
}
