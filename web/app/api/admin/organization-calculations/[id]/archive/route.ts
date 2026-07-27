import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { archiveOrganizationCalculation } from "@/lib/organizationCalculations/persist";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/admin/organization-calculations/[id]/archive */
export async function POST(_req: Request, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }
    const { id } = await params;
    try {
        const supabase = createAdminClient();
        const calculation = await archiveOrganizationCalculation(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            id,
        });
        return NextResponse.json({ calculation });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Archive failed";
        return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
    }
}
