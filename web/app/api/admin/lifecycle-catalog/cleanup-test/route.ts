import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { cleanupTestLifecyclesForOrg } from "@/lib/lifecycle/cleanupTestLifecycles";

/** POST — remove builder-owned test/simulation lifecycle departments (admin only). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { dry_run?: boolean; confirm?: boolean } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        body = {};
    }

    const dry_run = body.dry_run === true || body.confirm !== true;

    try {
        const supabase = createAdminClient();
        const result = await cleanupTestLifecyclesForOrg(supabase, ctx.orgId, { dry_run });
        return NextResponse.json(result);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Cleanup failed" }, { status: 500 });
    }
}
