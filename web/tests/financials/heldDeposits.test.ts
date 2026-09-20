/**
 * HELD DEPOSITS — the economics, without a database.
 *
 * W4's risk is not that a query is shaped wrongly. It is that a dollar gets counted twice: held AND
 * available, or held AND allocated, or released AND still held. The database enforces the bounds
 * that must never be crossed; these cases prove the DECISIONS around them — what may be held at all,
 * whose terms govern a refund, and that a partial disposition leaves an exact remainder without
 * destroying what was originally held.
 *
 * The structural guarantees — the two invariant triggers, the immutable lot, the append-only
 * dispositions, and what happens when two writers arrive together — are proved against the real
 * database in the live suite, because a fake that "implements" a trigger is the test agreeing with
 * itself.
 */
import { describe, expect, it } from "vitest";

import {
    createPaymentHold,
    disposeHold,
    heldCentsFor,
    heldRefundEligibility,
    readHoldsForPayments,
    type HeldDeposit,
} from "@/lib/financials/prepaid/heldDeposits";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const PAYMENT = "pay-1";
const ACTOR = "actor-1";

type Row = Record<string, unknown>;

/** A store that applies the two bounds the DATABASE applies, so refusals surface the same way. */
function store(payments: Row[] = [], holds: Row[] = [], dispositions: Row[] = []) {
    const pays = payments.map((r) => ({ ...r }));
    const holdRows = holds.map((r) => ({ ...r }));
    const dispRows = dispositions.map((r) => ({ ...r }));
    let seq = holdRows.length;

    const client = {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let kind = "select";
            let pending: Row | null = null;
            const self: Record<string, unknown> = {};

            self.select = () => self;
            self.order = () => self;
            self.limit = () => self;
            self.neq = (col: string, v: unknown) => { filters.push((r) => r[col] !== v); return self; };
            self.eq = (col: string, v: unknown) => { filters.push((r) => r[col] === v); return self; };
            self.in = (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return self; };
            self.insert = (v: Row) => { kind = "insert"; pending = v; return self; };

            const source = () =>
                table === "payments" ? pays : table === "payment_holds" ? holdRows : dispRows;
            const matching = () => source().filter((r) => filters.every((f) => f(r)));

            const settle = () => {
                if (kind === "insert" && pending) {
                    if (table === "payment_holds") {
                        const pay = pays.find((p) => p.id === pending!.payment_id) as Row | undefined;
                        const unapplied = Number(pay?.amount_cents ?? 0)
                            - Number(pay?.allocated_cents ?? 0)
                            - Number(pay?.refunded_cents ?? 0);
                        const heldNow = holdRows
                            .filter((h) => h.payment_id === pending!.payment_id)
                            .reduce((a, h) => {
                                const disposed = dispRows.filter((d) => d.hold_id === h.id)
                                    .reduce((x, d) => x + Number(d.amount_cents), 0);
                                return a + Number(h.amount_cents) - disposed;
                            }, 0);
                        if (heldNow + Number(pending.amount_cents) > unapplied) {
                            return { data: null, error: { message: `holding would exceed the unapplied money on payment ${pending.payment_id}` } };
                        }
                        seq += 1;
                        const row = { id: `hold-${seq}`, held_at: "2026-09-20T00:00:00Z", refundable_terms: {}, ...pending };
                        holdRows.push(row);
                        return { data: { ...row }, error: null };
                    }
                    /* payment_hold_dispositions — the per-hold bound. */
                    const hold = holdRows.find((h) => h.id === pending!.hold_id) as Row | undefined;
                    const disposed = dispRows.filter((d) => d.hold_id === pending!.hold_id)
                        .reduce((a, d) => a + Number(d.amount_cents), 0);
                    if (!hold || disposed + Number(pending.amount_cents) > Number(hold.amount_cents)) {
                        return { data: null, error: { message: `disposing would exceed hold ${pending!.hold_id}` } };
                    }
                    dispRows.push({ id: `disp-${dispRows.length + 1}`, disposed_at: "2026-09-20T01:00:00Z", ...pending });
                    return { data: { ...pending }, error: null };
                }
                return { data: matching().map((r) => ({ ...r })), error: null };
            };

            self.maybeSingle = async () => {
                const res = settle();
                return Array.isArray(res.data) ? { data: res.data[0] ?? null, error: res.error } : res;
            };
            self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
            return self;
        },
    };
    return { client, pays, holdRows, dispRows };
}

const posted = (over: Row = {}): Row => ({
    id: PAYMENT, org_id: ORG, amount_cents: 50_000, status: "posted", direction: "inbound",
    refunds_payment_id: null, currency: "USD", allocated_cents: 0, refunded_cents: 0, ...over,
});

const hold = (over: Partial<HeldDeposit> = {}): HeldDeposit => ({
    id: "hold-1", orgId: ORG, paymentId: PAYMENT, originalAmountCents: 50_000, remainingCents: 50_000,
    releasedCents: 0, appliedCents: 0, refundedCents: 0, refundable: true, refundableTerms: {},
    policyId: null, reason: null, heldAt: null, createdBy: null, dispositions: [], open: true, ...over,
});

describe("what money can be held", () => {
    it("holds part of a posted inbound receipt", async () => {
        const s = store([posted()]);
        const out = await createPaymentHold(s.client as never, {
            orgId: ORG, paymentId: PAYMENT, amountCents: 30_000, refundable: true, actorUserId: ACTOR,
        });
        expect(out.ok, !out.ok ? out.message : "").toBe(true);
        if (!out.ok) return;
        expect(out.hold.originalAmountCents).toBe(30_000);
        expect(out.hold.remainingCents).toBe(30_000);
    });

    /* Money the platform has been TOLD about is not money it HAS. */
    it("refuses to hold a pending payment", async () => {
        const s = store([posted({ status: "pending" })]);
        const out = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 10_000, refundable: true });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("not_holdable");
        expect(out.message).toMatch(/has not arrived yet/i);
    });

    it.each([["failed"], ["voided"]])("refuses to hold a %s payment", async (status) => {
        const s = store([posted({ status })]);
        const out = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 10_000, refundable: true });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("not_holdable");
    });

    it("refuses to hold a refund", async () => {
        const s = store([posted({ direction: "outbound", refunds_payment_id: "pay-orig" })]);
        const out = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 10_000, refundable: true });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.message).toMatch(/refund, not money received/i);
    });

    it("a payment in another organization reads as absent, not as forbidden", async () => {
        const s = store([posted({ org_id: OTHER_ORG })]);
        const out = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 1_000, refundable: true });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("payment_not_found");
        expect(out.message).toMatch(/not in this organization/i);
    });

    /* A DOLLAR CANNOT BE ALLOCATED AND HELD AT ONCE. */
    it("can only hold what is still unapplied", async () => {
        const s = store([posted({ amount_cents: 50_000, allocated_cents: 40_000 })]);
        const out = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 20_000, refundable: true });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("exceeds_unapplied");
        expect(out.message).toMatch(/not that much unspent money/i);
    });

    it("can only hold what is left after a partial refund", async () => {
        const s = store([posted({ amount_cents: 50_000, refunded_cents: 45_000 })]);
        const ok = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 5_000, refundable: true });
        expect(ok.ok).toBe(true);
        const tooMuch = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 1, refundable: true });
        expect(tooMuch.ok, "the refunded money is gone, not holdable").toBe(false);
    });

    it("aggregates several holds against one payment", async () => {
        const s = store([posted({ amount_cents: 50_000 })]);
        await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 30_000, refundable: true });
        const second = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 20_000, refundable: false });
        expect(second.ok).toBe(true);
        const third = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: 1, refundable: true });
        expect(third.ok, "the receipt is fully held").toBe(false);
    });

    it("refuses a zero or negative amount", async () => {
        const s = store([posted()]);
        for (const amount of [0, -100, 1.5]) {
            const out = await createPaymentHold(s.client as never, { orgId: ORG, paymentId: PAYMENT, amountCents: amount, refundable: true });
            expect(out.ok).toBe(false);
        }
    });
});

describe("partial dispositions leave an exact remainder", () => {
    /**
     * THE AMENDMENT, EXACTLY. $500 held, $200 released — the system must still know that $500 was
     * held and $200 released, not merely that $300 remains.
     */
    it("keeps the original amount after a partial release", async () => {
        const s = store([posted()], [{ id: "hold-1", org_id: ORG, payment_id: PAYMENT, amount_cents: 50_000, refundable: true }]);
        const out = await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "released", amountCents: 20_000, actorUserId: ACTOR });

        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.hold.originalAmountCents, "what was originally held survives").toBe(50_000);
        expect(out.hold.releasedCents).toBe(20_000);
        expect(out.hold.remainingCents).toBe(30_000);
        expect(out.hold.open).toBe(true);
    });

    it("closes the hold when everything has been disposed of", async () => {
        const s = store([posted()], [{ id: "hold-1", org_id: ORG, payment_id: PAYMENT, amount_cents: 50_000, refundable: true }]);
        const out = await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "released", amountCents: 50_000 });
        expect(out.ok && out.hold.remainingCents).toBe(0);
        expect(out.ok && out.hold.open).toBe(false);
    });

    /** $500 held → $100 released → $250 applied → $50 refunded → $100 remains. No dollar twice. */
    it("tracks release, apply and refund against one lot without losing a cent", async () => {
        const s = store([posted()], [{ id: "hold-1", org_id: ORG, payment_id: PAYMENT, amount_cents: 50_000, refundable: true }]);
        await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "released", amountCents: 10_000 });
        await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "applied", amountCents: 25_000, allocationId: "alloc-1" });
        const last = await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "refunded", amountCents: 5_000, refundPaymentId: "pay-refund" });

        expect(last.ok).toBe(true);
        if (!last.ok) return;
        const h = last.hold;
        expect(h.releasedCents).toBe(10_000);
        expect(h.appliedCents).toBe(25_000);
        expect(h.refundedCents).toBe(5_000);
        expect(h.remainingCents).toBe(10_000);
        expect(h.originalAmountCents).toBe(50_000);
        /* Every disposition is on the record, in order. */
        expect(h.dispositions.map((d) => d.kind)).toEqual(["released", "applied", "refunded"]);
    });

    it("refuses to dispose of more than is still held", async () => {
        const s = store([posted()], [{ id: "hold-1", org_id: ORG, payment_id: PAYMENT, amount_cents: 50_000, refundable: true }]);
        await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "released", amountCents: 40_000 });
        const over = await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "released", amountCents: 20_000 });
        expect(over.ok).toBe(false);
        if (over.ok) return;
        expect(over.reason).toBe("exceeds_remaining");
    });

    it("a hold in another organization reads as absent", async () => {
        const s = store([posted()], [{ id: "hold-1", org_id: OTHER_ORG, payment_id: PAYMENT, amount_cents: 50_000, refundable: true }]);
        const out = await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "released", amountCents: 1_000 });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("hold_not_found");
    });
});

describe("the terms money was taken under govern it forever", () => {
    it("refuses to refund a non-refundable deposit, in business language", async () => {
        const s = store([posted()], [{ id: "hold-1", org_id: ORG, payment_id: PAYMENT, amount_cents: 50_000, refundable: false }]);
        const out = await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "refunded", amountCents: 10_000, refundPaymentId: "pay-r" });

        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("not_refundable");
        expect(out.message).toMatch(/taken as non-refundable/i);
        /* No implementation vocabulary reaches the operator. */
        for (const leak of ["snapshot", "disposition", "lot", "payment_holds"]) {
            expect(out.message.toLowerCase()).not.toContain(leak);
        }
    });

    /* A non-refundable hold can still be RELEASED or APPLIED — it is refunding that the terms forbid. */
    it("still allows a non-refundable deposit to be released or applied", async () => {
        const s = store([posted()], [{ id: "hold-1", org_id: ORG, payment_id: PAYMENT, amount_cents: 50_000, refundable: false }]);
        expect((await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "released", amountCents: 10_000 })).ok).toBe(true);
        expect((await disposeHold(s.client as never, { orgId: ORG, holdId: "hold-1", kind: "applied", amountCents: 10_000, allocationId: "a-1" })).ok).toBe(true);
    });

    /**
     * THE SNAPSHOT, NOT THE CURRENT POLICY. Eligibility reads the hold's own terms, so money held
     * last year under refundable terms stays refundable however the policy has changed since.
     */
    it("decides refundability from the hold's own snapshot", () => {
        expect(heldRefundEligibility(hold({ refundable: true }), 10_000).ok).toBe(true);
        const no = heldRefundEligibility(hold({ refundable: false }), 10_000);
        expect(no.ok).toBe(false);
        if (no.ok) return;
        expect(no.message).toMatch(/non-refundable/i);
    });

    it("refuses to refund more than is still held", () => {
        const out = heldRefundEligibility(hold({ remainingCents: 5_000 }), 10_000);
        expect(out.ok).toBe(false);
    });
});

describe("summing held money", () => {
    it("counts only what remains, and only for the payment asked about", () => {
        const holds = [
            hold({ id: "h1", paymentId: "pay-a", remainingCents: 30_000 }),
            hold({ id: "h2", paymentId: "pay-a", remainingCents: 0 }),
            hold({ id: "h3", paymentId: "pay-b", remainingCents: 99_000 }),
        ];
        expect(heldCentsFor("pay-a", holds)).toBe(30_000);
        expect(heldCentsFor("pay-b", holds)).toBe(99_000);
        expect(heldCentsFor("pay-none", holds)).toBe(0);
    });

    it("reads nothing for an empty request", async () => {
        const s = store();
        expect(await readHoldsForPayments(s.client as never, { orgId: ORG, paymentIds: [] })).toEqual([]);
    });
});
