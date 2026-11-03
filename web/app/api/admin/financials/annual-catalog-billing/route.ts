import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { fetchOrgBusinessDate } from "@/lib/financials/businessDate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import {
    ANNUAL_CATALOG_BILLING_ACTIVE,
    ANNUAL_CATALOG_TIMING_PROPOSAL,
} from "@/lib/financials/catalogRecurring/annualCatalogFeeSchedule";
import { readAnnualCatalogFeeSchedule } from "@/lib/financials/catalogRecurring/readAnnualCatalogFeeSchedule";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/annual-catalog-billing
 *
 * WHO AN ANNUAL CATALOG FEE WOULD CHARGE, AND WHEN — a preview, never a run.
 *
 * Required annual Catalog items, each in-scope enrolled child's current and next annual period, and
 * whether a charge of that item already exists for the child in it. `active: false` is the truth:
 * there is no write path for annual Catalog fees, and the timing shown is a proposal under review.
 *
 * READ ONLY. `fin.read`, like every other Financials read. Every query is a select.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }
    try {
        const asOf = await fetchOrgBusinessDate(supabase, ctx.orgId);
        const schedule = await readAnnualCatalogFeeSchedule(supabase, ctx.orgId, asOf);
        return NextResponse.json({
            active: ANNUAL_CATALOG_BILLING_ACTIVE,
            timing: ANNUAL_CATALOG_TIMING_PROPOSAL,
            ...schedule,
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read the annual Catalog schedule." }, { status: 500 });
    }
}
