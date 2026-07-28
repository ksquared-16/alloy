import { NextRequest, NextResponse } from "next/server";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { configureFutureRoomCapacityMeasurement } from "@/lib/operationalQuestions/configureFutureRoomCapacity";
import type { OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * POST /api/admin/operational-questions/configure
 * Shared configure path for UI/BOS — same measurement + exact-version binding.
 * Body: { product_type_id, name?, target_min_seats?, entry_point?, reuse_existing? }
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

    const productTypeId = (
        typeof body.product_type_id === "string" ? body.product_type_id : "capacity_lowest_physical_licensed"
    ) as OrgCalcProductTypeId;
    const entryPoint = body.entry_point === "bos" ? "bos" : "ui";

    try {
        const supabase = createAdminClient();
        const result = await configureFutureRoomCapacityMeasurement(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            name: typeof body.name === "string" ? body.name : "Future Room Capacity",
            productTypeId,
            targetMinSeats:
                typeof body.target_min_seats === "number" ? body.target_min_seats
                : typeof body.target_min_seats === "string" && body.target_min_seats.trim() ?
                    Number(body.target_min_seats)
                :   null,
            entryPoint,
            reuseExisting: body.reuse_existing !== false,
        });
        return NextResponse.json(result, { status: 201 });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Configure failed" },
            { status: 500 },
        );
    }
}
