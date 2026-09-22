/**
 * THE SCHEDULE THAT MAKES AUTOMATIC BILLING ACTUALLY HAPPEN — and the honest way to ask whether it
 * does.
 *
 * ── A PRODUCTIZED HANDLER IS NOT AUTOMATIC BILLING ────────────────────────────────────────────
 *
 * Replacing the shadow body means the scheduler CAN wake Financials. It does not mean anything
 * ever will: the runtime only dispatches occurrences materialized from a `scheduled_work` row, and
 * until this run the only production code that created one was Autopay. An organization with no
 * row is not billed automatically no matter how complete the handler is — so "is automatic billing
 * active?" is a question about THIS TENANT'S SCHEDULE, never about whether the code shipped.
 *
 * That distinction is the whole reason this file exists rather than a boolean constant. A constant
 * would let the product claim automation the moment the code deployed, which is the copy §27
 * forbids and the exact lie the SHADOW classification existed to prevent.
 *
 * ── WHY DAILY, AND WHY THAT CARRIES NO ECONOMICS ──────────────────────────────────────────────
 *
 * The schedule is a daily heartbeat. It does not know the organization's billing frequency and
 * must not: a weekly tenant and a monthly tenant get the same daily wake, and the DOMAIN decides
 * on each one whether any canonical period is outstanding. Encoding cadence in the recurrence is
 * how "it's the first, bill monthly" gets written into infrastructure — a wall-clock shortcut
 * standing in for period identity. Waking more often than necessary costs one cheap read and
 * cannot bill twice, because generation converges per assignment per period.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { BILLING_PERIODIC_HANDLER_KEY } from "@/lib/scheduledWork/scheduledWorkHandlerKeys";

const SCHEDULE_TABLE = "scheduled_work";

/** One schedule per organization, found by this label rather than by guessing at domain_ref. */
export const PERIODIC_BILLING_SCHEDULE_LABEL = "financials_periodic_billing";

export type PeriodicBillingScheduleState = {
    /** True only when a schedule exists, is active, and still owes a next moment. */
    automaticBillingActive: boolean;
    scheduleId: string | null;
    nextDueAt: string | null;
    /** Present but stopped — a different state from never provisioned, and said differently. */
    scheduleExists: boolean;
};

export async function readPeriodicBillingSchedule(
    supabase: SupabaseClient,
    orgId: string,
): Promise<PeriodicBillingScheduleState> {
    const { data } = await supabase
        .from(SCHEDULE_TABLE)
        .select("id, is_active, next_due_at")
        .eq("org_id", orgId)
        .eq("handler_key", BILLING_PERIODIC_HANDLER_KEY)
        .eq("label", PERIODIC_BILLING_SCHEDULE_LABEL)
        .maybeSingle();

    const row = (data ?? null) as { id?: string; is_active?: boolean; next_due_at?: string | null } | null;
    if (!row?.id) {
        return { automaticBillingActive: false, scheduleId: null, nextDueAt: null, scheduleExists: false };
    }
    return {
        automaticBillingActive: Boolean(row.is_active) && Boolean(row.next_due_at),
        scheduleId: row.id,
        nextDueAt: row.next_due_at ?? null,
        scheduleExists: true,
    };
}

/**
 * Provision the organization's billing heartbeat. Idempotent: an existing schedule is re-activated
 * rather than duplicated, because two schedules would wake the handler twice a day and only the
 * generation idempotency would stand between that and a second look at the same money.
 *
 * DELIBERATELY NOT CALLED ANYWHERE YET. Provisioning IS activation, and activation is authorized
 * separately — a migration or a startup hook that quietly created these rows would switch
 * automatic billing on for every tenant the moment the candidate was promoted.
 */
export async function ensurePeriodicBillingSchedule(
    supabase: SupabaseClient,
    args: { orgId: string; firstDueAt: string; actorUserId?: string | null },
): Promise<{ scheduleId: string | null; created: boolean }> {
    const existing = await readPeriodicBillingSchedule(supabase, args.orgId);
    if (existing.scheduleId) {
        await supabase
            .from(SCHEDULE_TABLE)
            .update({
                is_active: true,
                next_due_at: existing.nextDueAt ?? args.firstDueAt,
                updated_by: args.actorUserId ?? null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existing.scheduleId);
        return { scheduleId: existing.scheduleId, created: false };
    }

    const { data } = await supabase
        .from(SCHEDULE_TABLE)
        .insert({
            org_id: args.orgId,
            handler_key: BILLING_PERIODIC_HANDLER_KEY,
            recurrence_kind: "daily",
            next_due_at: args.firstDueAt,
            is_active: true,
            label: PERIODIC_BILLING_SCHEDULE_LABEL,
            /* Opaque to the scheduler, and it carries no cadence — the domain reads canonical truth. */
            domain_ref: { purpose: "automatic periodic billing" },
            created_by: args.actorUserId ?? null,
        })
        .select("id")
        .maybeSingle();

    const id = (data as { id?: string } | null)?.id ?? null;
    return { scheduleId: id, created: Boolean(id) };
}
