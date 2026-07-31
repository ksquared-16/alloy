import { NextRequest, NextResponse } from "next/server";

import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAnalyticsReadAccess } from "@/lib/admin/canReadAnalytics";
import { assertMetricSiteAccess } from "@/lib/metrics/resolveMetricSiteAccess";
import {
    findUnknownMetricKeys,
    getMetricDefinition,
    listMetricDefinitions,
    parseOipMetricKeys,
} from "@/lib/metrics/registry";
import { parseMetricTimeWindow } from "@/lib/metrics/timeWindow";
import { readMetricTrend } from "@/lib/metrics/snapshots/readMetricTrend";
import type { MetricTrendSummary } from "@/lib/metrics/snapshots/computeMetricTrend";
import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export type MetricTrendApiItem = {
    metric_key: string;
    window: MetricTimeWindowKey;
    scope_type: "org" | "site";
    scope_id: string | null;
    format: string;
    trend_label: string;
    direction: MetricTrendSummary["direction"];
    has_trend: boolean;
    delta: number | null;
    delta_percent: number | null;
    sparkline_y: number[];
};

function resolveScope(siteId: string | null): { scopeType: "org" | "site"; scopeId: string | null } {
    if (siteId) return { scopeType: "site", scopeId: siteId };
    return { scopeType: "org", scopeId: null };
}

/**
 * GET /api/admin/metrics/trends
 *
 * Query: keys, window (default rolling_30d), site_id, points (series limit, default 8)
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
            },
            { status: 400 }
        );
    }

    const keys = parseOipMetricKeys(keysParam);
    if (!keys.length) {
        return NextResponse.json({ error: "Missing or invalid keys" }, { status: 400 });
    }

    const windowParam = searchParams.get("window");
    const parsedWindow = windowParam ? parseMetricTimeWindow(windowParam) : null;
    if (windowParam && !parsedWindow) {
        return NextResponse.json(
            { error: "Invalid window", allowed: ["rolling_7d", "rolling_30d"] },
            { status: 400 }
        );
    }
    const window: MetricTimeWindowKey = parsedWindow ?? "rolling_30d";

    const siteId = (searchParams.get("site_id") ?? searchParams.get("location_id") ?? "").trim() || null;
    const pointsParam = Number(searchParams.get("points") ?? "8");
    const seriesLimit = Number.isFinite(pointsParam) ? Math.min(Math.max(2, Math.floor(pointsParam)), 24) : 8;

    const supabase = createAdminClient();
    const orgId = access.orgId;
    const scope = scopeDimensionsFromAccess(access);

    if (siteId) {
        const allowed = await assertMetricSiteAccess({ supabase, orgId, scope, siteId });
        if (!allowed) {
            return NextResponse.json({ error: "Site not in access scope" }, { status: 403 });
        }
    }

    const { scopeType, scopeId } = resolveScope(siteId);
    const trends: MetricTrendApiItem[] = [];

    for (const key of keys) {
        const def = getMetricDefinition(key);
        const trend = await readMetricTrend(supabase, {
            orgId,
            metricKey: key as OipMetricKey,
            windowKey: window,
            scopeType,
            scopeId,
            seriesLimit,
        });

        trends.push({
            metric_key: key,
            window,
            scope_type: scopeType,
            scope_id: scopeId,
            format: def.format,
            trend_label: trend.trendLabel,
            direction: trend.direction,
            has_trend: trend.hasTrend,
            delta: trend.delta,
            delta_percent: trend.deltaPercent,
            sparkline_y: trend.sparklineY,
        });
    }

    return NextResponse.json({
        org_id: orgId,
        site_id: siteId,
        window,
        trends,
    });
}
