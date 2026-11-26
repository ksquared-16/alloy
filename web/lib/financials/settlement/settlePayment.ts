/**
 * SETTLE ONE PAYMENT AUTOMATICALLY (W7-F050 / W7-F051).
 *
 * The one writer every ordinary path converges on — the Payment command's Confirm payment, a card or
 * bank collection the provider confirmed, and Autopay. It reads the payment (who paid, which
 * household, what it has left that is not applied, refunded or held), recomputes the settlement plan
 * from CURRENT state — never a stale preview — and carries it out through the existing canonical
 * writers:
 *
 *   `applyPaymentToCharge`               one allocation per charge, every DB bound still enforced;
 *   `attributePaymentToResponsibility`   the part that settled the payer's OWN share, so Dana's
 *                                        remaining responsibility falls and Rosa's does not.
 *
 * Whatever the plan cannot place stays unapplied on the payment (prepaid, traceable to it). A failed
 * line stops nothing already written and is reported, never retried silently: the money it would have
 * placed simply remains unapplied, which is the honest state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveBillableSourceHouseholdId } from "@/lib/financials/billableSourceHousehold";
import { fetchOrgBusinessDate } from "@/lib/financials/businessDate";
import { applyPaymentToCharge, readPaymentUnappliedCents } from "@/lib/financials/childcarePaymentService";
import { heldCentsFor, readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";
import { attributePaymentToResponsibility } from "@/lib/financials/responsibility/paymentAttributionService";
import { planSettlement, SETTLEMENT_POLICY_LABEL, type SettlementPlan } from "@/lib/financials/settlement/automaticSettlement";

const t = (v: unknown): string => (v == null ? "" : String(v).trim());

export type SettlementApplication = {
    chargeId: string;
    label: string;
    cents: number;
    allocationId: string | null;
    attributedCents: number;
    error: string | null;
};

export type SettlePaymentResult = {
    state: "settled" | "not_settleable";
    reason: string | null;
    plan: SettlementPlan | null;
    applications: SettlementApplication[];
    appliedCents: number;
    unappliedCents: number;
};

export async function settlePayment(
    supabase: SupabaseClient,
    args: { orgId: string; paymentId: string; asOf?: string | null; actorUserId?: string | null },
): Promise<SettlePaymentResult> {
    const none = (reason: string): SettlePaymentResult => ({
        state: "not_settleable", reason, plan: null, applications: [], appliedCents: 0, unappliedCents: 0,
    });
    const { data, error } = await supabase
        .from("payments")
        .select("id, org_id, amount_cents, status, direction, refunds_payment_id, payer_entity_type, payer_entity_id, customer_id, billable_source_type, billable_source_id")
        .eq("org_id", args.orgId)
        .eq("id", args.paymentId)
        .maybeSingle();
    if (error) return none(`payment_unreadable: ${error.message}`);
    const p = data as Record<string, unknown> | null;
    if (!p) return none("payment_not_found");
    if (t(p.direction) !== "inbound" || t(p.refunds_payment_id)) return none("not_a_receipt");
    if (t(p.status) !== "posted") return none("payment_not_posted");

    const householdId = t(p.customer_id)
        || (await resolveBillableSourceHouseholdId(supabase, args.orgId, t(p.billable_source_type) || null, t(p.billable_source_id) || null))
        || "";
    if (!householdId) return none("household_unresolved");

    const unapplied = await readPaymentUnappliedCents(supabase, args.orgId, args.paymentId, Number(p.amount_cents) || 0);
    const held = heldCentsFor(args.paymentId, await readHoldsForPayments(supabase, { orgId: args.orgId, paymentIds: [args.paymentId] }));
    const available = Math.max(0, unapplied - held);
    const payerPersonId = t(p.payer_entity_type) === "person" ? t(p.payer_entity_id) || null : null;
    const asOf = t(args.asOf) || (await fetchOrgBusinessDate(supabase, args.orgId));

    const plan = await planSettlement(supabase, { orgId: args.orgId, householdId, asOf, amountCents: available, payerPersonId });
    const applications: SettlementApplication[] = [];
    for (const line of plan.lines) {
        const row: SettlementApplication = { chargeId: line.chargeId, label: line.label, cents: 0, allocationId: null, attributedCents: 0, error: null };
        try {
            const applied = await applyPaymentToCharge(supabase, {
                orgId: args.orgId,
                paymentId: args.paymentId,
                chargeId: line.chargeId,
                amountCents: line.applyCents,
                actorUserId: args.actorUserId ?? null,
                metadata: { settlement: "automatic", settlement_policy: SETTLEMENT_POLICY_LABEL, settlement_as_of: asOf },
            });
            row.allocationId = applied.allocation.id;
            row.cents = applied.alreadyApplied ? 0 : Number(applied.allocation.allocated_amount_cents) || 0;
            if (!applied.alreadyApplied) {
                for (const part of line.shareParts) {
                    try {
                        await attributePaymentToResponsibility(supabase, {
                            orgId: args.orgId,
                            paymentAllocationId: applied.allocation.id,
                            responsibilityAllocationId: part.allocationId,
                            amountCents: part.cents,
                            idempotencyKey: `settle:${applied.allocation.id}:${part.allocationId}`,
                            actorUserId: args.actorUserId ?? null,
                        });
                        row.attributedCents += part.cents;
                    } catch (e) {
                        row.error = `attribution_failed: ${e instanceof Error ? e.message : String(e)}`;
                    }
                }
            }
        } catch (e) {
            row.error = e instanceof Error ? e.message : String(e);
        }
        applications.push(row);
    }
    const appliedCents = applications.reduce((a, r) => a + r.cents, 0);
    return {
        state: "settled",
        reason: null,
        plan,
        applications,
        appliedCents,
        unappliedCents: Math.max(0, available - appliedCents),
    };
}

/**
 * A PAYER'S OWN UNAPPLIED MONEY SETTLES FIRST (W7-F051). Before Autopay asks a card or bank for
 * money, any posted receipt THIS payer already gave the household that still has money available is
 * settled by the same authority. The family is never charged for debt their own prepaid already
 * covers. Money from somebody else — or recorded to the household with no payer — is not spent on
 * this payer's behalf.
 */
export async function settlePayersAvailableReceipts(
    supabase: SupabaseClient,
    args: { orgId: string; householdId: string; payerPersonId: string; asOf?: string | null },
): Promise<{ appliedCents: number; paymentIds: string[] }> {
    const { data } = await supabase
        .from("payments")
        .select("id")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.householdId)
        .eq("payer_entity_type", "person")
        .eq("payer_entity_id", args.payerPersonId)
        .eq("direction", "inbound")
        .eq("status", "posted")
        .is("refunds_payment_id", null);
    let appliedCents = 0;
    const paymentIds: string[] = [];
    for (const row of (data ?? []) as Array<{ id: string }>) {
        const settled = await settlePayment(supabase, { orgId: args.orgId, paymentId: row.id, asOf: args.asOf ?? null });
        if (settled.appliedCents > 0) {
            appliedCents += settled.appliedCents;
            paymentIds.push(row.id);
        }
    }
    return { appliedCents, paymentIds };
}
