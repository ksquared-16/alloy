import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAnalyticsReadAccess } from "@/lib/admin/canReadAnalytics";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { assertMetricSiteAccess } from "@/lib/metrics/resolveMetricSiteAccess";
import {
    parseOipMetricKeys,
    listMetricDefinitions,
    isKnownOipMetricKey,
    getMetricDefinition,
    getMetricSourceMetadata,
    findUnknownMetricKeys,
} from "@/lib/metrics/registry";
import { parseMetricTimeWindow } from "@/lib/metrics/timeWindow";
import { resolveMetrics } from "@/lib/metrics/metricEngine";
import type { MetricDimensions, MetricResolveMode, MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";

export const dynamic = "force-dynamic";

export type MetricResolveApiKpi = {
    kpi_key: string;
    label: string;
    status: string;
    target_kind: string;
    target_max_hours?: number;
    target_min_rate?: number;
    target_max_count?: number;
    thresholds: Record<string, number | undefined>;
    observed_value_hours?: number | null;
    observed_value_rate?: number | null;
    observed_value_count?: number | null;
};

export type MetricResolveApiItem = {
    metric_key: string;
    label: string;
    format: string;
    value: number | null;
    formatted_value: string;
    window: MetricTimeWindowKey;
    window_start: string;
    window_end: string;
    computed_at: string;
    resolve_mode: MetricResolveMode;
    sources: readonly string[];
    source_metadata: ReturnType<typeof getMetricSourceMetadata>;
    dimensions?: MetricDimensions;
    meta?: Record<string, unknown>;
    kpi?: MetricResolveApiKpi;
};

function parseResolveMode(raw: string | null): MetricResolveMode | null {
    if (raw === "live" || raw === "snapshot") return raw;
    if (!raw) return "live";
    return null;
}

function parseDimensions(searchParams: URLSearchParams): MetricDimensions {
    const dimensions: MetricDimensions = {};
    const statusKey = (searchParams.get("status_key") ?? searchParams.get("dimension_status_key") ?? "").trim();
    const lifecycleStage = (
        searchParams.get("lifecycle_stage") ?? searchParams.get("dimension_lifecycle_stage") ?? ""
    ).trim();
    if (statusKey) dimensions.status_key = statusKey;
    if (lifecycleStage) dimensions.lifecycle_stage = lifecycleStage;
    return dimensions;
}

/**
 * GET /api/admin/metrics/resolve
 *
 * Query:
 * - keys (required): comma-separated metric keys
 * - window: rolling_24h | rolling_7d | rolling_30d
 * - site_id / location_id: optional site scope
 * - work_unit_id: optional WU scope for evaluator metrics
 * - mode: live (default) | snapshot
 * - status_key, lifecycle_stage: optional dimensions (enrollment metrics)
 */
export async function GET(request: NextRequest) {
    const auth = await requireAnalyticsReadAccess();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { searchParams } = new URL(request.url);
    const keysParam = searchParams.get("keys");

    const unknownKeys = findUnknownMetricKeys(keysParam);
    if (unknownKeys.length) {
        return NextResponse.json(
            {
                error: "Unknown metric key(s)",
                unknown_keys: unknownKeys,
                available_keys: listMetricDefinitions().map((d) => d.key),
                packs: [...new Set(listMetricDefinitions().map((d) => d.pack))],
            },
            { status: 400 }
        );
    }

    const keys = parseOipMetricKeys(keysParam);
    if (!keys.length) {
        return NextResponse.json(
            {
                error: "Missing or invalid keys",
                hint: "Provide comma-separated metric keys from available_keys",
                available_keys: listMetricDefinitions().map((d) => ({
                    key: d.key,
                    pack: d.pack,
                    format: d.format,
                })),
            },
            { status: 400 }
        );
    }

    const windowParam = searchParams.get("window");
    const parsedWindow = windowParam ? parseMetricTimeWindow(windowParam) : null;
    if (windowParam && !parsedWindow) {
        return NextResponse.json(
            {
                error: "Invalid window",
                allowed: ["rolling_24h", "rolling_7d", "rolling_30d"],
            },
            { status: 400 }
        );
    }

    const modeParam = searchParams.get("mode");
    const mode = parseResolveMode(modeParam);
    if (modeParam && !mode) {
        return NextResponse.json(
            {
                error: "Invalid mode",
                allowed: ["live", "snapshot"],
            },
            { status: 400 }
        );
    }

    const dimensions = parseDimensions(searchParams);
    for (const key of keys) {
        const def = getMetricDefinition(key);
        if (dimensions.status_key && !def.supportsDimensions?.includes("status_key")) {
            return NextResponse.json(
                {
                    error: `Metric ${key} does not support status_key dimension`,
                },
                { status: 400 }
            );
        }
        if (dimensions.lifecycle_stage && !def.supportsDimensions?.includes("lifecycle_stage")) {
            return NextResponse.json(
                {
                    error: `Metric ${key} does not support lifecycle_stage dimension`,
                },
                { status: 400 }
            );
        }
    }

    const siteId = (searchParams.get("site_id") ?? searchParams.get("location_id") ?? "").trim() || null;
    const workUnitId = (searchParams.get("work_unit_id") ?? "").trim() || null;

    const supabase = createAdminClient();
    const orgId = access.orgId;

    const scope = scopeDimensionsFromAccess(access);
    if (siteId) {
        const siteAllowed = await assertMetricSiteAccess({ supabase, orgId, scope, siteId });
        if (!siteAllowed) {
            return NextResponse.json({ error: "Site not in access scope" }, { status: 403 });
        }
    }

    const { data: orgSettings } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", orgId)
        .maybeSingle();
    const orgMetadata = (orgSettings as { metadata?: unknown } | null)?.metadata ?? null;

    const window: MetricTimeWindowKey = parsedWindow ?? "rolling_30d";

    const resolved = await resolveMetrics({
        ctx: {
            supabase,
            orgId,
            scope,
            window,
            siteLocationId: siteId,
            dimensions,
            mode: mode ?? "live",
            workUnitId,
        },
        keys,
        orgMetadata,
        includeKpi: true,
    });

    const metrics: MetricResolveApiItem[] = resolved.map((row) => {
        const m = row.metric;
        const item: MetricResolveApiItem = {
            metric_key: m.key,
            label: m.label,
            format: m.format,
            value: m.value,
            formatted_value: m.formattedValue,
            window: m.window,
            window_start: m.windowStartIso,
            window_end: m.windowEndIso,
            computed_at: m.computedAtIso,
            resolve_mode: m.resolveMode,
            sources: m.sources,
            source_metadata: getMetricSourceMetadata(m.key as OipMetricKey),
            ...(Object.keys(dimensions).length ? { dimensions } : {}),
            ...(m.meta ? { meta: m.meta } : {}),
        };

        if (row.kpi) {
            item.kpi = {
                kpi_key: row.kpi.key,
                label: row.kpi.label,
                status: row.kpi.status,
                target_kind: row.kpi.targetKind,
                target_max_hours: row.kpi.targetMaxHours,
                target_min_rate: row.kpi.targetMinRate,
                target_max_count: row.kpi.targetMaxCount,
                thresholds: {
                    healthy_max_hours: row.kpi.thresholds.healthyMaxHours,
                    warning_max_hours: row.kpi.thresholds.warningMaxHours,
                    healthy_min_rate: row.kpi.thresholds.healthyMinRate,
                    warning_min_rate: row.kpi.thresholds.warningMinRate,
                    healthy_max_count: row.kpi.thresholds.healthyMaxCount,
                    warning_max_count: row.kpi.thresholds.warningMaxCount,
                },
                observed_value_hours: row.kpi.observedValueHours,
                observed_value_rate: row.kpi.observedValueRate,
                observed_value_count: row.kpi.observedValueCount,
            };
        }

        return item;
    });

    return NextResponse.json({
        org_id: orgId,
        site_id: siteId,
        work_unit_id: workUnitId,
        mode: mode ?? "live",
        metrics,
    });
}
