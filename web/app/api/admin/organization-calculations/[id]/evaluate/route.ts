import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { evaluateOrganizationCalculationForRoom } from "@/lib/organizationCalculations/evaluateForRoom";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/organization-calculations/[id]/evaluate
 * Body: { roomId, effectiveAt, version?: "published"|"draft"|versionId, siteId? }
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

    const version =
        body.version === "draft" || body.version === "published" || typeof body.version === "string" ?
            (body.version as "published" | "draft" | string)
        :   "published";

    try {
        const supabase = createAdminClient();
        const result = await evaluateOrganizationCalculationForRoom(supabase, {
            orgId: ctx.orgId,
            calculationId: id,
            version,
            roomLocationId: roomId,
            siteLocationId: typeof body.siteId === "string" ? body.siteId : null,
            programCategoryId: typeof body.programCategoryId === "string" ? body.programCategoryId : null,
            ageGroupKey: typeof body.ageGroupKey === "string" ? body.ageGroupKey : null,
            effectiveAt,
        });
        return NextResponse.json(result);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Evaluation failed";
        const status = message.includes("not found") ? 404 : message.includes("No ") ? 400 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
