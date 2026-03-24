import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getFinancialSnapshot } from "@/lib/financials";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/snapshot — MTD and current balances for caller org
 */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    const snapshot = await getFinancialSnapshot(supabase, ctx.orgId);
    return NextResponse.json(snapshot);
}
