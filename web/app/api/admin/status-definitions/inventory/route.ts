import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { runStatusDefinitionsInventory } from "@/lib/admin/statusDefinitionsInventory";

/** GET: read-only status_definitions vs persisted value inventory for current org. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    try {
        const report = await runStatusDefinitionsInventory(supabase, ctx.orgId);
        return NextResponse.json(report);
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
