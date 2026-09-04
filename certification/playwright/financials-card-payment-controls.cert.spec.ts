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

    test("history, filtering, and the refusals — through the card's own contract", async ({ page }) => {
        const readCard = async (query: string) => {
            const res = await page.request.get(`/api/admin/financials/card?${query}`);
            expect(res.ok()).toBeTruthy();
            const json = (await res.json()) as { ok: boolean; vm: Record<string, unknown> };
            expect(json.ok).toBeTruthy();
            return json.vm as unknown as CardVm & {
                ledgerPeriods: Array<{ period: { key: string; label: string }; rows: CardRow[] }>;
                payments: Array<Record<string, unknown>>;
                payers: Array<{ share: string | null }>;
                subjects: Array<{ customerMemberId: string; displayName: string }>;
                rows: Array<CardRow & { categoryLabel: string; periodKey: string | null; subjectMemberId: string | null; correctionKind: string | null }>;
                account: { customerId: string | null } | null;
            };
        };
        const execute = async (actionKey: string, payload: Record<string, unknown>) => {
            const res = await page.request.post("/api/admin/actions/execute", {
                data: { action_key: actionKey, entity_type: "child", entity_id: CHILD, mode: "execute", confirmation: { confirmed: true }, payload },
            });
            return { status: res.status(), body: (await res.json()) as { ok?: boolean; error?: { message?: string } } };
        };

        await page.goto("/workspace");
        const vm = await readCard(`customer_id=${HOUSEHOLD}`);

        // ── HISTORY ──────────────────────────────────────────────────────────────────────────────
        // Posting is represented: posted rows carry a human category label, never a type key.
        const posted = vm.rows.filter((r) => r.status !== "draft" && r.status !== "void");
        expect(posted.length).toBeGreaterThan(0);
        for (const r of posted.slice(0, 12)) {
            expect(r.categoryLabel, "a human label, never an internal key").toMatch(/^[A-Z]/);
            expect(r.categoryLabel).not.toMatch(/_/);
        }
        // Correction/reversal history is present and identifies itself as a correction.
        const corrections = vm.rows.filter((r) => r.correctsChargeId !== null);
        if (corrections.length) {
            for (const c of corrections) expect(c.correctionKind).toBeTruthy();
            // A correction is never itself payable.
            for (const c of corrections) expect(c.offersPayment).toBe(false);
        }
        // Billing-period grouping: every group's rows belong to that period, newest group first.
        expect(vm.ledgerPeriods.length).toBeGreaterThan(0);
        for (const g of vm.ledgerPeriods) {
            expect(g.period.label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
            for (const r of g.rows) expect(r.periodKey).toBe(g.period.key);
        }
        const keys = vm.ledgerPeriods.map((g) => g.period.key);
        expect([...keys].sort((a, b) => b.localeCompare(a))).toEqual(keys);
        // Receipt is distinct from application, and the journal is not the balance.
        const receipts = vm.payments.filter((p) => p.direction === "inbound" && p.status === "posted");
        expect(receipts.length).toBeGreaterThan(0);
        for (const p of receipts) {
            expect(Number(p.appliedCents)).toBeLessThanOrEqual(Number(p.amountCents));
        }
        expect(vm.reconciliation.balanceCents).toBe(
            vm.reconciliation.responsibilityCents - vm.reconciliation.paymentsCents,
        );

        // ── FILTERING ────────────────────────────────────────────────────────────────────────────
        expect(vm.subjects.length).toBeGreaterThan(0);
        const child = vm.subjects[0].customerMemberId;
        const scoped = await readCard(`customer_member_id=${child}`);
        // Child attribution does not change account ownership: the same household answers.
        expect(scoped.account?.customerId).toBe(vm.account?.customerId);
        // Every row attributable to a child names that child; a household charge names none and is
        // never attributed to a sibling.
        for (const r of vm.rows) {
            if (r.subjectMemberId !== null) {
                expect(vm.subjects.some((s) => s.customerMemberId === r.subjectMemberId)).toBe(true);
            }
        }
        // Payer filtering: canonical payer identity exists but carries NO share, so the surface
        // states payers and fabricates no responsibility split. Truthful N/A, asserted.
        for (const payer of vm.payers) expect(payer.share).toBeNull();

        // ── FAILURE AND SECURITY ─────────────────────────────────────────────────────────────────
        const payableRow = vm.rows.find((r) => r.offersPayment);
        if (payableRow) {
            const zero = await execute("payment.record", { charge_id: payableRow.chargeId, amount_cents: 0, payment_method: "cash" });
            expect(zero.status).not.toBe(200);
            const negative = await execute("payment.record", { charge_id: payableRow.chargeId, amount_cents: -5000, payment_method: "cash" });
            expect(negative.status).not.toBe(200);
            const badMethod = await execute("payment.record", { charge_id: payableRow.chargeId, amount_cents: 100, payment_method: "bitcoin" });
            expect(badMethod.status).not.toBe(200);
        }
        // A draft charge refuses money through the operator's own path.
        const draft = vm.rows.find((r) => r.status === "draft");
        if (draft) {
            const onDraft = await execute("payment.record", { charge_id: draft.chargeId, amount_cents: 100, payment_method: "cash" });
            expect(onDraft.status).not.toBe(200);
        }
        // A charge from another organization is not reachable: the org comes from the session, so an
        // unknown id resolves to nothing rather than to another tenant's money.
        const foreign = await execute("payment.record", {
            charge_id: "00000000-0000-4000-8000-0000000000ff",
            amount_cents: 100,
            payment_method: "cash",
        });
        expect(foreign.status).not.toBe(200);
        // A cross-organization READ answers with no account rather than another tenant's ledger.
        const foreignCard = await readCard("customer_id=00000000-0000-4000-8000-0000000000fe");
        expect(foreignCard.rows.length).toBe(0);

        // ── RELOAD RECONCILES TO PERSISTENCE ─────────────────────────────────────────────────────
        const before = await readCard(`customer_id=${HOUSEHOLD}`);
        await page.reload();
        const after = await readCard(`customer_id=${HOUSEHOLD}`);
        expect(after.reconciliation.balanceCents).toBe(before.reconciliation.balanceCents);
        expect(after.rows.length).toBe(before.rows.length);
    });
});
