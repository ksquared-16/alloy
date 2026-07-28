import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { listOrganizationCalculationCatalog } from "@/lib/organizationCalculations/catalog";

export const dynamic = "force-dynamic";

/** GET /api/admin/organization-calculations/catalog — approved inputs + operators. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    return NextResponse.json(listOrganizationCalculationCatalog());
}
