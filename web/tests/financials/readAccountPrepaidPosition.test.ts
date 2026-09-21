import { describe, expect, it, vi } from "vitest";

import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";

vi.mock("@/lib/financials/prepaid/heldDeposits", () => ({
    readHoldsForPayments: vi.fn(async () => []),
    heldCentsFor: (paymentId: string, holds: readonly { paymentId: string; remainingCents: number }[]) =>
        holds.filter((h) => h.paymentId === paymentId).reduce((a, h) => a + h.remainingCents, 0),
}));
import { readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";

/**
 * THE CANONICAL PREPAID READER — acquisition, not arithmetic (P0-7.6 · A′).
 *
 * The pure aggregate is proven elsewhere against the oracle. What is gated here is whether the
 * reader ACQUIRES the right receipts, in a bounded number of queries, and refuses to emit money
 * when any input is missing. Those are different claims, and a green arithmetic matrix says
 * nothing about any of them.
 */

type Q = { table: string; filters: Record<string, unknown>; ins: Record<string, unknown[]>; ors: string[]; neqs: Record<string, unknown> };

function fake(rows: Record<string, unknown[]>, fails: Set<string> = new Set()) {
    const queries: Q[] = [];
    const client = {
        from(table: string) {
            const q: Q = { table, filters: {}, ins: {}, ors: [], neqs: {} };
            queries.push(q);
            const b = {
                select() { return b; },
                eq(c: string, v: unknown) { q.filters[c] = v; return b; },
                neq(c: string, v: unknown) { q.neqs[c] = v; return b; },
                is(c: string, v: unknown) { q.filters[c] = v; return b; },
                in(c: string, v: unknown[]) { q.ins[c] = v; return b; },
                or(f: string) { q.ors.push(f); return b; },
                then(res: (r: { data: unknown[] | null; error: unknown }) => void) {
                    const key = `${table}${table === "payments" && q.ins.refunds_payment_id ? ":refunds" : ""}`;
                    if (fails.has(key)) return res({ data: null, error: { message: "boom" } });
                    return res({ data: (rows[key] ?? []) as unknown[], error: null });
                },
            };
            return b;
        },
    } as never;
    return { client, queries };
}

const base = {
    customer_members: [{ id: "m1" }, { id: "m2" }],
    child_enrollment_agreements: [{ id: "ag1" }],
    payments: [{ id: "p1", amount_cents: 50_000, status: "posted" }],
    "payments:refunds": [],
    payment_allocations: [],
};

describe("prepaid reader acquisition", () => {
    it("scopes payments by BILLABLE SOURCE, never by customer_id", async () => {
        const { client, queries } = fake(base);
        await readAccountPrepaidPosition(client, { orgId: "org-1", householdId: "hh-1", authorized: true });
        const pay = queries.find((q) => q.table === "payments" && !q.ins.refunds_payment_id)!;
        // The retracted diagnostic used .eq("customer_id", ...). That must never come back.
        expect(pay.filters.customer_id).toBeUndefined();
        expect(pay.ors.join("|")).toContain("billable_source_type.eq.customer");
        expect(pay.ors.join("|")).toContain("billable_source_type.eq.enrollment_agreement");
        expect(pay.ins.billable_source_type).toEqual(["enrollment_agreement", "customer"]);
        expect(pay.filters.direction).toBe("inbound");
        expect(pay.filters.refunds_payment_id).toBeNull();
    });

    it("reaches agreements that name only a CHILD — the false-zero this exists to prevent", async () => {
        const { client, queries } = fake(base);
        await readAccountPrepaidPosition(client, { orgId: "org-1", householdId: "hh-1", authorized: true });
        const ag = queries.find((q) => q.table === "child_enrollment_agreements")!;
        // customer_id alone would silently drop those agreements and their receipts.
        expect(ag.ors[0]).toContain("customer_id.eq.hh-1");
        expect(ag.ors[0]).toContain("customer_member_id.in.(m1,m2)");
    });

    it("applies NO lifecycle filter to agreements — money must not vanish when one ends", async () => {
        const { client, queries } = fake(base);
        await readAccountPrepaidPosition(client, { orgId: "org-1", householdId: "hh-1", authorized: true });
        const ag = queries.find((q) => q.table === "child_enrollment_agreements")!;
        for (const k of ["status", "state", "lifecycle", "active", "ended_at"]) expect(ag.filters[k]).toBeUndefined();
    });

    it("every read is org-scoped", async () => {
        const { client, queries } = fake(base);
        await readAccountPrepaidPosition(client, { orgId: "org-1", householdId: "hh-1", authorized: true });
        for (const q of queries) expect(q.filters.org_id, `${q.table} must be org-scoped`).toBe("org-1");
    });

    it("counts only ACTIVE allocations", async () => {
        const { client, queries } = fake(base);
        await readAccountPrepaidPosition(client, { orgId: "org-1", householdId: "hh-1", authorized: true });
        expect(queries.find((q) => q.table === "payment_allocations")!.filters.status).toBe("active");
    });

    it("excludes VOIDED refunds", async () => {
        const { client, queries } = fake(base);
        await readAccountPrepaidPosition(client, { orgId: "org-1", householdId: "hh-1", authorized: true });
        expect(queries.find((q) => q.ins.refunds_payment_id)!.neqs.status).toBe("voided");
    });
});

describe("query count is bounded by SOURCES, never by payments", () => {
    const manyPayments = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, amount_cents: 1_000, status: "posted" }));

    it("0 payments costs fewer reads than 1 — the batch phase is skipped entirely", async () => {
        const { client } = fake({ ...base, payments: [] });
        const r = await readAccountPrepaidPosition(client, { orgId: "o", householdId: "h", authorized: true });
        expect(r.diagnostics.queryCount).toBe(3);
    });

    it("1 payment and 40 payments cost the SAME number of reads", async () => {
        const one = await readAccountPrepaidPosition(fake(base).client, { orgId: "o", householdId: "h", authorized: true });
        const many = await readAccountPrepaidPosition(fake({ ...base, payments: manyPayments }).client, { orgId: "o", householdId: "h", authorized: true });
        expect(many.diagnostics.paymentCount).toBe(40);
        expect(many.diagnostics.queryCount).toBe(one.diagnostics.queryCount);
        // The defect this replaces issued TWO queries per payment: 40 receipts would have cost 80.
        expect(many.diagnostics.queryCount).toBeLessThan(10);
    });

    it("many agreements do not multiply reads either", async () => {
        const ags = Array.from({ length: 25 }, (_, i) => ({ id: `ag${i}` }));
        const r = await readAccountPrepaidPosition(fake({ ...base, child_enrollment_agreements: ags }).client, { orgId: "o", householdId: "h", authorized: true });
        expect(r.diagnostics.agreementCount).toBe(25);
        expect(r.diagnostics.queryCount).toBeLessThan(10);
    });
});

describe("failure and authorization semantics — never a confident amount", () => {
    it("unauthorized is FORBIDDEN and touches no table", async () => {
        const { client, queries } = fake(base);
        const r = await readAccountPrepaidPosition(client, { orgId: "o", householdId: "h", authorized: false });
        expect(r.outcome.state).toBe("forbidden");
        expect(queries).toHaveLength(0);
    });

    for (const [name, key] of [["members", "customer_members"], ["agreements", "child_enrollment_agreements"], ["payments", "payments"], ["allocations", "payment_allocations"], ["refunds", "payments:refunds"]] as const) {
        it(`a failed ${name} read is UNAVAILABLE, never zero`, async () => {
            const { client } = fake(base, new Set([key]));
            const r = await readAccountPrepaidPosition(client, { orgId: "o", householdId: "h", authorized: true });
            expect(r.outcome.state).toBe("unavailable");
            expect(JSON.stringify(r.outcome)).not.toContain("availableCents");
        });
    }

    it("a failed HOLDS read is UNAVAILABLE — held money missing is not held money absent", async () => {
        vi.mocked(readHoldsForPayments).mockRejectedValueOnce(new Error("boom"));
        const { client } = fake(base);
        const r = await readAccountPrepaidPosition(client, { orgId: "o", householdId: "h", authorized: true });
        expect(r.outcome.state).toBe("unavailable");
    });

    it("a household with no receipts is KNOWN with zeroes — a real answer, not a failure", async () => {
        const { client } = fake({ ...base, payments: [] });
        const r = await readAccountPrepaidPosition(client, { orgId: "o", householdId: "h", authorized: true });
        expect(r.outcome.state).toBe("ok");
        if (r.outcome.state === "ok") expect(r.outcome.position).toEqual({ availableCents: 0, pendingCents: 0, heldCents: 0 });
    });

    it("missing identity is UNAVAILABLE, not an empty account", async () => {
        const { client } = fake(base);
        const r = await readAccountPrepaidPosition(client, { orgId: "", householdId: "h", authorized: true });
        expect(r.outcome.state).toBe("unavailable");
    });
});

describe("acquisition + aggregate together", () => {
    it("sums a real receipt set through the reader end to end", async () => {
        vi.mocked(readHoldsForPayments).mockResolvedValueOnce([
            { paymentId: "p3", remainingCents: 30_000 },
        ] as never);
        const { client } = fake({
            ...base,
            payments: [
                { id: "p1", amount_cents: 20_000, status: "posted" },
                { id: "p2", amount_cents: 30_000, status: "pending" },
                { id: "p3", amount_cents: 50_000, status: "posted" },
                { id: "p4", amount_cents: 10_000, status: "posted" },
            ],
            payment_allocations: [{ payment_id: "p4", allocated_amount_cents: 4_000 }],
            "payments:refunds": [{ refunds_payment_id: "p4", amount_cents: 1_000 }],
        });
        const r = await readAccountPrepaidPosition(client, { orgId: "o", householdId: "h", authorized: true });
        expect(r.outcome.state).toBe("ok");
        if (r.outcome.state !== "ok") return;
        // p1 20,000 available; p2 pending 30,000; p3 50,000 with 30,000 held -> 20,000 available;
        // p4 10,000 - 4,000 allocated - 1,000 refunded = 5,000 available.
        expect(r.outcome.position).toEqual({ availableCents: 45_000, pendingCents: 30_000, heldCents: 30_000 });
    });
});
