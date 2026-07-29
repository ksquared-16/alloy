import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getOrganizationCalculation } from "@/lib/organizationCalculations/persist";
import {
    parseOiOrgCalcHistory,
    parseOiOrgCalcMeasurements,
    writeOiOrgCalcMeasurements,
    type OiOrgCalcMeasurementStatus,
} from "@/lib/metrics/oiOrgCalcMeasurements";
import { loadOrgMetadata, saveOrgMetadata } from "@/lib/metrics/oiOrgCalcObserve";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/admin/metrics/oi-org-calc-measurements/[id] */
export async function GET(_req: NextRequest, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const { id } = await params;
    try {
        const supabase = createAdminClient();
        const metadata = await loadOrgMetadata(supabase, ctx.orgId);
        const measurement = parseOiOrgCalcMeasurements(metadata).find((m) => m.id === id);
        if (!measurement) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const history = parseOiOrgCalcHistory(metadata, id);
        return NextResponse.json({ measurement, history });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Load failed" }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/metrics/oi-org-calc-measurements/[id]
 * Body: { status?, target_min_seats?, calculation_version_id? (rebind), name?, description? }
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }
    const { id } = await params;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Expected object body" }, { status: 400 });

    try {
        const supabase = createAdminClient();
        const metadata = await loadOrgMetadata(supabase, ctx.orgId);
        const measurements = parseOiOrgCalcMeasurements(metadata);
        const idx = measurements.findIndex((m) => m.id === id);
        if (idx < 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
        let next = { ...measurements[idx]! };

        if (typeof body.name === "string" && body.name.trim()) next.name = body.name.trim();
        if (body.description !== undefined) {
            next.description = typeof body.description === "string" ? body.description.trim() || null : null;
        }
        if (typeof body.status === "string") {
            const status = body.status as OiOrgCalcMeasurementStatus;
            if (status !== "active" && status !== "disabled" && status !== "retired") {
                return NextResponse.json({ error: "Invalid status" }, { status: 400 });
            }
            next.status = status;
        }
        if (body.target_min_pct !== undefined || body.target_max_pct !== undefined) {
            const min =
                typeof body.target_min_pct === "number" ? body.target_min_pct
                : body.target_min_pct === null ? null
                : typeof body.target_min_pct === "string" && body.target_min_pct.trim() ?
                    Number(body.target_min_pct)
                :   null;
            const max =
                typeof body.target_max_pct === "number" ? body.target_max_pct
                : body.target_max_pct === null ? null
                : typeof body.target_max_pct === "string" && body.target_max_pct.trim() ?
                    Number(body.target_max_pct)
                :   null;
            if (min == null && max == null) {
                next.target = null;
            } else if (min == null || max == null || Number.isNaN(min) || Number.isNaN(max) || min > max) {
                return NextResponse.json({ error: "Invalid healthy range" }, { status: 400 });
            } else {
                next.target = { kind: "rate_range", min, max };
                next.unit = "percent";
            }
        } else if (body.target_min_seats === null) {
            next.target = null;
        } else if (body.target_min_seats !== undefined) {
            const n = typeof body.target_min_seats === "number" ? body.target_min_seats : Number(body.target_min_seats);
            if (Number.isNaN(n)) return NextResponse.json({ error: "Invalid target" }, { status: 400 });
            next.target = { kind: "count_min", value: n };
        }

        if (typeof body.calculation_version_id === "string" && body.calculation_version_id.trim()) {
            const loaded = await getOrganizationCalculation(supabase, ctx.orgId, next.source.calculation_id);
            if (!loaded) return NextResponse.json({ error: "Calculation not found" }, { status: 404 });
            const version = loaded.versions.find((v) => v.id === body.calculation_version_id);
            if (!version || !version.immutable) {
                return NextResponse.json({ error: "Only published versions can be bound" }, { status: 400 });
            }
            next.source = {
                ...next.source,
                calculation_version_id: version.id,
                version_number: version.version_number,
                calculation_name: loaded.calculation.name,
            };
        }

        next.updated_at = new Date().toISOString();
        const list = [...measurements];
        list[idx] = next;
        await saveOrgMetadata(supabase, ctx.orgId, writeOiOrgCalcMeasurements(metadata, list));
        return NextResponse.json({ measurement: next });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
    }
}
