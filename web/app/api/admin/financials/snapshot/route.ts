import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { ORG_ID_FINANCIALS, getFinancialSnapshot } from "@/lib/financials";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/snapshot — MTD and current balances for dashboard widget
 */
export async function GET() {
    const supabase = createAdminClient();
    const snapshot = await getFinancialSnapshot(supabase, ORG_ID_FINANCIALS);
    return NextResponse.json(snapshot);
}
