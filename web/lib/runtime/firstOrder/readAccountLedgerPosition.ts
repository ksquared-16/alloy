import type { SupabaseClient } from "@supabase/supabase-js";

import { billingPeriodForDate } from "@/lib/financials/billingPeriod";
import {
    readAccountChargeLedger, readAppliedByChargeId,
} from "@/lib/financials/account/accountChargeLedger";
import {
    pastDueFor, reconcileRows,
    type FinancialsPastDue, type FinancialsReconciliation,
} from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

/**
 * THE ACCOUNT'S CURRENT-PERIOD LEDGER POSITION, for the first-order runtime.
 *
 * Composition only. Every semantic decision belongs to an owner this module calls:
 *
 *   · which charges are this account's      → `readAccountChargeLedger`
 *   · what period a charge falls in         → `placeInBillingPeriod`, through that reader
 *   · what counts as applied money          → `readAppliedByChargeId` (the one balance rule)
 *   · what responsibility and balance ARE   → `reconcileRows`
 *   · what is past due                      → `pastDueFor`
 *
 * Nothing here computes money. If this file ever contains arithmetic over cents, the extraction
 * has failed and A′ has grown a second financial definition beside the card's — which is the one
 * outcome the extraction exists to prevent.
 *
 * ── A PARTIAL FINANCIAL READ IS NOT MONEY ──
 *
 * Both reads must succeed. A charge ledger without its applications produces a balance equal to
 * the full responsibility — a confident, specific, wrong number that tells a family they owe what
 * they have already paid. So either outcome's failure makes the whole position UNAVAILABLE, and
 * the capabilities say so rather than publishing a figure.
 */

export type AccountLedgerPosition =
    | {
          state: "ok";
          periodKey: string;
          reconciliation: FinancialsReconciliation;
          pastDue: FinancialsPastDue | null;
      }
    | { state: "unavailable"; reason: string };

export async function readAccountLedgerPosition(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string | null; customerMemberId?: string | null; today?: string },
): Promise<AccountLedgerPosition> {
    const today = args.today ?? new Date().toISOString().slice(0, 10);
    const period = billingPeriodForDate(today);

    const ledger = await readAccountChargeLedger(supabase, {
        orgId: args.orgId, customerId: args.customerId, customerMemberId: args.customerMemberId ?? null, today,
    });
    if (ledger.state !== "ok") return { state: "unavailable", reason: ledger.reason };

    const applied = await readAppliedByChargeId(supabase, {
        orgId: args.orgId, chargeIds: ledger.rows.map((r) => r.chargeId),
    });
    if (applied.state !== "ok") return { state: "unavailable", reason: applied.reason };

    return {
        state: "ok",
        periodKey: period.key,
        reconciliation: reconcileRows(ledger.rows, period.key, today, applied.appliedByChargeId),
        // Past due is account-wide, not period-scoped: an obligation overdue from March is still
        // overdue in September, and scoping it to the current period would report zero every time
        // a family fell behind and then stopped being charged.
        pastDue: pastDueFor(ledger.rows, today, applied.appliedByChargeId),
    };
}
