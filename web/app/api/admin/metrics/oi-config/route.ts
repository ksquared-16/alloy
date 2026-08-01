import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getKpiDefinition, listKpiDefinitions } from "@/lib/metrics/kpiRegistry";
import {
    listOiCatalogKpiKeys,
    parseOiConfig,
    resolveOiMeasurementStatus,
    summarizeOiPack,
    type OiConfig,
    type OiMeasurementStatus,
} from "@/lib/metrics/oiConfig";
import { getMetricPack } from "@/lib/metrics/packs";
import type { OipKpiKey } from "@/lib/metrics/types";

export const dynamic = "force-dynamic";

const KPI_KEYS = new Set(listKpiDefinitions().map((d) => d.key));

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function buildResponse(orgId: string, metadata: unknown) {
    const config = parseOiConfig(metadata);
    const measurements = listOiCatalogKpiKeys().map((kpiKey) => {
        const def = getKpiDefinition(kpiKey);
        return {
            kpi_key: kpiKey,
            label: def.label,
            pack: def.pack,
            status: resolveOiMeasurementStatus(kpiKey, config),
        };
    });

    return {
        org_id: orgId,
        config,
        measurements,
        packs: summarizeOiPack(config),
    };
}

function applyPatch(current: OiConfig, body: Record<string, unknown>): OiConfig | { error: string } {
    const next: OiConfig = {
        measurements: { ...(current.measurements ?? {}) },
        packs: { ...(current.packs ?? {}) },
    };

    if (body.measurements !== undefined) {
        if (!isRecord(body.measurements)) return { error: "oi_config.measurements must be an object" };
        for (const [key, value] of Object.entries(body.measurements)) {
            if (!KPI_KEYS.has(key as OipKpiKey)) return { error: `Unknown measurement: ${key}` };
            if (value === null) {
                delete next.measurements![key as OipKpiKey];
                continue;
            }
            if (!isRecord(value)) return { error: `Invalid measurement state for ${key}` };
            const status = value.status as OiMeasurementStatus;
            if (status !== "active" && status !== "disabled" && status !== "retired") {
                return { error: `Invalid measurement status for ${key}` };
            }
            next.measurements![key as OipKpiKey] = { status };
        }
    }

    if (body.packs !== undefined) {
        if (!isRecord(body.packs)) return { error: "oi_config.packs must be an object" };
        for (const [key, value] of Object.entries(body.packs)) {
            if (!getMetricPack(key)) return { error: `Unknown pack: ${key}` };
            if (value === null) {
                delete next.packs![key];
                continue;
            }
            if (!isRecord(value) || typeof value.enabled !== "boolean") {
                return { error: `Invalid pack state for ${key}` };
            }
            next.packs![key] = { enabled: value.enabled };
        }
    }

    return next;
}

/** GET /api/admin/metrics/oi-config */
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

    return NextResponse.json(buildResponse(ctx.orgId, (data as { metadata?: unknown } | null)?.metadata ?? null));
}

/** PATCH /api/admin/metrics/oi-config — admin-only sparse merge. */
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

    if (!isRecord(body) || !isRecord(body.oi_config)) {
        return NextResponse.json({ error: "Expected { oi_config: { measurements?, packs? } }" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const currentMeta = isRecord((existing as { metadata?: unknown } | null)?.metadata)
        ? ({ ...(existing as { metadata: Record<string, unknown> }).metadata } as Record<string, unknown>)
        : {};

    const patched = applyPatch(parseOiConfig(currentMeta), body.oi_config);
    if ("error" in patched) {
        return NextResponse.json({ error: patched.error }, { status: 400 });
    }

    const newMeta = { ...currentMeta, oi_config: patched };
    const { error: upsertErr } = await supabase.from("org_settings").upsert(
        { org_id: ctx.orgId, metadata: newMeta },
        { onConflict: "org_id" },
    );

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

    return NextResponse.json(buildResponse(ctx.orgId, newMeta));
}
