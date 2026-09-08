import { describe, expect, it } from "vitest";

import {
    PAYMENT_RECORD_ACTION_KEY,
    PAYMENT_REFUND_ACTION_KEY,
    financialPaymentActions,
} from "@/lib/adminV2/actions/definitions/financialPaymentActions";
import { REGISTERED_ACTION_CAPABILITY_KEYS } from "@/lib/platform/commands/capabilityRegistry";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";

const AGREEMENT_ID = "agr-1";
const ACTOR = "user-1";

function action(key: string) {
    const found = financialPaymentActions.find((a) => a.actionKey === key);
    if (!found) throw new Error(`no registered action ${key}`);
    return found;
}

function setup(over: Record<string, unknown> = {}) {
    const store = createOperationalEnrollmentMockStore({
        charges: [
            {
                id: "charge-1",
                org_id: ORG_ID,
                job_id: null,
                billable_source_type: "enrollment_agreement",
                billable_source_id: AGREEMENT_ID,
                source_charge_id: null,
                charge_type: "service",
                charge_category: "tuition",
                status: "posted",
                currency_code: "USD",
                amount_cents: 130_000,
                posted_at: "2026-09-01T00:00:00.000Z",
                metadata: {},
                ...over,
            },
        ],
    });
    return { store, supabase: createOperationalEnrollmentMockSupabase(store) };
}

const ctx = { orgId: ORG_ID, userId: ACTOR } as never;
const invocation = { entityType: "child", entityId: "child-1" } as never;

describe("financial payment actions — the operator can settle what is owed", () => {
    /*
     * A CHARGE THAT CANNOT BE PAID IS NOT A BALANCE, IT IS AN ACCUSATION.
     *
     * Thread 1 made a charge postable and correctable, and the Financials card read `Payments
     * received` straight out of a hard-coded zero. Without a reachable record-payment the card could
     * only ever say a family owes everything they have ever been charged.
     */
    it("registers record and refund, and both are classified capabilities", () => {
        expect(financialPaymentActions.map((a) => a.actionKey).sort()).toEqual(
            [PAYMENT_RECORD_ACTION_KEY, PAYMENT_REFUND_ACTION_KEY].sort(),
        );
        for (const key of [PAYMENT_RECORD_ACTION_KEY, PAYMENT_REFUND_ACTION_KEY]) {
            expect(REGISTERED_ACTION_CAPABILITY_KEYS as readonly string[]).toContain(key);
        }
    });

    /*
     * THE SUBJECT OF A PAYMENT IS THE CHARGE, exactly as it is for `charge.post`.
     *
     * Requiring a child would refuse the case the `customer` billable source exists for: a family
     * with a registration fee and no enrolled child has no `customer_member_id` to send, so their
     * charge could be posted and never paid.
     */
    it("does not gate paying on a child entity", () => {
        expect(action(PAYMENT_RECORD_ACTION_KEY).requiredContext.requiresEntityId).toBe(false);
        expect(action(PAYMENT_REFUND_ACTION_KEY).requiredContext.requiresEntityId).toBe(false);
    });

    it("refuses a payment with no charge, no amount, or an amount of zero", () => {
        const validate = action(PAYMENT_RECORD_ACTION_KEY).validatePayload!;
        expect(validate({}).ok).toBe(false);
        const noAmount = validate({ charge_id: "charge-1" });
        expect(noAmount.ok === false && noAmount.blockers[0]?.code).toBe("invalid_amount");
        for (const amount_cents of [0, -1, 12.5]) {
            const bad = validate({ charge_id: "charge-1", amount_cents });
            expect(bad.ok === false && bad.blockers[0]?.code).toBe("invalid_amount");
        }
    });

    it("refuses a payment method the substrate does not carry", () => {
        const bad = action(PAYMENT_RECORD_ACTION_KEY).validatePayload!({
            charge_id: "charge-1",
            amount_cents: 100,
            payment_method: "crypto",
        });
        expect(bad.ok === false && bad.blockers[0]?.code).toBe("invalid_payment_method");
    });

    it("defaults to cash rather than refusing, so recording a payment needs one decision", () => {
        const ok = action(PAYMENT_RECORD_ACTION_KEY).validatePayload!({
            charge_id: "charge-1",
            amount_cents: 100,
        });
        expect(ok.ok).toBe(true);
        expect(ok.ok === true && (ok.value as Record<string, unknown>).payment_method).toBe("cash");
    });

    it("blocks paying a DRAFT charge before the operator types an amount", async () => {
        const { supabase } = setup({ status: "draft", posted_at: null });
        const eligibility = await action(PAYMENT_RECORD_ACTION_KEY).resolveEligibility!({
            supabase,
            ctx,
            payload: { charge_id: "charge-1" },
            invocation,
        } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("charge_not_owed");
    });

    it("blocks paying a charge that is already settled", async () => {
        const { supabase } = setup();
        await action(PAYMENT_RECORD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload: { charge_id: "charge-1", amount_cents: 130_000, payment_method: "check" },
        } as never);
        const eligibility = await action(PAYMENT_RECORD_ACTION_KEY).resolveEligibility!({
            supabase,
            ctx,
            payload: { charge_id: "charge-1" },
            invocation,
        } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers[0]?.code).toBe("charge_settled");
    });

    /**
     * THE PREVIEW IS THE BALANCE CONSEQUENCE, from the read the write will bound itself by — so what
     * the operator authorises is what happens.
     */
    it("previews the balance before and after, and names any unapplied remainder", async () => {
        const { supabase } = setup();
        const preview = await action(PAYMENT_RECORD_ACTION_KEY).buildPreview!({
            supabase,
            ctx,
            payload: { charge_id: "charge-1", amount_cents: 200_000, payment_method: "ach" },
            invocation,
        } as never);
        expect(preview.changes).toContain("Outstanding before · $1,300.00");
        expect(preview.changes).toContain("Outstanding after · $0.00");
        expect(preview.changes).toContain("$700.00 stays unapplied on the account");
    });

    it("records money, applies it, and attributes the write to the operator", async () => {
        const { store, supabase } = setup();
        const result = await action(PAYMENT_RECORD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload: { charge_id: "charge-1", amount_cents: 50_000, payment_method: "check" },
        } as never);

        expect(result.ok).toBe(true);
        const detail = (result as { result: { detail: Record<string, unknown> } }).result.detail;
        expect(detail.applied_cents).toBe(50_000);
        expect(detail.payment_status).toBe("posted");
        expect(detail.already_recorded).toBe(false);
        expect(detail.already_applied).toBe(false);
        expect(store.payments[0]!.created_by).toBe(ACTOR);
        expect(store.payment_allocations[0]!.created_by).toBe(ACTOR);
    });

    /**
     * A DERIVED IDEMPOTENCY KEY, because a key the caller may omit is a key that gets omitted — and
     * then a double-click is two payments.
     */
    it("makes a resubmitted request harmless without the caller supplying a key", async () => {
        const { store, supabase } = setup();
        const payload = {
            charge_id: "charge-1",
            amount_cents: 50_000,
            payment_method: "check",
            received_at: "2026-09-03",
        };
        await action(PAYMENT_RECORD_ACTION_KEY).execute({ supabase, ctx, invocation, payload } as never);
        const replay = await action(PAYMENT_RECORD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload,
        } as never);

        const detail = (replay as { result: { detail: Record<string, unknown> } }).result.detail;
        expect(detail.already_recorded).toBe(true);
        expect(detail.already_applied).toBe(true);
        expect(store.payments).toHaveLength(1);
        expect(store.payment_allocations.filter((a) => a.status === "active")).toHaveLength(1);
    });

    /**
     * A SECOND PAYMENT ON A LATER DAY IS NOT A RETRY. The derived key carries the date for exactly
     * this reason: swallowing a genuine second $500 as a duplicate loses real money.
     */
    it("does not mistake a later identical payment for a retry", async () => {
        const { store, supabase } = setup();
        await action(PAYMENT_RECORD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload: {
                charge_id: "charge-1",
                amount_cents: 50_000,
                payment_method: "cash",
                received_at: "2026-09-03",
            },
        } as never);
        await action(PAYMENT_RECORD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload: {
                charge_id: "charge-1",
                amount_cents: 50_000,
                payment_method: "cash",
                received_at: "2026-09-04",
            },
        } as never);
        expect(store.payments).toHaveLength(2);
    });

    it("reports a service refusal as a 409 with the sentence, not a 500", async () => {
        const { supabase } = setup({ status: "draft", posted_at: null });
        const result = await action(PAYMENT_RECORD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload: { charge_id: "charge-1", amount_cents: 100, payment_method: "cash" },
        } as never);
        expect(result.ok).toBe(false);
        expect((result as { status: number }).status).toBe(409);
        expect((result as { error: string }).error).toContain("draft");
    });

    it("refunds with lineage, and names the applications it reversed", async () => {
        const { store, supabase } = setup();
        const paid = await action(PAYMENT_RECORD_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload: { charge_id: "charge-1", amount_cents: 130_000, payment_method: "check" },
        } as never);
        const paymentId = (paid as { result: { affectedId: string } }).result.affectedId;

        const refunded = await action(PAYMENT_REFUND_ACTION_KEY).execute({
            supabase,
            ctx,
            invocation,
            payload: { payment_id: paymentId, reason: "wrong family" },
        } as never);

        expect(refunded.ok).toBe(true);
        const detail = (refunded as { result: { detail: Record<string, unknown> } }).result.detail;
        expect(detail.refunds_payment_id).toBe(paymentId);
        expect((detail.reversed_allocation_ids as string[])).toHaveLength(1);
        // The receipt is untouched — a refund is a new row, never an edit.
        expect(store.payments.find((p) => p.id === paymentId)!.amount_cents).toBe(130_000);
        expect(store.payments.find((p) => p.id === paymentId)!.direction).toBe("inbound");
    });

    it("refuses a refund with no payment, or a non-positive partial amount", () => {
        const validate = action(PAYMENT_REFUND_ACTION_KEY).validatePayload!;
        expect(validate({}).ok).toBe(false);
        const bad = validate({ payment_id: "p1", amount_cents: 0 });
        expect(bad.ok === false && bad.blockers[0]?.code).toBe("invalid_amount");
        // Omitting the amount is the FULL refund, and is valid.
        expect(validate({ payment_id: "p1" }).ok).toBe(true);
    });
});
