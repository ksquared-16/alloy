/**
 * WHAT AUTOPAY MAY COLLECT RIGHT NOW — read from Financials, never computed here.
 *
 * Autopay's amount policy is `amount_due`, and the whole risk of that policy lives in the word
 * CURRENT. A figure resolved when the occurrence was scheduled is a snapshot, and a snapshot is how
 * a family gets charged $500 they paid in cash yesterday. So this is called immediately before
 * collection, every time, and it reads the same authorities the operator's own screen reads:
 *
 *   · which charges belong to this account ... `resolveChargeAccount` (W3's mapping, not a copy)
 *   · what each charge still owes ............ `readChargeBalance` (canonical outstanding)
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
import { readChargeBalance } from "@/lib/financials/childcarePaymentService";
import { resolveChargeAccount } from "@/lib/financials/payments/collectionAttempt";

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
        /** The evaluation date, so a handler and its tests agree on "today". */
        asOf: string;
    },
): Promise<AutopayCollectible> {
    const orgId = t(args.orgId);
    const customerId = t(args.customerId);
    const empty: AutopayCollectible = { charges: [], totalCents: 0, nextDueDate: null };
    if (!orgId || !customerId) return empty;

    const { data, error } = await supabase
        .from("charges")
        .select("id, billable_source_type, billable_source_id, due_date, status")
        .eq("org_id", orgId)
        .eq("status", "posted")
        .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES]);
    if (error) return empty;

    type Row = { id?: unknown; billable_source_type?: unknown; billable_source_id?: unknown; due_date?: unknown };
    const rows = (data ?? []) as Row[];

    /*
     * The account mapping is memoised per billable source for the same reason the operator's
     * chooser memoises it: a family's charges overwhelmingly share one agreement, and asking once
     * per charge is a round trip per charge.
     */
    const accountBySource = new Map<string, string>();
    const due: AutopayDueCharge[] = [];
    let nextDueDate: string | null = null;

    for (const row of rows) {
        const chargeId = t(row.id);
        const dueDate = t(row.due_date);
        const sourceType = t(row.billable_source_type);
        const sourceId = t(row.billable_source_id);
        if (!chargeId || !sourceType || !sourceId) continue;
        /*
         * A charge with no due date has no `on_due_date` moment, so this policy cannot say it has
         * come due. Collecting it anyway would be Autopay inventing a due date Financials declined
         * to state.
         */
        if (!dueDate) continue;

        const key = `${sourceType}:${sourceId}`;
        if (!accountBySource.has(key)) {
            accountBySource.set(
                key,
                await resolveChargeAccount(supabase, orgId, {
                    billable_source_type: sourceType,
                    billable_source_id: sourceId,
                }),
            );
        }
        if (accountBySource.get(key) !== customerId) continue;

        const actionableFrom = actionableOnOrAfter(dueDate, args.timingOffsetDays);
        if (actionableFrom > args.asOf) {
            // Not yet ours to collect. Remember the soonest, so the schedule can return then.
            if (!nextDueDate || actionableFrom < nextDueDate) nextDueDate = actionableFrom;
            continue;
        }

        const balance = await readChargeBalance(supabase, orgId, chargeId);
        if (balance.outstandingCents <= 0) continue;
        due.push({ chargeId, dueDate, outstandingCents: balance.outstandingCents });
    }

    due.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.chargeId.localeCompare(b.chargeId));
    return {
        charges: due,
        totalCents: due.reduce((sum, c) => sum + c.outstandingCents, 0),
        nextDueDate,
    };
}
