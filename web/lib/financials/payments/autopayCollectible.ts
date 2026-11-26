/**
 * WHAT AUTOPAY MAY COLLECT RIGHT NOW — read from Financials, never computed here.
 *
 * Autopay's amount policy is `amount_due`, and the whole risk of that policy lives in the word
 * CURRENT. A figure resolved when the occurrence was scheduled is a snapshot, and a snapshot is how
 * a family gets charged $500 they paid in cash yesterday. So this is called immediately before
 * collection, every time, and it reads the same authorities the operator's own screen reads:
 *
 *   · which sources bill this account ...... the customer itself and its enrolment agreements
 *   · what each charge may be collected for . `resolveFamilyCollectible` (collectible ceiling,
 *     which is outstanding MINUS any submitted subsidy claim — asking for raw outstanding is
 *     refused by the collection engine, so it is not what Autopay may request)
 *
 * No total is stored anywhere. There is no Autopay balance, because a second balance would be free
 * to disagree with the first.
 *
 * ── WHAT "ACTIONABLE" MEANS ──
 *
 * The generic scheduler knows when to WAKE this domain; it does not know what a due date is. The
 * arrangement's `on_due_date` policy plus its offset decides which charges have actually come due,
 * and that decision is made here because it is Payments' to make.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { planSettlement } from "@/lib/financials/settlement/automaticSettlement";

export type AutopayDueCharge = {
    chargeId: string;
    dueDate: string;
    outstandingCents: number;
};

export type AutopayCollectible = {
    charges: AutopayDueCharge[];
    totalCents: number;
    /** The earliest due date NOT yet actionable, so the handler can tell the scheduler when to return. */
    nextDueDate: string | null;
};

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** `on_due_date` + offset, as a plain date string. Offsets are small and bounded by the schema. */
export function actionableOnOrAfter(dueDate: string, offsetDays: number): string {
    const d = new Date(`${dueDate}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return dueDate;
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

/**
 * The account's charges that have come due under this arrangement's timing, with what each still
 * owes.
 *
 * A charge with nothing outstanding is omitted rather than reported as zero: it is settled history,
 * and including it would put a $0 collection in front of the provider.
 */
export async function resolveAutopayCollectible(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        customerId: string;
        timingOffsetDays: number;
        asOf: string;
        /**
         * W7-F051: WHOSE responsibility this Autopay collects. Only the payer's own shares and what
         * the account owes as a whole — never another person's share.
         */
        payerPersonId?: string | null;
    },
): Promise<AutopayCollectible> {
    const orgId = t(args.orgId);
    const customerId = t(args.customerId);
    const empty: AutopayCollectible = { charges: [], totalCents: 0, nextDueDate: null };
    if (!orgId || !customerId) return empty;

    /*
     * W7-F051: THE SETTLEMENT AUTHORITY DECIDES WHAT IS COLLECTIBLE. A charge is actionable once
     * its effective due date plus the arrangement's offset has arrived — i.e. its due date is on or
     * before `asOf − offset` — so the plan is asked as of that shifted day. The figure is exactly
     * what `settlePayment` will place when the collected money posts.
     */
    const shifted = actionableOnOrAfter(args.asOf, -args.timingOffsetDays);
    const plan = await planSettlement(supabase, {
        orgId,
        householdId: customerId,
        asOf: shifted,
        amountCents: Number.MAX_SAFE_INTEGER,
        payerPersonId: t(args.payerPersonId) || null,
    });

    /* When to look again: the soonest posted obligation not yet actionable. */
    const { data: agreementRows } = await supabase
        .from("child_enrollment_agreements")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    const sourceIds = [customerId, ...((agreementRows ?? []) as Array<{ id?: unknown }>).map((r) => t(r.id)).filter(Boolean)];
    const { data: upcoming } = await supabase
        .from("charges")
        .select("due_date")
        .eq("org_id", orgId)
        .eq("status", "posted")
        .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
        .in("billable_source_id", sourceIds)
        .gt("due_date", shifted)
        .order("due_date", { ascending: true })
        .limit(1);
    const nextDue = t(((upcoming ?? []) as Array<{ due_date?: unknown }>)[0]?.due_date);

    return {
        charges: plan.lines.map((l) => ({ chargeId: l.chargeId, dueDate: l.effectiveDueOn, outstandingCents: l.applyCents })),
        totalCents: plan.eligibleCents,
        nextDueDate: nextDue ? actionableOnOrAfter(nextDue, args.timingOffsetDays) : null,
    };
}
