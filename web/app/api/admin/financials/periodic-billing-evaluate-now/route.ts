import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsWriteAllowed } from "@/lib/financials/financialsPermissions";
import { readPeriodicBillingSchedule } from "@/lib/financials/periodicBilling/periodicBillingSchedule";
import { ensureScheduledWorkConsumersRegistered } from "@/lib/scheduledWork/scheduledWorkConsumers";
import { makeScheduledWorkDueNow } from "@/lib/scheduledWork/makeScheduledWorkDueNow";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/financials/periodic-billing-evaluate-now
 *
 * ASK FOR THE NEXT EVALUATION SOONER — not for billing to happen now.
 *
 * An operator who has just fixed configuration should not wait a day to find out whether
 * automation agrees. This makes the organization's existing Periodic Billing schedule due, and
 * then gets out of the way: the ordinary clock discovers it, claims it under the ordinary lease,
 * and dispatches the ordinary registered handler. Nothing here runs Financials.
 *
 * ── IT IS NOT ACTIVATION ──────────────────────────────────────────────────────────────────────
 *
 * If the organization has no Periodic Billing schedule, this REFUSES rather than provisioning one.
 * Activation is a separate decision with its own route, and collapsing the two would mean an
 * operator asking "evaluate now" could switch automatic billing on without ever being asked.
 *
 * ── THE RESPONSE IS A REQUEST, NOT A RESULT ───────────────────────────────────────────────────
 *
 * `evaluation_requested` means the work is due. Whether anything was billed is the occurrence's
 * answer, minutes later, and reporting them as one act would tell an operator that billing
 * succeeded when all that happened was a scheduling change.
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

    const schedule = await readPeriodicBillingSchedule(supabase, ctx.orgId);
    if (!schedule.scheduleId) {
        return NextResponse.json(
            {
                outcome: "refused",
                reason: "not_activated",
                detail: "Automatic Periodic Billing is not active for this organization. Activate it first.",
            },
            { status: 409 },
        );
    }

    /*
     * REGISTER THE CONSUMERS FIRST, exactly as the wake route does.
     *
     * The handler registry is a module-scope map filled by this call, so in a request instance
     * that has never served a wake it is EMPTY — and the generic command, quite correctly, refuses
     * to make work due for a handler it cannot resolve. Measured on deployed staging: the first
     * evaluate-now returned `handler_not_registered` for a handler that is registered in the
     * running app. The guard was right and the caller was incomplete; the registry belongs to
     * whoever is about to depend on it.
     */
    ensureScheduledWorkConsumersRegistered();

    const result = await makeScheduledWorkDueNow(supabase, {
        orgId: ctx.orgId,
        scheduleId: schedule.scheduleId,
    });

    return NextResponse.json(result, { status: result.outcome === "evaluation_requested" ? 200 : 409 });
}
