import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { observeOiOrgCalcMeasurement } from "@/lib/metrics/oiOrgCalcObserve";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/metrics/oi-org-calc-measurements/[id]/observe
 * Body: { roomId, effectiveAt, roomLabel?, persistHistory? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const { id } = await params;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Expected object body" }, { status: 400 });

    const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
    if (!roomId) return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    const effectiveAt =
        typeof body.effectiveAt === "string" && body.effectiveAt.trim() ?
            body.effectiveAt.trim()
        :   new Date().toISOString().slice(0, 10);

    try {
        const supabase = createAdminClient();
        const result = await observeOiOrgCalcMeasurement(supabase, {
            orgId: ctx.orgId,
            measurementId: id,
            roomId,
            roomLabel: typeof body.roomLabel === "string" ? body.roomLabel : null,
            effectiveAt,
            persistHistory: body.persistHistory !== false,
        });
        return NextResponse.json(result);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Observe failed";
        const status =
            message.includes("not found") || message.includes("Room not found") ? 404
            : message.includes("Retired") || message.includes("Bound") ? 400
            : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
