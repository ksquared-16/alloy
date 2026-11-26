import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getFinancialSnapshot } from "@/lib/financials";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/snapshot — MTD and current balances for caller org
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    const allowedRead = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowedRead.ok) {
        return NextResponse.json(
            { error: allowedRead.message, required_permission: allowedRead.requiredPermission },
            { status: 403 },
        );
    }
    const snapshot = await getFinancialSnapshot(supabase, ctx.orgId);
    return NextResponse.json(snapshot);
}
