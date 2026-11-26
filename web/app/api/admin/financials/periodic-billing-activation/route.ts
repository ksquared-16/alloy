import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsWriteAllowed } from "@/lib/financials/financialsPermissions";
import {
    ensurePeriodicBillingSchedule,
    readPeriodicBillingSchedule,
} from "@/lib/financials/periodicBilling/periodicBillingSchedule";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/financials/periodic-billing-activation
 *
 * TURN AUTOMATIC PERIODIC BILLING ON FOR THIS ORGANIZATION — the canonical activation authority,
 * and the only sanctioned way the schedule row comes into being.
 *
 * ── WHY THIS IS A ROUTE AND NOT A MIGRATION ───────────────────────────────────────────────────
 *
 * Provisioning IS activation. A migration or a startup hook would switch automatic billing on for
 * every tenant the moment a candidate was promoted, which is exactly the collapse of "ship the
 * capability" into "start billing" that keeping the handler and the schedule separate exists to
 * prevent. Activation is a decision someone makes for one organization, so it is an authenticated
 * write that an operator's grants gate — `fin.write`, the same permission that generating tuition
 * requires, because switching on something that generates tuition is not a lesser act.
 *
 * It creates at most ONE schedule per organization and is safe to call twice: an existing schedule
 * is re-activated rather than duplicated, because two schedules would wake the handler twice a day
 * and only generation's idempotency would stand between that and a second look at the same money.
 *
 * It answers in domain terms. No lease, no claim token, no occurrence — an operator activating
 * billing is not administering a scheduler.
 */
export async function POST() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsWriteAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    /*
     * FIRST DUE MOMENT IS NOW. The domain decides what is owed when it wakes; making the schedule
     * due immediately means activation is observable rather than something that may or may not
     * have happened by the time anyone looks. It cannot over-bill by being early — a period that
     * has not begun is not due, and one already billed converges.
     */
    const firstDueAt = new Date().toISOString();
    const result = await ensurePeriodicBillingSchedule(supabase, {
        orgId: ctx.orgId,
        firstDueAt,
        actorUserId: ctx.userId,
    });
    const state = await readPeriodicBillingSchedule(supabase, ctx.orgId);

    return NextResponse.json({
        activated: state.automaticBillingActive,
        created: result.created,
        schedule_id: state.scheduleId,
        next_evaluation_at: state.nextDueAt,
        activated_at: firstDueAt,
    });
}
