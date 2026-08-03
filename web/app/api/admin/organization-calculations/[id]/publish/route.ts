import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { publishOrganizationCalculation } from "@/lib/organizationCalculations/persist";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/admin/organization-calculations/[id]/publish — freeze immutable version. */
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
        const published = await publishOrganizationCalculation(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            id,
        });
        return NextResponse.json(published);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Publish failed";
        const status = message.includes("not found") ? 404 : message.includes("No draft") ? 400 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
