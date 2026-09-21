import { describe, expect, it } from "vitest";

import { resolveAccountPrepaidPosition, type PaymentView } from "@/lib/financials/prepaid/availableFunds";
import { aggregatePrepaidPosition, resolvePrepaidPositionOutcome, type PrepaidAggregateInput } from "@/lib/financials/prepaid/prepaidAggregate";

/**
 * PREPAID PARITY — the A′ aggregate against the canonical oracle (P0-7.6 Part 2).
 *
 * The first-order card needs available/pending/held cents. The canonical path reaches them through
 * full payment views built with TWO QUERIES PER PAYMENT; the A′ candidate derives the same three
 * scalars from four bounded reads. This proves the two agree.
 *
 * WHY THIS IS A UNIT MATRIX AND NOT A STAGING RUN. The deployed specimen has ZERO payments, so
 * every comparison it can offer is empty-against-empty — it proves known-zero parity and nothing
 * else. The instruction forbids mutating staging financial data to manufacture coverage, so the
 * non-zero specimens are fixtures, which is the sanctioned route.
 *
 * BOTH SIDES ARE DRIVEN FROM ONE SPECIMEN. Each case below builds the oracle's `PaymentView[]` and
 * the aggregate's batched rows from the SAME declaration, so a case cannot accidentally describe
 * two different accounts — which is the failure that would make a green suite meaningless.
 */

type Specimen = {
    name: string;
    payments: Array<{
        id: string;
        amountCents: number;
        status: string;
        allocatedCents?: number;
        refundedCents?: number;
        heldCents?: number;
    }>;
};

/** The oracle's input: views carry `unappliedCents` already computed by the canonical reader. */
function toViews(s: Specimen): PaymentView[] {
    return s.payments.map((p) => ({
        paymentId: p.id,
        status: p.status,
        unappliedCents: p.amountCents - (p.allocatedCents ?? 0) - (p.refundedCents ?? 0),
        payerName: null,
    }) as unknown as PaymentView);
}

/** The aggregate's input: the same specimen, as batched rows. */
function toRows(s: Specimen): PrepaidAggregateInput {
    return {
        payments: s.payments.map((p) => ({ id: p.id, amountCents: p.amountCents, status: p.status })),
        allocatedCentsByPayment: Object.fromEntries(s.payments.filter((p) => p.allocatedCents).map((p) => [p.id, p.allocatedCents!])),
        refundedCentsByPayment: Object.fromEntries(s.payments.filter((p) => p.refundedCents).map((p) => [p.id, p.refundedCents!])),
        heldCentsByPayment: Object.fromEntries(s.payments.filter((p) => p.heldCents).map((p) => [p.id, p.heldCents!])),
    };
}

const heldMap = (s: Specimen) => Object.fromEntries(s.payments.filter((p) => p.heldCents).map((p) => [p.id, p.heldCents!]));

/** The dispatch's specimen matrix, A-H. */
const SPECIMENS: Specimen[] = [
    { name: "A unapplied payment", payments: [{ id: "a1", amountCents: 50_000, status: "posted" }] },
    { name: "B partially allocated", payments: [{ id: "b1", amountCents: 50_000, status: "posted", allocatedCents: 20_000 }] },
    { name: "C fully allocated", payments: [{ id: "c1", amountCents: 50_000, status: "posted", allocatedCents: 50_000 }] },
    { name: "D held money", payments: [{ id: "d1", amountCents: 50_000, status: "posted", heldCents: 30_000 }] },
    { name: "D2 fully held", payments: [{ id: "d2", amountCents: 50_000, status: "posted", heldCents: 50_000 }] },
    { name: "E released hold (hold now zero)", payments: [{ id: "e1", amountCents: 50_000, status: "posted", heldCents: 0 }] },
    { name: "F reversal / refund", payments: [{ id: "f1", amountCents: 50_000, status: "posted", refundedCents: 20_000 }] },
    { name: "F2 fully refunded", payments: [{ id: "f2", amountCents: 50_000, status: "posted", refundedCents: 50_000 }] },
    { name: "G pending receipt", payments: [{ id: "g1", amountCents: 40_000, status: "pending" }] },
    { name: "G2 pending with a hold never becomes available", payments: [{ id: "g2", amountCents: 40_000, status: "pending", heldCents: 10_000 }] },
    { name: "H available + pending + held simultaneously", payments: [
        { id: "h1", amountCents: 20_000, status: "posted" },
        { id: "h2", amountCents: 30_000, status: "pending" },
        { id: "h3", amountCents: 50_000, status: "posted", heldCents: 30_000 },
        { id: "h4", amountCents: 10_000, status: "posted", allocatedCents: 4_000, refundedCents: 1_000 },
    ] },
    { name: "hold exceeding the remainder cannot go negative", payments: [{ id: "x1", amountCents: 10_000, status: "posted", heldCents: 99_000 }] },
    { name: "allocation exceeding the receipt is not netted against others", payments: [
        { id: "y1", amountCents: 10_000, status: "posted", allocatedCents: 15_000 },
        { id: "y2", amountCents: 20_000, status: "posted" },
    ] },
    { name: "zero payments", payments: [] },
];

describe("A′ prepaid aggregate is semantically identical to the canonical oracle", () => {
    for (const s of SPECIMENS) {
        it(`${s.name}`, () => {
            const oracle = resolveAccountPrepaidPosition(toViews(s), heldMap(s));
            const candidate = aggregatePrepaidPosition(toRows(s));
            expect(candidate.availableCents, "available").toBe(oracle.availableCents);
            expect(candidate.pendingCents, "pending").toBe(oracle.pendingCents);
            expect(candidate.heldCents, "held").toBe(oracle.heldCents);
        });
    }

    it("THE GATE: the matrix actually exercises non-zero money in all three totals", () => {
        // Without this, every case above could be comparing 0 with 0 and the suite would be
        // vacuous — the exact defect that made the staging specimen useless for this question.
        const totals = SPECIMENS.map((s) => aggregatePrepaidPosition(toRows(s)));
        expect(totals.some((t) => t.availableCents > 0), "some specimen has available money").toBe(true);
        expect(totals.some((t) => t.pendingCents > 0), "some specimen has pending money").toBe(true);
        expect(totals.some((t) => t.heldCents > 0), "some specimen has held money").toBe(true);
        const h = aggregatePrepaidPosition(toRows(SPECIMENS.find((s) => s.name.startsWith("H"))!));
        expect(h.availableCents > 0 && h.pendingCents > 0 && h.heldCents > 0, "H is simultaneously non-zero").toBe(true);
    });

    it("THE CONTROL: a deliberately wrong aggregate FAILS the comparison", () => {
        // A parity suite that cannot fail proves nothing. Dropping refunds is the specific mistake
        // the first draft of the aggregate actually made.
        const s = SPECIMENS.find((x) => x.name.startsWith("F "))!;
        const withoutRefunds: PrepaidAggregateInput = { ...toRows(s), refundedCentsByPayment: {} };
        const wrong = aggregatePrepaidPosition(withoutRefunds);
        const oracle = resolveAccountPrepaidPosition(toViews(s), heldMap(s));
        expect(wrong.availableCents).not.toBe(oracle.availableCents);
    });
});

describe("prepaid failure semantics — UNKNOWN is never ZERO (Part 3)", () => {
    const ok = <T,>(value: T) => ({ state: "ok" as const, value });
    const base = {
        payments: ok<readonly { id: string; amountCents: number; status: string }[]>([
            { id: "p1", amountCents: 50_000, status: "posted" },
        ]),
        allocations: ok<Readonly<Record<string, number>>>({}),
        refunds: ok<Readonly<Record<string, number>>>({}),
        holds: ok<Readonly<Record<string, number>>>({}),
    };

    it("known non-zero resolves to the exact amount", () => {
        const r = resolvePrepaidPositionOutcome(base);
        expect(r.state).toBe("ok");
        if (r.state === "ok") expect(r.position.availableCents).toBe(50_000);
    });

    it("known zero resolves to zero — an empty account is a real answer", () => {
        const r = resolvePrepaidPositionOutcome({ ...base, payments: ok([]) });
        expect(r.state).toBe("ok");
        if (r.state === "ok") expect(r.position.availableCents).toBe(0);
    });

    for (const key of ["payments", "allocations", "refunds", "holds"] as const) {
        it(`a failed ${key} read is UNAVAILABLE, never zero`, () => {
            const r = resolvePrepaidPositionOutcome({ ...base, [key]: { state: "unavailable", reason: "boom" } });
            expect(r.state).toBe("unavailable");
        });
    }

    it("a partial failure never emits a confident amount", () => {
        // Three of four inputs is not a smaller truth; it is a wrong number.
        const r = resolvePrepaidPositionOutcome({ ...base, allocations: { state: "unavailable", reason: "boom" } });
        expect(r.state).toBe("unavailable");
        expect(JSON.stringify(r)).not.toContain("availableCents");
    });

    it("authorization denial is FORBIDDEN, not empty and not zero", () => {
        const r = resolvePrepaidPositionOutcome({ ...base, payments: { state: "forbidden" } });
        expect(r.state).toBe("forbidden");
        expect(JSON.stringify(r)).not.toContain("availableCents");
    });

    it("FORBIDDEN outranks UNAVAILABLE — the caller is told they may not see it", () => {
        const r = resolvePrepaidPositionOutcome({
            ...base,
            payments: { state: "forbidden" },
            holds: { state: "unavailable", reason: "boom" },
        });
        expect(r.state).toBe("forbidden");
    });
});
