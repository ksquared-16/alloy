/**
 * THREAD 8 — the payment spine, certified through the RUNNING APP.
 *
 * charge → post → pay → balance → partial → second payment → retry → refund, driven as an
 * authenticated operator against the certification tenant. Every call is the exact contract the
 * Financials surfaces issue: `POST /api/admin/actions/execute` for `charge.add` / `charge.post` /
 * `payment.record` / `payment.refund`, and `GET /api/admin/financials/card` for the composed read
 * model all three densities render. Nothing is written directly to the database, so authentication,
 * org resolution, `requireAdminOrOps`, the registered-action registry, the services and the DB
 * guarantees are all in the path.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM THE SQL CERTIFICATION ──
 *
 * `payment-application.cert.sh` proves the DATABASE holds the rules. This proves the OPERATOR can
 * reach them and that the read model reports what actually persisted. They are different claims:
 * a correct index behind an unreachable action is not a family who can pay, and a card that renders
 * a balance it computed itself would agree with nothing.
 *
 * Requirements certified here:
 *   Phase 4 B  one payment persisted, one application, balance decreased exactly once, a reload
 *              preserves it, and a duplicate request does not duplicate money.
 *   Phase 4 C  a partial payment applies exactly, and a second payment settles the rest without
 *              disturbing the first.
 *   Phase 4 D  a refund leaves the original intact, carries lineage, and moves the balance back.
 *   Phase 4 E  invalid amounts and a draft charge are refused through the operator's own path.
 *
 * Fixture: certification/fixtures/financials-charge-spine.sql.
 */
import { expect, test } from "@playwright/test";

const ORG_HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const CHILD = "fc500000-0000-4000-8000-0000000c0002";
const TEMPLATE = "fc500000-0000-4000-8000-0000000d0001";
// A charge is deduped by `tpl:<template_key>:<occurs_on>:<scope>`, so a second `charge.add`
// from the SAME template on the same day returns the FIRST charge rather than a new one —
// correct behaviour, and the reason the partial-payment proof needs a template of its own.
const TEMPLATE_2 = "fc500000-0000-4000-8000-0000000d0002";
// And a third, for the charge that must stay a DRAFT: a template already used today would
// resolve to the posted charge instead, and paying that proves the wrong thing.
const TEMPLATE_3 = "fc500000-0000-4000-8000-0000000d0003";

type LedgerRow = { chargeId: string; amountCents: number; status: string; lifecycleStatus: string };
type PaymentRow = {
    paymentId: string;
    direction: "inbound" | "outbound";
    refundsPaymentId: string | null;
    amountCents: number;
    status: string;
    appliedCents: number;
};
type CardVm = {
    rows: LedgerRow[];
    payments: PaymentRow[];
    reconciliation: { responsibilityCents: number; paymentsCents: number; balanceCents: number };
    unavailable: Array<{ fact: string; reason: string }>;
};

test.describe("financials — money received through the operator's own surface", () => {
    test("post → pay → balance → partial → retry → refund", async ({ page }) => {
        const execute = async (body: Record<string, unknown>) => {
            const res = await page.request.post("/api/admin/actions/execute", { data: body });
            return { status: res.status(), json: (await res.json()) as Record<string, any> };
        };
        const readCard = async (): Promise<CardVm> => {
            const res = await page.request.get(
                `/api/admin/financials/card?customer_id=${ORG_HOUSEHOLD}`,
            );
            expect(res.status(), "the card read model must be reachable as the operator").toBe(200);
            return ((await res.json()) as { vm: CardVm }).vm;
        };
        const addPostedCharge = async (
            templateId: string = TEMPLATE,
        ): Promise<{ id: string; amountCents: number }> => {
            const added = await execute({
                action_key: "charge.add",
                entity_type: "child",
                entity_id: CHILD,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: { customer_member_id: CHILD, customer_id: ORG_HOUSEHOLD, template_id: templateId },
            });
            expect(added.json.ok, `charge.add failed: ${JSON.stringify(added.json)}`).toBe(true);
            const id = added.json.data?.execution_result?.affected_id ?? added.json.data?.affected_id;
            const posted = await execute({
                action_key: "charge.post",
                entity_type: "child",
                entity_id: CHILD,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: { charge_id: id },
            });
            expect(posted.json.ok, `charge.post failed: ${JSON.stringify(posted.json)}`).toBe(true);
            const vm = await readCard();
            const row = vm.rows.find((r) => r.chargeId === id)!;
            return { id, amountCents: row.amountCents };
        };
        const recordPayment = async (payload: Record<string, unknown>) =>
            execute({
                action_key: "payment.record",
                entity_type: "child",
                entity_id: CHILD,
                mode: "execute",
                confirmation: { confirmed: true },
                payload,
            });

        await page.goto("/workspace");

        // ── A · BEFORE. The card no longer claims payments are unrepresentable. ─────────────────
        const before = await readCard();
        expect(
            before.unavailable.map((u) => u.fact),
            "the platform must no longer report payments as an unavailability",
        ).not.toContain("payments");
        const startingBalance = before.reconciliation.balanceCents;
        const startingPayments = before.reconciliation.paymentsCents;
        const startingPaymentCount = before.payments.length;

        // ── B · FULL PAYMENT ────────────────────────────────────────────────────────────────────
        const charge = await addPostedCharge();
        const owedAfterPost = (await readCard()).reconciliation.balanceCents;
        expect(owedAfterPost).toBe(startingBalance + charge.amountCents);

        const paid = await recordPayment({
            charge_id: charge.id,
            amount_cents: charge.amountCents,
            payment_method: "check",
            reference_number: "cert-check-001",
        });
        expect(paid.json.ok, `payment.record failed: ${JSON.stringify(paid.json)}`).toBe(true);
        const paymentId = paid.json.data?.execution_result?.affected_id ?? paid.json.data?.affected_id;
        expect(paymentId, "recording a payment must report the payment it created").toBeTruthy();

        const afterPay = await readCard();
        // One payment persisted, one application, and the balance fell by exactly the amount.
        expect(afterPay.payments).toHaveLength(startingPaymentCount + 1);
        const persisted = afterPay.payments.find((p) => p.paymentId === paymentId)!;
        expect(persisted.direction).toBe("inbound");
        expect(persisted.status).toBe("posted");
        expect(persisted.amountCents).toBe(charge.amountCents);
        expect(persisted.appliedCents).toBe(charge.amountCents);
        expect(afterPay.reconciliation.paymentsCents).toBe(startingPayments + charge.amountCents);
        expect(afterPay.reconciliation.balanceCents).toBe(startingBalance);

        // A RELOAD SEES COMMITTED TRUTH, not a client-side optimism.
        await page.reload();
        const reloaded = await readCard();
        expect(reloaded.reconciliation.balanceCents).toBe(startingBalance);
        expect(reloaded.payments.find((p) => p.paymentId === paymentId)?.appliedCents).toBe(
            charge.amountCents,
        );

        // A DUPLICATE REQUEST DOES NOT DUPLICATE MONEY. The action derives an idempotency key, so
        // this is the double-click an operator actually performs.
        const retry = await recordPayment({
            charge_id: charge.id,
            amount_cents: charge.amountCents,
            payment_method: "check",
            reference_number: "cert-check-001",
        });
        expect(
            retry.json.ok,
            `a retried payment must succeed rather than error: ${JSON.stringify(retry.json)}`,
        ).toBe(true);
        const afterRetry = await readCard();
        expect(afterRetry.payments).toHaveLength(startingPaymentCount + 1);
        expect(afterRetry.reconciliation.balanceCents).toBe(startingBalance);

        // ── C · PARTIAL PAYMENT ─────────────────────────────────────────────────────────────────
        const charge2 = await addPostedCharge(TEMPLATE_2);
        const owed2 = charge2.amountCents;
        const half = Math.floor(owed2 / 2);

        const partial = await recordPayment({
            charge_id: charge2.id,
            amount_cents: half,
            payment_method: "cash",
            received_at: "2026-09-03",
        });
        expect(partial.json.ok, `partial payment failed: ${JSON.stringify(partial.json)}`).toBe(true);
        const partialPaymentId =
            partial.json.data?.execution_result?.affected_id ?? partial.json.data?.affected_id;

        const afterPartial = await readCard();
        // The residual is EXACT — this is the arithmetic a family reads on an invoice.
        expect(afterPartial.reconciliation.balanceCents).toBe(startingBalance + (owed2 - half));

        const second = await recordPayment({
            charge_id: charge2.id,
            amount_cents: owed2 - half,
            payment_method: "cash",
            received_at: "2026-09-04",
        });
        expect(second.json.ok, `second payment failed: ${JSON.stringify(second.json)}`).toBe(true);

        const afterSecond = await readCard();
        expect(afterSecond.reconciliation.balanceCents).toBe(startingBalance);
        // THE PRIOR PAYMENT IS INTACT — a second payment must not disturb the first.
        const stillThere = afterSecond.payments.find((p) => p.paymentId === partialPaymentId)!;
        expect(stillThere.amountCents).toBe(half);
        expect(stillThere.appliedCents).toBe(half);

        // ── D · REFUND ──────────────────────────────────────────────────────────────────────────
        const refunded = await execute({
            action_key: "payment.refund",
            entity_type: "child",
            entity_id: CHILD,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { payment_id: paymentId, reason: "recorded against the wrong family" },
        });
        expect(refunded.json.ok, `payment.refund failed: ${JSON.stringify(refunded.json)}`).toBe(true);
        const refundId =
            refunded.json.data?.execution_result?.affected_id ?? refunded.json.data?.affected_id;

        const afterRefund = await readCard();
        // The original is UNTOUCHED — no in-place rewrite of financial history.
        const original = afterRefund.payments.find((p) => p.paymentId === paymentId)!;
        expect(original.amountCents).toBe(charge.amountCents);
        expect(original.direction).toBe("inbound");
        expect(original.status).toBe("posted");
        expect(original.appliedCents, "the application was reversed, so it holds nothing down").toBe(0);

        // The refund is its own row, with lineage the projection can render.
        const refundRow = afterRefund.payments.find((p) => p.paymentId === refundId)!;
        expect(refundRow.direction).toBe("outbound");
        expect(refundRow.refundsPaymentId).toBe(paymentId);
        expect(refundRow.amountCents).toBe(charge.amountCents);

        // The balance is back by exactly the refunded amount, and only that.
        expect(afterRefund.reconciliation.balanceCents).toBe(startingBalance + charge.amountCents);

        // ── E · REFUSALS, through the operator's own path ───────────────────────────────────────
        const zero = await recordPayment({
            charge_id: charge.id,
            amount_cents: 0,
            payment_method: "cash",
        });
        expect(zero.json.ok, "a zero-amount payment must be refused").toBeFalsy();

        const negative = await recordPayment({
            charge_id: charge.id,
            amount_cents: -5000,
            payment_method: "cash",
        });
        expect(negative.json.ok, "a negative payment must be refused").toBeFalsy();

        // A DRAFT IS NOT OWED, so it cannot be paid.
        const draftAdded = await execute({
            action_key: "charge.add",
            entity_type: "child",
            entity_id: CHILD,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { customer_member_id: CHILD, customer_id: ORG_HOUSEHOLD, template_id: TEMPLATE_3 },
        });
        const draftId =
            draftAdded.json.data?.execution_result?.affected_id ?? draftAdded.json.data?.affected_id;
        const payDraft = await recordPayment({
            charge_id: draftId,
            amount_cents: 1000,
            payment_method: "cash",
        });
        expect(payDraft.json.ok, "paying a draft charge must be refused").toBeFalsy();
        expect(JSON.stringify(payDraft.json)).toMatch(/draft/);

        // A CROSS-ORG CHARGE RESOLVES TO NOTHING. The org comes from the session, never the payload.
        const foreign = await recordPayment({
            charge_id: "00000000-0000-4000-8000-0000000000ff",
            amount_cents: 1000,
            payment_method: "cash",
        });
        expect(foreign.json.ok, "a charge outside the session's org must not be payable").toBeFalsy();

        // NONE OF THE REFUSALS MOVED MONEY.
        const afterRefusals = await readCard();
        expect(afterRefusals.reconciliation.balanceCents).toBe(afterRefund.reconciliation.balanceCents);
        expect(afterRefusals.payments).toHaveLength(afterRefund.payments.length);
    });
});
