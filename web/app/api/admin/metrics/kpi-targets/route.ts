import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    listKpiDefinitions,
    resolveKpiTargetConfig,
    type OrgKpiTargetsMetadata,
} from "@/lib/metrics/kpiRegistry";
import type { OipKpiKey } from "@/lib/metrics/types";
import { formatKpiTargetDisplay } from "@/lib/metrics/kpiTargetFormatting";

export const dynamic = "force-dynamic";

const KPI_KEYS = new Set(listKpiDefinitions().map((d) => d.key));

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * GET /api/admin/metrics/kpi-targets — effective KPI targets for current org.
 * PATCH — admin-only; deep-merges metadata.kpi_targets.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const metadata = (data as { metadata?: unknown } | null)?.metadata ?? null;
    const items = listKpiDefinitions().map((def) => {
        const target = resolveKpiTargetConfig(def.key, metadata);
        return {
            kpi_key: def.key,
            label: def.label,
            metric_key: def.metricKey,
            pack: def.pack,
            target_kind: target.kind,
            target_display: formatKpiTargetDisplay(def.key, target),
            target: {
                target_max_hours: target.targetMaxHours ?? null,
                target_min_rate: target.targetMinRate ?? null,
                target_max_count: target.targetMaxCount ?? null,
                healthy_max_hours: target.thresholds.healthyMaxHours ?? null,
                warning_max_hours: target.thresholds.warningMaxHours ?? null,
                healthy_min_rate: target.thresholds.healthyMinRate ?? null,
                warning_min_rate: target.thresholds.warningMinRate ?? null,
                healthy_max_count: target.thresholds.healthyMaxCount ?? null,
                warning_max_count: target.thresholds.warningMaxCount ?? null,
            },
            has_org_override: Boolean(
                isRecord(metadata) &&
                    isRecord((metadata as OrgKpiTargetsMetadata).kpi_targets) &&
                    (metadata as OrgKpiTargetsMetadata).kpi_targets?.[def.key]
            ),
        };
    });

    return NextResponse.json({ org_id: ctx.orgId, items });
}

export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!isRecord(body) || !isRecord(body.kpi_targets)) {
        return NextResponse.json({ error: "Expected { kpi_targets: { ... } }" }, { status: 400 });
    }

    const incoming = body.kpi_targets;
    for (const key of Object.keys(incoming)) {
        if (!KPI_KEYS.has(key as OipKpiKey)) {
            return NextResponse.json({ error: `Unknown KPI key: ${key}` }, { status: 400 });
        }
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const currentMeta = isRecord((existing as { metadata?: unknown } | null)?.metadata)
        ? ((existing as { metadata: Record<string, unknown> }).metadata as Record<string, unknown>)
        : {};

    const currentKpiTargets = isRecord(currentMeta.kpi_targets) ? { ...currentMeta.kpi_targets } : {};

    for (const [key, value] of Object.entries(incoming)) {
        if (value === null) {
            delete currentKpiTargets[key];
        } else if (isRecord(value)) {
            currentKpiTargets[key] = { ...(isRecord(currentKpiTargets[key]) ? currentKpiTargets[key] : {}), ...value };
        }
    }

    const newMeta = { ...currentMeta, kpi_targets: currentKpiTargets };

    const { error: upsertErr } = await supabase.from("org_settings").upsert(
        { org_id: ctx.orgId, metadata: newMeta },
        { onConflict: "org_id" }
    );

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

    return GET();
}
