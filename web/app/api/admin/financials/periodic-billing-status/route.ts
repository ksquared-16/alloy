import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readPeriodicBillingSchedule } from "@/lib/financials/periodicBilling/periodicBillingSchedule";
import { AUTOMATIC_CATCH_UP_PERIOD_LIMIT } from "@/lib/financials/periodicBilling/evaluatePeriodicBilling";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/periodic-billing-status
 *
 * IS RECURRING TUITION BILLED AUTOMATICALLY FOR THIS ORGANIZATION — answered from this tenant's
 * own schedule, never from whether the code that could bill it shipped.
 *
 * The distinction is the point. A productized handler means the scheduler CAN wake Financials; an
 * organization with no schedule row is still billed by an operator pressing Generate Tuition, and
 * a surface that said "automatic" because a deploy happened would be telling every one of those
 * operators something false about their own money.
 *
 * READ ONLY. `fin.read`, like every other Financials read. It exposes no lease, no occurrence and
 * no worker — the operator's question is a domain question, and the answer is a domain answer.
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

    const state = await readPeriodicBillingSchedule(supabase, ctx.orgId);
    return NextResponse.json({
        automatic_billing_active: state.automaticBillingActive,
        schedule_exists: state.scheduleExists,
        next_evaluation_at: state.nextDueAt,
        automatic_catch_up_period_limit: AUTOMATIC_CATCH_UP_PERIOD_LIMIT,
    });
}
