import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/financials/prepaid/heldDeposits", () => ({
    readHoldsForPayments: vi.fn(async () => []),
    heldCentsFor: (paymentId: string, holds: readonly { paymentId: string; remainingCents: number }[]) =>
        holds.filter((h) => h.paymentId === paymentId).reduce((a, h) => a + h.remainingCents, 0),
}));
import { readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";
import {
    PREPAID_RECEIPT_SCAN_CAP,
    readAccountPrepaidPosition,
} from "@/lib/financials/prepaid/readAccountPrepaidPosition";

/**
 * AN ACCOUNT'S PREPAID POSITION AT SCALE — the W6-B residual, repaired.
 *
 * The reader fetched a household's receipts with ONE unpaged select. PostgREST answers at most
 * `db-max-rows` — 1,000 on this deployment — to any single query, with no error and no header
 * anyone reads. So an account with more receipts than that was answered with a page, and the
 * following `.in("payment_id", …)` over those thousand ids overflowed the request URI and failed
 * outright. The account reported `unavailable`.
 *
 * That was HONEST — never a false zero — which is why W6-B could carry it. It was still a ceiling:
 * measured on the certification tenant, a household holding 4,750 receipts on one agreement could
 * not report a position at all.
 *
 * ── WHY THIS FAKE ENFORCES THE LIMITS RATHER THAN RETURNING WHAT IT IS ASKED FOR ──
 *
 * A fake that always answers the full set cannot see either defect: the unpaged reader would look
 * correct at every size. So this one behaves like the server. It truncates any un-ranged query at
 * 1,000 rows and refuses an id list longer than the URI can carry. Against it, the pre-repair
 * reader fails and the paged reader does not — which is the only way these cases mean anything.
 */

const POSTGREST_MAX_ROWS = 1000;
/* Comfortably above `ID_BATCH` (80) and far below a thousand ids, which is what used to overflow. */
const URI_ID_LIMIT = 120;

type Q = { table: string; ins: Record<string, unknown[]>; range: { from: number; to: number } | null; orders: string[] };

function serverLike(rows: Record<string, unknown[]>) {
    const queries: Q[] = [];
    let truncatedReads = 0;
    const client = {
        from(table: string) {
            const q: Q = { table, ins: {}, range: null, orders: [] };
            queries.push(q);
            const b = {
                select() { return b; },
                eq() { return b; },
                neq() { return b; },
                is() { return b; },
                in(c: string, v: unknown[]) { q.ins[c] = v; return b; },
                or() { return b; },
                order(c: string) { q.orders.push(c); return b; },
                range(from: number, to: number) { q.range = { from, to }; return b; },
                then(res: (r: { data: unknown[] | null; error: unknown }) => void) {
                    const key = `${table}${table === "payments" && q.ins.refunds_payment_id ? ":refunds" : ""}`;
                    /* THE URI BOUND. Too many identifiers in one request is a hard failure. */
                    for (const [, ids] of Object.entries(q.ins)) {
                        if (Array.isArray(ids) && ids.length > URI_ID_LIMIT) {
                            return res({ data: null, error: { message: "414 Request-URI Too Long" } });
                        }
                    }
                    /*
                     * THE FAKE MUST HONOUR ITS OWN `in` FILTER.
                     *
                     * It did not, and the batched allocation read then received every allocation on
                     * every batch — truncated at 1,000 by the row bound below, so only the first
                     * thousand receipts ever looked applied and 400 of 1,400 read as unapplied
                     * money. A fake that ignores the filter it was given cannot prove batching
                     * works; it proves only that something was asked.
                     */
                    let all = (rows[key] ?? []) as Array<Record<string, unknown>>;
                    for (const [col, ids] of Object.entries(q.ins)) {
                        if (!Array.isArray(ids) || !ids.length) continue;
                        /* `billable_source_type` is a value filter, not an identity cohort. */
                        if (col === "billable_source_type") continue;
                        const want = new Set(ids.map(String));
                        all = all.filter((r) => want.has(String(r[col])));
                    }
                    if (q.range) {
                        const want = q.range.to - q.range.from + 1;
                        /* A page may not exceed the server's own maximum either. */
                        const size = Math.min(want, POSTGREST_MAX_ROWS);
                        return res({ data: all.slice(q.range.from, q.range.from + size), error: null });
                    }
                    /* THE ROW BOUND. An un-ranged read is silently a page. */
                    if (all.length > POSTGREST_MAX_ROWS) truncatedReads += 1;
                    return res({ data: all.slice(0, POSTGREST_MAX_ROWS), error: null });
                },
            };
            return b;
        },
    } as never;
    return { client, queries, stats: () => ({ truncatedReads }) };
}

const receipts = (n: number, each = 100, status = "posted") =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, amount_cents: each, status }));

function account(payments: unknown[], over: Record<string, unknown[]> = {}) {
    return {
        customer_members: [{ id: "m1" }],
        child_enrollment_agreements: [{ id: "ag1" }],
        payments,
        "payments:refunds": [],
        payment_allocations: [],
        ...over,
    };
}

/** Every case starts with no holds, so one case's mock cannot become another's money. */
beforeEach(() => {
    vi.mocked(readHoldsForPayments).mockResolvedValue([] as never);
});

async function position(rows: Record<string, unknown[]>) {
    const f = serverLike(rows);
    const { outcome } = await readAccountPrepaidPosition(f.client, {
        orgId: "org-1", householdId: "hh-1", authorized: true,
    });
    return { outcome, ...f, statsNow: f.stats() };
}

describe("prepaid at the row ceiling", () => {
    /* 999 / 1,000 / 1,001 / 2,000 and the measured 4,750 case. */
    it.each([
        [999, 99_900],
        [1000, 100_000],
        [1001, 100_100],
        [2000, 200_000],
        [4750, 475_000],
    ])("reports the whole cohort at %i receipts", async (n, expected) => {
        const r = await position(account(receipts(n)));
        expect(r.outcome.state, JSON.stringify(r.outcome)).toBe("ok");
        if (r.outcome.state !== "ok") return;
        expect(r.outcome.position.availableCents).toBe(expected);
    });

    it("pages the receipt cohort rather than asking for it all at once", async () => {
        const r = await position(account(receipts(2500)));
        const paged = r.queries.filter((q) => q.table === "payments" && !q.ins.refunds_payment_id);
        expect(paged.length, "more than one page was requested").toBeGreaterThan(1);
        expect(paged.every((q) => q.range !== null), "every cohort read is ranged").toBe(true);
        /* No un-ranged read may have been silently truncated. */
        expect(r.statsNow.truncatedReads).toBe(0);
    });

    /**
     * ORDER TOTALLY. Range paging over a non-unique sort key repeats or skips rows across page
     * boundaries, and in this file a repeated receipt is money counted twice.
     */
    it("orders by a unique key so no receipt straddles a page boundary", async () => {
        const r = await position(account(receipts(2500)));
        const paged = r.queries.filter((q) => q.table === "payments" && !q.ins.refunds_payment_id);
        expect(paged.every((q) => q.orders.includes("id"))).toBe(true);
        /* And the arithmetic proves it: 2,500 × $1 with no duplicate is exactly $2,500. */
        expect(r.outcome.state).toBe("ok");
        if (r.outcome.state !== "ok") return;
        expect(r.outcome.position.availableCents).toBe(250_000);
    });

    it("never sends an id list the request URI cannot carry", async () => {
        const r = await position(account(receipts(4750)));
        const withIds = r.queries.filter((q) => Object.values(q.ins).some((v) => Array.isArray(v) && v.length > 0));
        expect(withIds.length).toBeGreaterThan(0);
        for (const q of withIds) {
            for (const [col, ids] of Object.entries(q.ins)) {
                if (!Array.isArray(ids)) continue;
                expect(ids.length, `${q.table}.${col} carried ${ids.length} ids`).toBeLessThanOrEqual(URI_ID_LIMIT);
            }
        }
        expect(r.outcome.state).toBe("ok");
    });
});

describe("what scale must not change about the money", () => {
    it("subtracts held money at scale", async () => {
        /*
         * The hold must fit INSIDE its receipt. `aggregatePrepaidPosition` bounds a hold by that
         * receipt's remainder, so a hold larger than the receipt cannot drive available money
         * negative — which is correct, and is why this holds 60 of a 100-cent receipt rather than
         * an amount the receipt could never carry.
         *
         * Set with `mockResolvedValue` and reset in the same case: `…Once` is consumed by whichever
         * test calls the reader next, which is not necessarily this one.
         */
        vi.mocked(readHoldsForPayments).mockResolvedValue([{ paymentId: "p0", remainingCents: 60 }] as never);
        try {
            const r = await position(account(receipts(1500)));
            expect(r.outcome.state).toBe("ok");
            if (r.outcome.state !== "ok") return;
            expect(r.outcome.position.heldCents).toBe(60);
            expect(r.outcome.position.availableCents).toBe(150_000 - 60);
        } finally {
            vi.mocked(readHoldsForPayments).mockResolvedValue([] as never);
        }
    });

    it("excludes PENDING receipts from available and reports them separately", async () => {
        const r = await position(account([
            ...receipts(1200),
            ...receipts(3, 100, "pending").map((p, i) => ({ ...p, id: `pend${i}` })),
        ]));
        expect(r.outcome.state).toBe("ok");
        if (r.outcome.state !== "ok") return;
        expect(r.outcome.position.availableCents, "pending money has not arrived").toBe(120_000);
        expect(r.outcome.position.pendingCents).toBe(300);
    });

    it.each([["failed"], ["voided"]])("excludes %s receipts at scale", async (status) => {
        const r = await position(account([
            ...receipts(1100),
            ...receipts(5, 100, status).map((p, i) => ({ ...p, id: `${status}${i}` })),
        ]));
        expect(r.outcome.state).toBe("ok");
        if (r.outcome.state !== "ok") return;
        expect(r.outcome.position.availableCents).toBe(110_000);
    });

    it("counts each allocation once across page boundaries", async () => {
        /* One allocation per receipt: nothing is left unapplied, so nothing is available. */
        const n = 1400;
        const r = await position(account(receipts(n), {
            payment_allocations: Array.from({ length: n }, (_, i) => ({
                payment_id: `p${i}`, allocated_amount_cents: 100,
            })),
        }));
        expect(r.outcome.state).toBe("ok");
        if (r.outcome.state !== "ok") return;
        expect(r.outcome.position.availableCents, "fully applied money is not available").toBe(0);
    });

    it("treats refunded money canonically at scale", async () => {
        const r = await position(account(receipts(1300), {
            "payments:refunds": [
                { refunds_payment_id: "p0", amount_cents: 100 },
                { refunds_payment_id: "p1", amount_cents: 100 },
            ],
        }));
        expect(r.outcome.state).toBe("ok");
        if (r.outcome.state !== "ok") return;
        /* Two receipts went back out, so they are not available money. */
        expect(r.outcome.position.availableCents).toBe(130_000 - 200);
    });
});

describe("the cap is a refusal, not a smaller number", () => {
    /**
     * An operational cohort scan may honestly report "there is more". An ACCOUNT's own money may
     * not: a total computed from part of a ledger is not partial, it is wrong. So reaching the cap
     * is UNAVAILABLE — and this is the case that would otherwise quietly under-report.
     */
    it("refuses rather than reporting a partial figure past the scan cap", async () => {
        const r = await position(account(receipts(PREPAID_RECEIPT_SCAN_CAP + 10)));
        expect(r.outcome.state).toBe("unavailable");
        if (r.outcome.state !== "unavailable") return;
        expect(r.outcome.reason).toMatch(/scan cap/i);
    });

    /**
     * WHERE THE BOUNDARY ACTUALLY FALLS, measured rather than assumed.
     *
     * `readAllPages` documents itself as reporting truncation "only when the cap was actually
     * reached AND the read did not run out of rows first, so a cohort of exactly `scanCap` is not
     * reported as incomplete". That is true only when the final page comes back SHORT. A cohort of
     * exactly the cap fills its last page, so `reachedEnd` stays false and the read is reported
     * truncated — the primitive's comment overstates by one page.
     *
     * For an account's money that error is in the SAFE direction: it refuses where it might have
     * answered, and a refusal is recoverable where a wrong total is not. Recorded here rather than
     * repaired in the shared primitive, whose cohort-scan callers report truncation honestly and
     * would change behaviour if it moved.
     */
    it("a cohort one page below the cap is complete", async () => {
        const r = await position(account(receipts(PREPAID_RECEIPT_SCAN_CAP - 1000)));
        expect(r.outcome.state).toBe("ok");
    });

    it("a cohort of exactly the cap refuses, which is the safe direction", async () => {
        const r = await position(account(receipts(PREPAID_RECEIPT_SCAN_CAP)));
        expect(r.outcome.state).toBe("unavailable");
    });

    it("the cap clears the largest measured account with room", () => {
        expect(PREPAID_RECEIPT_SCAN_CAP).toBeGreaterThan(4750);
    });
});
