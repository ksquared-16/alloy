import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { bindRuntimeSurfaceVersion } from "@/lib/organizationCalculations/persist";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/organization-calculations/[id]/bind-runtime
 * Body: { versionId } — bind exact immutable version to room-capacity runtime surface.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
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
    if (!isRecord(body) || typeof body.versionId !== "string" || !body.versionId.trim()) {
        return NextResponse.json({ error: "versionId is required" }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();
        const bound = await bindRuntimeSurfaceVersion(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            calculationId: id,
            versionId: body.versionId.trim(),
        });
        return NextResponse.json(bound);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Bind failed";
        const status = message.includes("not found") ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}
