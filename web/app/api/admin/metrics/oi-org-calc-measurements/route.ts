import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getOrganizationCalculation } from "@/lib/organizationCalculations/persist";
import {
    createOiOrgCalcMeasurementDraft,
    parseOiOrgCalcMeasurements,
    writeOiOrgCalcMeasurements,
    type OiOrgCalcSourceBinding,
} from "@/lib/metrics/oiOrgCalcMeasurements";
import { loadOrgMetadata, saveOrgMetadata } from "@/lib/metrics/oiOrgCalcObserve";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/** GET /api/admin/metrics/oi-org-calc-measurements */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    try {
        const supabase = createAdminClient();
        const metadata = await loadOrgMetadata(supabase, ctx.orgId);
        const measurements = parseOiOrgCalcMeasurements(metadata);
        return NextResponse.json({ measurements });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to list measurements" },
            { status: 500 },
        );
    }
}

/**
 * POST /api/admin/metrics/oi-org-calc-measurements
 * Body: { name, description?, calculation_id, calculation_version_id, target_min_seats? }
 */
export async function POST(req: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Expected object body" }, { status: 400 });

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const calculationId = typeof body.calculation_id === "string" ? body.calculation_id.trim() : "";
    const versionId = typeof body.calculation_version_id === "string" ? body.calculation_version_id.trim() : "";
    if (!calculationId || !versionId) {
        return NextResponse.json({ error: "calculation_id and calculation_version_id are required" }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();
        const loaded = await getOrganizationCalculation(supabase, ctx.orgId, calculationId);
        if (!loaded) return NextResponse.json({ error: "Calculation not found" }, { status: 404 });
        if (loaded.calculation.lifecycle === "archived") {
            return NextResponse.json({ error: "Archived calculations cannot back a measurement" }, { status: 400 });
        }
        const version = loaded.versions.find((v) => v.id === versionId);
        if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
        if (!version.immutable) {
            return NextResponse.json({ error: "Only published versions can back a measurement" }, { status: 400 });
        }

        const source: OiOrgCalcSourceBinding = {
            type: "organization_calculation",
            calculation_id: calculationId,
            calculation_version_id: version.id,
            calculation_name: loaded.calculation.name,
            version_number: version.version_number,
        };

        const targetMin =
            typeof body.target_min_seats === "number" && Number.isFinite(body.target_min_seats) ?
                body.target_min_seats
            : typeof body.target_min_seats === "string" && body.target_min_seats.trim() ?
                Number(body.target_min_seats)
            :   null;

        const measurement = createOiOrgCalcMeasurementDraft({
            name,
            description: typeof body.description === "string" ? body.description : null,
            userId: ctx.userId,
            source,
            target:
                targetMin != null && !Number.isNaN(targetMin) ?
                    { kind: "count_min", value: targetMin }
                :   null,
        });

        const metadata = await loadOrgMetadata(supabase, ctx.orgId);
        const existing = parseOiOrgCalcMeasurements(metadata);
        const next = writeOiOrgCalcMeasurements(metadata, [...existing, measurement]);
        await saveOrgMetadata(supabase, ctx.orgId, next);

        return NextResponse.json({ measurement }, { status: 201 });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create measurement" },
            { status: 500 },
        );
    }
}
