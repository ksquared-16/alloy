import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readPeriodicBillingSchedule } from "@/lib/financials/periodicBilling/periodicBillingSchedule";
import { AUTOMATIC_CATCH_UP_PERIOD_LIMIT } from "@/lib/financials/periodicBilling/evaluatePeriodicBilling";
import { BILLING_PERIODIC_HANDLER_KEY } from "@/lib/scheduledWork/scheduledWorkHandlerKeys";
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

    /*
     * ── THE LAST AUTOMATIC RUN, AS THE SCHEDULER RECORDED IT (W7-F021) ─────────────────────────
     *
     * The Charges workspace presents tuition billing as what it is — automatic — and an operator
     * reading "automatic" needs to see that it ran and what it did. The answer is the most recent
     * FINISHED attempt of this organization's periodic-billing handler: its time, its outcome, and the
     * domain's own diagnostic (how many assignments were billed, how many periods, how many need a
     * person). Nothing is computed here; a run with no diagnostic reports nulls rather than zeros.
     */
    const { data: attemptRows } = await supabase
        .from("scheduled_work_attempts")
        .select("finished_at, outcome, diagnostic")
        .eq("org_id", ctx.orgId)
        .eq("handler_key", BILLING_PERIODIC_HANDLER_KEY)
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false })
        .limit(1);
    const last = ((attemptRows ?? []) as Array<{ finished_at: string; outcome: string | null; diagnostic: Record<string, unknown> | null }>)[0] ?? null;
    const diagnostic = (last?.diagnostic ?? null) as {
        evaluated_for?: string;
        assignments_considered?: number;
        counts?: Record<string, number>;
        periods_billed?: unknown[];
        requires_operator?: unknown[];
    } | null;
    const counts = diagnostic?.counts ?? null;

    return NextResponse.json({
        automatic_billing_active: state.automaticBillingActive,
        schedule_exists: state.scheduleExists,
        next_evaluation_at: state.nextDueAt,
        automatic_catch_up_period_limit: AUTOMATIC_CATCH_UP_PERIOD_LIMIT,
        last_run: last
            ? {
                  finished_at: last.finished_at,
                  outcome: last.outcome,
                  evaluated_for: diagnostic?.evaluated_for ?? null,
                  assignments_considered: diagnostic?.assignments_considered ?? null,
                  assignments_billed: counts
                      ? (counts.normal_period_processed ?? 0) + (counts.short_catch_up_processed ?? 0)
                      : null,
                  periods_billed: Array.isArray(diagnostic?.periods_billed) ? diagnostic!.periods_billed!.length : null,
                  needs_operator: Array.isArray(diagnostic?.requires_operator) ? diagnostic!.requires_operator!.length : null,
                  configuration_refused: counts ? (counts.configuration_refused ?? 0) : null,
              }
            : null,
    });
}
