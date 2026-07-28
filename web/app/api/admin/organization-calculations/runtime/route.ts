import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { evaluateOrganizationCalculationForRoom } from "@/lib/organizationCalculations/evaluateForRoom";
import { listPublishedRuntimeSurfaceCalculations } from "@/lib/organizationCalculations/persist";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/organization-calculations/runtime
 * Evaluate published runtime_surface-bound calculations for a room + effective date.
 * Query: roomId (required), effectiveAt (optional ISO date, default today UTC).
 */
export async function GET(req: Request) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const url = new URL(req.url);
    const roomId = url.searchParams.get("roomId")?.trim();
    if (!roomId) return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    const effectiveAt =
        url.searchParams.get("effectiveAt")?.trim() || new Date().toISOString().slice(0, 10);
    const siteLocationId = url.searchParams.get("siteId")?.trim() || null;

    try {
        const supabase = createAdminClient();
        const bound = await listPublishedRuntimeSurfaceCalculations(supabase, ctx.orgId);
        const results = [];
        for (const item of bound) {
            const evaluated = await evaluateOrganizationCalculationForRoom(supabase, {
                orgId: ctx.orgId,
                calculationId: item.calculation.id,
                version: item.version.id,
                roomLocationId: roomId,
                siteLocationId,
                effectiveAt,
            });
            results.push(evaluated);
        }
        return NextResponse.json({ roomId, effectiveAt, results });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Runtime evaluation failed" },
            { status: 500 },
        );
    }
}
