/**
 * COMMERCIAL FINALIZATION — the close authority, its eligibility, and its idempotency.
 *
 * These cases are about the close service itself and the rules it owns. The guards that refuse work
 * INTO a closed period live with the writers they guard, and are certified in
 * `billingPeriodCloseGuards.test.ts` beside the binder and the posting authority.
 *
 * The database already enforces a great deal of this — close shape, actor shape, frozen bounds, no
 * reopen — so these cases deliberately assert what the SERVICE decides, which the database cannot:
 * whether a period is eligible yet, and whether a second close is allowed to re-author the first.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
    BillingPeriodCloseError,
    closeBillingPeriod,
    evaluateBillingPeriodCloseEligibility,
    findClosableBillingPeriods,
    isBillingPeriodElapsed,
    BILLING_PERIOD_CLOSE_PERMISSION,
} from "@/lib/financials/billingPeriods/closeBillingPeriod";

const ORG = "org-1";
const OPERATOR = "user-operator-1";

type PeriodSeed = {
    id: string;
    customer_id: string;
    period_key: string;
    cadence?: string;
    starts_on: string;
    ends_on: string;
    status?: string;
    closed_at?: string | null;
    closed_by?: string | null;
    close_actor?: string | null;
};

/**
 * A fake that behaves like the parts of PostgREST this service uses, including the thing that
 * matters most: a conditional UPDATE returns the rows it MATCHED, so `.eq("status","open")` on an
 * already-closed row returns none. A fake that ignored the filter would make the race test and the
 * idempotency test both pass vacuously.
 */
function makeDb(seeds: PeriodSeed[]) {
    const rows = seeds.map((s) => ({
        cadence: "monthly",
        status: "open",
        closed_at: null,
        closed_by: null,
        close_actor: null,
        org_id: ORG,
        ...s,
    })) as Array<Record<string, unknown>>;

    const state = { updateCalls: 0 };

    function queryFor(table: string) {
        if (table !== "financial_billing_periods") throw new Error(`unexpected table ${table}`);
        const filters: Array<[string, unknown]> = [];
        const lt: Array<[string, unknown]> = [];
        let pendingUpdate: Record<string, unknown> | null = null;
        let order: { field: string; ascending: boolean } | null = null;
        let limit: number | null = null;

        const matching = () =>
            rows.filter((r) =>
                filters.every(([k, v]) => r[k] === v) && lt.every(([k, v]) => String(r[k]) < String(v)),
            );

        const api: Record<string, unknown> = {
            select() {
                return api;
            },
            eq(field: string, value: unknown) {
                filters.push([field, value]);
                return api;
            },
            lt(field: string, value: unknown) {
                lt.push([field, value]);
                return api;
            },
            order(field: string, opts?: { ascending?: boolean }) {
                order = { field, ascending: opts?.ascending !== false };
                return api;
            },
            limit(n: number) {
                limit = n;
                return api;
            },
            update(patch: Record<string, unknown>) {
                pendingUpdate = patch;
                state.updateCalls += 1;
                return api;
            },
            async maybeSingle() {
                const found = matching();
                return { data: found[0] ?? null, error: null };
            },
            then(resolve: (v: { data: unknown; error: null }) => unknown) {
                /* Awaiting the builder resolves it, which is how the real client behaves. */
                let found = matching();
                if (pendingUpdate) {
                    for (const r of found) Object.assign(r, pendingUpdate);
                } else if (order) {
                    const { field, ascending } = order;
                    found = [...found].sort((a, b) =>
                        ascending
                            ? String(a[field]).localeCompare(String(b[field]))
                            : String(b[field]).localeCompare(String(a[field])),
                    );
                    if (limit != null) found = found.slice(0, limit);
                }
                return resolve({ data: found.map((r) => ({ ...r })), error: null });
            },
        };
        return api;
    }

    return {
        db: { from: (table: string) => queryFor(table) } as never,
        rows,
        state,
        row: (id: string) => rows.find((r) => r.id === id)!,
    };
}

describe("close eligibility — NO EARLY CLOSE", () => {
    it("the boundary is inclusive: a period is eligible the day AFTER it ends", () => {
        /* While the household is still accruing into November, November is not finished. */
        expect(isBillingPeriodElapsed("2026-11-30", "2026-11-29")).toBe(false);
        expect(isBillingPeriodElapsed("2026-11-30", "2026-11-30")).toBe(false);
        expect(isBillingPeriodElapsed("2026-11-30", "2026-12-01")).toBe(true);
    });

    it("refuses a close before the boundary, and says when it becomes available", () => {
        const verdict = evaluateBillingPeriodCloseEligibility(
            { id: "p1", period_key: "2026-11", ends_on: "2026-11-30", status: "open" },
            "2026-11-12",
        );
        expect(verdict.eligible).toBe(false);
        if (verdict.eligible) throw new Error("unreachable");
        expect(verdict.code).toBe("billing_period_not_elapsed");
        expect(verdict.message).toContain("2026-11-30");
        expect(verdict.message).toContain("has not finished yet");
        /* No internal vocabulary in an operator's refusal. */
        expect(verdict.message.toLowerCase()).not.toContain("constraint");
        expect(verdict.message.toLowerCase()).not.toContain("internal");
    });

    it("fin.adjust is authority to EXECUTE an eligible close, not to shorten the calendar", async () => {
        /*
         * The distinction the Director drew. An authorised operator still cannot close November on
         * the 12th: the permission answers "may you run this", not "may you pick the end date".
         */
        expect(BILLING_PERIOD_CLOSE_PERMISSION).toBe("fin.adjust");
        const { db, row } = makeDb([
            { id: "p1", customer_id: "c1", period_key: "2026-11", starts_on: "2026-11-01", ends_on: "2026-11-30" },
        ]);
        await expect(
            closeBillingPeriod(db, {
                orgId: ORG,
                billingPeriodId: "p1",
                closeActor: "operator",
                actorUserId: OPERATOR,
                todayYmd: "2026-11-12",
            }),
        ).rejects.toThrow(/has not finished yet/);
        /* And nothing was written while refusing. */
        expect(row("p1").status).toBe("open");
        expect(row("p1").closed_at).toBeNull();
    });

    it("SNAPSHOTTED BOUNDS decide, not today's calendar", async () => {
        /*
         * The period's own `ends_on` is the only input. Nothing in this service reads a customer or
         * location calendar, so a household that switched monthly -> weekly in December cannot make
         * November end on a different day. The database agrees: the immutability trigger raises
         * `billing_period_bounds_frozen` on any attempt to move the bounds.
         *
         * Asserted by behaviour: an annual period ending far in the future refuses, even though
         * "the current calendar" for a weekly household would have ended long ago.
         */
        const { db } = makeDb([
            {
                id: "annual",
                customer_id: "c1",
                period_key: "2026-01-05~2027-01-04",
                cadence: "annual",
                starts_on: "2026-01-05",
                ends_on: "2027-01-04",
            },
        ]);
        await expect(
            closeBillingPeriod(db, {
                orgId: ORG,
                billingPeriodId: "annual",
                closeActor: "system",
                todayYmd: "2026-12-01",
            }),
        ).rejects.toThrow(/2027-01-04/);
    });
});

describe("close transition and attribution", () => {
    let fixture: ReturnType<typeof makeDb>;

    beforeEach(() => {
        fixture = makeDb([
            { id: "nov", customer_id: "c1", period_key: "2026-11", starts_on: "2026-11-01", ends_on: "2026-11-30" },
            { id: "dec", customer_id: "c1", period_key: "2026-12", starts_on: "2026-12-01", ends_on: "2026-12-31" },
        ]);
    });

    it("an operator close persists status, closed_at, actor AND the human", async () => {
        const result = await closeBillingPeriod(fixture.db, {
            orgId: ORG,
            billingPeriodId: "nov",
            closeActor: "operator",
            actorUserId: OPERATOR,
            todayYmd: "2026-12-01",
        });
        expect(result.transitioned).toBe(true);
        expect(result.status).toBe("closed");
        expect(result.closeActor).toBe("operator");
        expect(result.closedBy).toBe(OPERATOR);
        expect(result.closedAt).toBeTruthy();
        expect(result.periodKey).toBe("2026-11");

        const stored = fixture.row("nov");
        expect(stored.status).toBe("closed");
        expect(stored.close_actor).toBe("operator");
        expect(stored.closed_by).toBe(OPERATOR);
        expect(stored.closed_at).toBe(result.closedAt);
    });

    it("a system close is attributed to NOBODY — closed_by stays null", async () => {
        const result = await closeBillingPeriod(fixture.db, {
            orgId: ORG,
            billingPeriodId: "nov",
            closeActor: "system",
            todayYmd: "2026-12-01",
        });
        expect(result.closeActor).toBe("system");
        expect(result.closedBy).toBeNull();
        expect(fixture.row("nov").closed_by).toBeNull();
    });

    it("REFUSES to fabricate a human actor for an automatic close", async () => {
        /* The failure this prevents: a scheduler satisfying a NOT NULL by naming someone. */
        await expect(
            closeBillingPeriod(fixture.db, {
                orgId: ORG,
                billingPeriodId: "nov",
                closeActor: "system",
                actorUserId: OPERATOR,
                todayYmd: "2026-12-01",
            }),
        ).rejects.toThrow(/attributed to the system, not to a person/);
        expect(fixture.row("nov").status).toBe("open");
    });

    it("refuses an operator close that names nobody", async () => {
        await expect(
            closeBillingPeriod(fixture.db, {
                orgId: ORG,
                billingPeriodId: "nov",
                closeActor: "operator",
                actorUserId: null,
                todayYmd: "2026-12-01",
            }),
        ).rejects.toThrow(/must name the person/);
    });

    it("closing November leaves December alone — close freezes a period, not an account", async () => {
        await closeBillingPeriod(fixture.db, {
            orgId: ORG,
            billingPeriodId: "nov",
            closeActor: "operator",
            actorUserId: OPERATOR,
            todayYmd: "2026-12-01",
        });
        expect(fixture.row("dec").status).toBe("open");
        expect(fixture.row("dec").closed_at).toBeNull();
    });

    it("a missing period is not found, and says so without leaking internals", async () => {
        await expect(
            closeBillingPeriod(fixture.db, {
                orgId: ORG,
                billingPeriodId: "nope",
                closeActor: "system",
                todayYmd: "2026-12-01",
            }),
        ).rejects.toThrow(BillingPeriodCloseError);
    });
});

describe("ONE PERIOD, ONE TRANSITION — idempotency", () => {
    it("a second close does not rewrite closed_at, re-attribute, or reopen", async () => {
        const fixture = makeDb([
            { id: "nov", customer_id: "c1", period_key: "2026-11", starts_on: "2026-11-01", ends_on: "2026-11-30" },
        ]);
        const first = await closeBillingPeriod(fixture.db, {
            orgId: ORG,
            billingPeriodId: "nov",
            closeActor: "operator",
            actorUserId: OPERATOR,
            todayYmd: "2026-12-01",
        });
        expect(first.transitioned).toBe(true);

        /* A scheduler retry, a duplicate occurrence, or an operator clicking twice. */
        const second = await closeBillingPeriod(fixture.db, {
            orgId: ORG,
            billingPeriodId: "nov",
            closeActor: "system",
            todayYmd: "2026-12-05",
        });

        expect(second.transitioned).toBe(false);
        /* THE FIRST TRANSITION IS THE COMMERCIAL FACT. A later caller does not re-author it — */
        expect(second.closedAt).toBe(first.closedAt);
        /* — not even when the later caller is a different KIND of actor. */
        expect(second.closeActor).toBe("operator");
        expect(second.closedBy).toBe(OPERATOR);
        expect(second.status).toBe("closed");
        expect(fixture.row("nov").closed_at).toBe(first.closedAt);
        expect(fixture.row("nov").close_actor).toBe("operator");
    });

    it("an already-closed period is answered BEFORE eligibility, so it never refuses as 'not elapsed'", async () => {
        /*
         * Ordering matters: a period closed on time, re-closed later, must not start failing the
         * elapsed test for some unrelated reason. Here the already-closed answer is returned even
         * with a today that predates the boundary.
         */
        const fixture = makeDb([
            {
                id: "nov",
                customer_id: "c1",
                period_key: "2026-11",
                starts_on: "2026-11-01",
                ends_on: "2026-11-30",
                status: "closed",
                closed_at: "2026-12-01T00:00:00.000Z",
                close_actor: "system",
                closed_by: null,
            },
        ]);
        const result = await closeBillingPeriod(fixture.db, {
            orgId: ORG,
            billingPeriodId: "nov",
            closeActor: "operator",
            actorUserId: OPERATOR,
            todayYmd: "2026-11-05",
        });
        expect(result.transitioned).toBe(false);
        expect(result.closeActor).toBe("system");
        expect(result.closedAt).toBe("2026-12-01T00:00:00.000Z");
    });

    it("the update is conditional on still being OPEN, which is what makes the race safe", async () => {
        const fixture = makeDb([
            { id: "nov", customer_id: "c1", period_key: "2026-11", starts_on: "2026-11-01", ends_on: "2026-11-30" },
        ]);
        /* Two callers, same period, concurrently. */
        const [a, b] = await Promise.all([
            closeBillingPeriod(fixture.db, {
                orgId: ORG, billingPeriodId: "nov", closeActor: "operator", actorUserId: OPERATOR, todayYmd: "2026-12-01",
            }),
            closeBillingPeriod(fixture.db, {
                orgId: ORG, billingPeriodId: "nov", closeActor: "system", todayYmd: "2026-12-01",
            }),
        ]);
        /* Exactly one transitioned; both report the same closed_at. */
        expect([a.transitioned, b.transitioned].filter(Boolean)).toHaveLength(1);
        expect(a.closedAt).toBe(b.closedAt);
        expect(a.closeActor).toBe(b.closeActor);
    });
});

describe("discovering what is eligible", () => {
    it("finds only OPEN periods whose interval has finished, oldest first", async () => {
        const fixture = makeDb([
            { id: "sep", customer_id: "c1", period_key: "2026-09", starts_on: "2026-09-01", ends_on: "2026-09-30" },
            { id: "oct", customer_id: "c1", period_key: "2026-10", starts_on: "2026-10-01", ends_on: "2026-10-31" },
            { id: "nov", customer_id: "c1", period_key: "2026-11", starts_on: "2026-11-01", ends_on: "2026-11-30" },
            {
                id: "aug",
                customer_id: "c1",
                period_key: "2026-08",
                starts_on: "2026-08-01",
                ends_on: "2026-08-31",
                status: "closed",
                closed_at: "2026-09-01T00:00:00.000Z",
                close_actor: "system",
            },
        ]);
        const found = await findClosableBillingPeriods(fixture.db, { orgId: ORG, todayYmd: "2026-11-15" });
        /* September and October finished; November has not; August is already closed. */
        expect(found.map((p) => p.id)).toEqual(["sep", "oct"]);
    });

    it("is bounded, so a backlog drains across wakes instead of in one attempt", async () => {
        const fixture = makeDb([
            { id: "a", customer_id: "c1", period_key: "a", starts_on: "2026-01-01", ends_on: "2026-01-31" },
            { id: "b", customer_id: "c2", period_key: "b", starts_on: "2026-02-01", ends_on: "2026-02-28" },
            { id: "c", customer_id: "c3", period_key: "c", starts_on: "2026-03-01", ends_on: "2026-03-31" },
        ]);
        const found = await findClosableBillingPeriods(fixture.db, {
            orgId: ORG,
            todayYmd: "2026-12-01",
            limit: 2,
        });
        expect(found).toHaveLength(2);
        expect(found.map((p) => p.id)).toEqual(["a", "b"]);
    });
});
