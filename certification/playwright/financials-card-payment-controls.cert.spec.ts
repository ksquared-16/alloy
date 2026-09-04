/**
 * THREAD 2 — the Financials card's PAYMENT controls, through the running app.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT ──
 *
 * The card renders `GET /api/admin/financials/card` and issues `POST /api/admin/actions/execute`.
 * This drives both, as the authenticated operator, so authentication, org resolution,
 * `requireAdminOrOps`, the registered-action registry, the services and the database guarantees are
 * all in the path — and the fields asserted here are the exact ones the new controls render from:
 *
 *   C1  a posted charge that still owes something reports `offersPayment` — the field the
 *       Record-payment menu is built from — with `appliedCents` and `outstandingCents` beside it
 *   C2  recording a payment with the EXACT payload the card sends moves those fields, and moves the
 *       authoritative balance by exactly the amount applied
 *   C3  the receipt is visible as its own row, separable from what it settled
 *   C4  a settled charge stops offering payment
 *   C5  a retry of the same request does not move money twice
 *   C6  the balance is `responsibility − payments`, never a sum of journal rows
 *
 * It does NOT click a rendered button. The Financials card mounts on an opportunity focus panel and
 * this certification tenant has ZERO opportunities (`select count(*) from opportunities` = 0), so
 * there is no surface to click — the same seeding gap Thread 1 recorded. That is a certification
 * platform limitation, not a product claim, and it is reported rather than papered over with a test
 * against a surface that does not exist.
 */
import { expect, test } from "@playwright/test";

const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const CHILD = "fc500000-0000-4000-8000-0000000c0002";

type CardRow = {
    chargeId: string;
    status: string;
    lifecycleStatus: string;
    amountCents: number;
    appliedCents: number;
    outstandingCents: number;
    offersPayment: boolean;
    correctsChargeId: string | null;
    description: string | null;
};
type CardVm = {
    rows: CardRow[];
    payments: Array<{
        paymentId: string;
        direction: string;
        status: string;
        amountCents: number;
        appliedCents: number;
    }>;
    reconciliation: { balanceCents: number; responsibilityCents: number; paymentsCents: number };
};

test.describe("financials card — payment controls through the operator's own contract", () => {
    test("payable rows, a recorded payment, and a balance that moves exactly once", async ({ page }) => {
        // The card's own read. Everything asserted below is a field the card renders.
        const readCard = async (): Promise<CardVm> => {
            const res = await page.request.get(
                `/api/admin/financials/card?customer_id=${HOUSEHOLD}`,
            );
            expect(res.ok(), "the card read model must answer the authenticated operator").toBeTruthy();
            const json = (await res.json()) as { ok: boolean; vm: CardVm };
            expect(json.ok).toBeTruthy();
            return json.vm;
        };

        const execute = async (actionKey: string, payload: Record<string, unknown>) => {
            const res = await page.request.post("/api/admin/actions/execute", {
                data: {
                    action_key: actionKey,
                    entity_type: "child",
                    /*
                     * THE SUBJECT THE CARD SENDS.
                     *
                     * `payment.record` declares `requiresEntityId: false`, but the execute route
                     * refuses a request without one — which is how the first run of this spec failed
                     * and how the card's own buttons would have failed in front of an operator. The
                     * card now sends the charge's own child, falling back to the panel's subject;
                     * this sends the same thing.
                     */
                    entity_id: CHILD,
                    mode: "execute",
                    confirmation: { confirmed: true },
                    payload,
                },
            });
            return { status: res.status(), body: (await res.json()) as { ok?: boolean; error?: unknown } };
        };

        await page.goto("/workspace");

        // ── C1 · A PAYABLE ROW, AS THE CARD DECIDES IT ───────────────────────────────────────────
        const before = await readCard();
        const payable = before.rows.filter((r) => r.offersPayment);
        expect(payable.length, "the certification account must hold at least one payable charge").toBeGreaterThan(0);

        for (const row of payable) {
            // Every payable row is posted money that still owes something and is not a correction.
            expect(row.status).not.toBe("draft");
            expect(row.status).not.toBe("void");
            expect(row.correctsChargeId).toBeNull();
            expect(row.outstandingCents).toBeGreaterThan(0);
            expect(row.appliedCents + row.outstandingCents).toBe(row.amountCents);
        }
        // A draft never offers payment — paying one settles an obligation nobody was told about.
        for (const row of before.rows.filter((r) => r.status === "draft")) {
            expect(row.offersPayment).toBe(false);
        }

        const target = payable[0];
        const part = Math.max(1, Math.floor(target.outstandingCents / 2));

        // ── C2 · THE EXACT CALL THE CARD'S BUTTON MAKES ──────────────────────────────────────────
        const idem = `t2-card-cert-${target.chargeId}-${Date.now()}`;
        const recorded = await execute("payment.record", {
            charge_id: target.chargeId,
            amount_cents: part,
            payment_method: "check",
            charge_label: target.description ?? target.chargeId,
            idempotency_key: idem,
        });
        expect(recorded.status, JSON.stringify(recorded.body)).toBe(200);
        expect(recorded.body.ok).toBeTruthy();

        const afterPay = await readCard();
        const paidRow = afterPay.rows.find((r) => r.chargeId === target.chargeId)!;
        expect(paidRow.appliedCents).toBe(target.appliedCents + part);
        expect(paidRow.outstandingCents).toBe(target.outstandingCents - part);
        // The authoritative balance moved by exactly what was applied — once.
        expect(afterPay.reconciliation.balanceCents).toBe(before.reconciliation.balanceCents - part);
        expect(afterPay.reconciliation.paymentsCents).toBe(before.reconciliation.paymentsCents + part);

        // ── C3 · THE RECEIPT IS ITS OWN ROW ──────────────────────────────────────────────────────
        expect(afterPay.payments.length).toBeGreaterThan(before.payments.length);
        const receipt = afterPay.payments.find(
            (p) => p.direction === "inbound" && p.status === "posted" && p.amountCents === part,
        );
        expect(receipt, "the recorded payment must appear as a receipt the card can render").toBeTruthy();

        // ── C5 · A RETRY MOVES NOTHING ───────────────────────────────────────────────────────────
        const replay = await execute("payment.record", {
            charge_id: target.chargeId,
            amount_cents: part,
            payment_method: "check",
            charge_label: target.description ?? target.chargeId,
            idempotency_key: idem,
        });
        expect(replay.status).toBe(200);
        const afterReplay = await readCard();
        expect(afterReplay.reconciliation.balanceCents).toBe(afterPay.reconciliation.balanceCents);
        expect(
            afterReplay.rows.find((r) => r.chargeId === target.chargeId)!.appliedCents,
        ).toBe(paidRow.appliedCents);

        // ── C4 · SETTLING THE REST CLOSES THE OFFER ──────────────────────────────────────────────
        const remaining = paidRow.outstandingCents;
        if (remaining > 0) {
            const settle = await execute("payment.record", {
                charge_id: target.chargeId,
                amount_cents: remaining,
                payment_method: "cash",
                charge_label: target.description ?? target.chargeId,
                idempotency_key: `${idem}-settle`,
            });
            expect(settle.status, JSON.stringify(settle.body)).toBe(200);

            const settled = await readCard();
            const settledRow = settled.rows.find((r) => r.chargeId === target.chargeId)!;
            expect(settledRow.outstandingCents).toBe(0);
            // Nothing left to collect, so the card offers nothing. The allocation bounds trigger
            // would refuse it anyway; this is the card agreeing rather than pre-empting.
            expect(settledRow.offersPayment).toBe(false);
        }

        // ── C6 · THE BALANCE IS NOT JOURNAL-DERIVED ──────────────────────────────────────────────
        const final = await readCard();
        expect(final.reconciliation.balanceCents).toBe(
            final.reconciliation.responsibilityCents - final.reconciliation.paymentsCents,
        );
    });
});
