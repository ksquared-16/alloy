/**
 * AnalyticsContext URL codec — linkable, back-button-safe filter state.
 *
 * Encodes only the CLIENT-SAFE filter subset of AnalyticsContext. `orgId` and
 * `accessScope` are server-trusted and never round-tripped through the URL.
 *
 * Guarantee: `decode(encode(state))` is deep-equal to `state` for any canonical
 * filter state (no null fields, no empty arrays — those are represented as absent).
 */

import type {
    MetricPeriodConfig,
    MetricPeriodKind,
} from "@/lib/metrics/platform/types";
import type { DrillSelection, DrillDestinationKind } from "@/lib/analytics/runtime/types";
import type { MetricDimensionKey } from "@/lib/metrics/types";

/** The URL-encodable subset of AnalyticsContext (filter state only). */
export type AnalyticsFilterState = {
    dateRange: MetricPeriodConfig;
    comparisonPeriod?: MetricPeriodConfig;
    siteLocationIds?: string[];
    departmentId?: string;
    programIds?: string[];
    roomLocationIds?: string[];
    businessProcessKey?: string;
    workUnitId?: string;
    stageKeys?: string[];
    staffIds?: string[];
    accountCategory?: string;
    agingBucket?: string;
    drillSelection?: DrillSelection;
};

const PERIOD_KINDS: ReadonlySet<string> = new Set<MetricPeriodKind>([
    "rolling",
    "week_over_week",
    "month_over_month",
    "quarter_over_quarter",
    "custom",
]);

const DRILL_KINDS: ReadonlySet<string> = new Set<DrillDestinationKind>([
    "queue",
    "records",
    "work_unit",
    "business_process",
    "drawer",
    "report_detail",
    "workflow",
    "optimization_center",
]);

export const DEFAULT_ANALYTICS_PERIOD: MetricPeriodConfig = { version: 1, kind: "rolling", days: 30 };

function encodePeriod(params: URLSearchParams, prefix: string, period: MetricPeriodConfig): void {
    params.set(prefix, period.kind);
    if (period.days != null) params.set(`${prefix}_days`, String(period.days));
    if (period.startIso) params.set(`${prefix}_start`, period.startIso);
    if (period.endIso) params.set(`${prefix}_end`, period.endIso);
}

/** Structural read-only params — satisfied by both URLSearchParams and Next's ReadonlyURLSearchParams. */
export type ReadonlyParams = { get(name: string): string | null };

function decodePeriod(params: ReadonlyParams, prefix: string): MetricPeriodConfig | undefined {
    const raw = params.get(prefix);
    if (raw == null || !PERIOD_KINDS.has(raw)) return undefined;
    const out: MetricPeriodConfig = { version: 1, kind: raw as MetricPeriodKind };
    const days = params.get(`${prefix}_days`);
    if (days != null && days.trim() !== "" && Number.isFinite(Number(days))) out.days = Number(days);
    const start = params.get(`${prefix}_start`);
    if (start) out.startIso = start;
    const end = params.get(`${prefix}_end`);
    if (end) out.endIso = end;
    return out;
}

function encodeList(params: URLSearchParams, key: string, values: string[] | undefined): void {
    if (values && values.length > 0) params.set(key, values.join(","));
}

function decodeList(params: ReadonlyParams, key: string): string[] | undefined {
    const raw = params.get(key);
    if (raw == null || raw.trim() === "") return undefined;
    const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
    return parts.length > 0 ? parts : undefined;
}

function encodeScalar(params: URLSearchParams, key: string, value: string | undefined): void {
    if (value != null && value.trim() !== "") params.set(key, value);
}

function decodeScalar(params: ReadonlyParams, key: string): string | undefined {
    const raw = params.get(key);
    return raw != null && raw.trim() !== "" ? raw : undefined;
}

/** Encode filter state into URL search params (sorted for stable hrefs). */
export function encodeAnalyticsFilters(state: AnalyticsFilterState): URLSearchParams {
    const params = new URLSearchParams();
    encodePeriod(params, "period", state.dateRange);
    if (state.comparisonPeriod) encodePeriod(params, "compare", state.comparisonPeriod);
    encodeList(params, "site", state.siteLocationIds);
    encodeScalar(params, "dept", state.departmentId);
    encodeList(params, "program", state.programIds);
    encodeList(params, "room", state.roomLocationIds);
    encodeScalar(params, "bp", state.businessProcessKey);
    encodeScalar(params, "work_unit", state.workUnitId);
    encodeList(params, "stage", state.stageKeys);
    encodeList(params, "staff", state.staffIds);
    encodeScalar(params, "account_category", state.accountCategory);
    encodeScalar(params, "aging_bucket", state.agingBucket);
    if (state.drillSelection && DRILL_KINDS.has(state.drillSelection.destinationKind)) {
        params.set("drill", state.drillSelection.target);
        params.set("drill_kind", state.drillSelection.destinationKind);
        if (state.drillSelection.dimensionKey) params.set("drill_dim", state.drillSelection.dimensionKey);
        if (state.drillSelection.dimensionValue) params.set("drill_val", state.drillSelection.dimensionValue);
        if (state.drillSelection.markScope) params.set("drill_scope", state.drillSelection.markScope);
    }
    params.sort();
    return params;
}

/** Decode URL search params back into canonical filter state. */
export function decodeAnalyticsFilters(params: ReadonlyParams): AnalyticsFilterState {
    const state: AnalyticsFilterState = {
        dateRange: decodePeriod(params, "period") ?? DEFAULT_ANALYTICS_PERIOD,
    };
    const compare = decodePeriod(params, "compare");
    if (compare) state.comparisonPeriod = compare;
    const sites = decodeList(params, "site");
    if (sites) state.siteLocationIds = sites;
    const dept = decodeScalar(params, "dept");
    if (dept) state.departmentId = dept;
    const programs = decodeList(params, "program");
    if (programs) state.programIds = programs;
    const rooms = decodeList(params, "room");
    if (rooms) state.roomLocationIds = rooms;
    const bp = decodeScalar(params, "bp");
    if (bp) state.businessProcessKey = bp;
    const workUnit = decodeScalar(params, "work_unit");
    if (workUnit) state.workUnitId = workUnit;
    const stages = decodeList(params, "stage");
    if (stages) state.stageKeys = stages;
    const staff = decodeList(params, "staff");
    if (staff) state.staffIds = staff;
    const accountCategory = decodeScalar(params, "account_category");
    if (accountCategory) state.accountCategory = accountCategory;
    const agingBucket = decodeScalar(params, "aging_bucket");
    if (agingBucket) state.agingBucket = agingBucket;

    const drillTarget = decodeScalar(params, "drill");
    const drillKind = decodeScalar(params, "drill_kind");
    if (drillTarget && drillKind && DRILL_KINDS.has(drillKind)) {
        const selection: DrillSelection = {
            destinationKind: drillKind as DrillDestinationKind,
            target: drillTarget,
        };
        const dim = decodeScalar(params, "drill_dim");
        if (dim) selection.dimensionKey = dim as MetricDimensionKey;
        const val = decodeScalar(params, "drill_val");
        if (val) selection.dimensionValue = val;
        const scope = decodeScalar(params, "drill_scope");
        if (scope) selection.markScope = scope;
        state.drillSelection = selection;
    }
    return state;
}

/** Convenience: encode to a query string (no leading "?"). */
export function encodeAnalyticsFiltersString(state: AnalyticsFilterState): string {
    return encodeAnalyticsFilters(state).toString();
}
