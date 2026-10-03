/**
 * AUTOMATIC CLOSE — the registered handler, and the two things that must stay independent of it.
 *
 * The handler's own job is small and these cases keep it that way: discover elapsed open periods,
 * close each through the SAME service an operator uses, report what happened. Every rule about
 * WHETHER a period may close belongs to `closeBillingPeriod`, so a handler that started making its
 * own decisions would be the defect — which is why the system/operator difference is asserted here
 * as a parameter rather than as behaviour.
 */
import { describe, expect, it } from "vitest";

import {
    AUTOMATIC_CLOSE_PERIOD_LIMIT,
    evaluateBillingPeriodCloseOccurrence,
} from "@/lib/financials/billingPeriods/billingPeriodCloseHandler";
import {
    BILLING_PERIOD_CLOSE_HANDLER_KEY,
} from "@/lib/scheduledWork/scheduledWorkHandlerKeys";
import {
    registeredScheduledWorkHandlerKeys,
    resolveScheduledWorkHandler,
    __resetScheduledWorkRegistryForTests,
} from "@/lib/scheduledWork/scheduledWorkRegistry";
import type { ScheduledWorkContext } from "@/lib/scheduledWork/scheduledWorkTypes";

const ORG = "org-1";

function ctx(overrides: Partial<ScheduledWorkContext> = {}): ScheduledWorkContext {
    return {
        scheduledWorkId: "sw-1",
        occurrenceId: "occ-1",
        orgId: ORG,
        handlerKey: BILLING_PERIOD_CLOSE_HANDLER_KEY,
        dueAt: "2026-12-01T03:00:00.000Z",
        attemptNumber: 1,
        workerId: "worker-test",
        domainRef: {},
        ...overrides,
    };
}

type Seed = {
    id: string;
    customer_id: string;
    period_key: string;
    ends_on: string;
    status?: string;
    closed_at?: string | null;
    close_actor?: string | null;
    closed_by?: string | null;
};

/** The same shape-faithful fake as the close suite: a conditional UPDATE matches, or it does not. */
function makeDb(seeds: Seed[], opts: { failDiscovery?: boolean } = {}) {
    const rows = seeds.map((s) => ({
        org_id: ORG,
        cadence: "monthly",
        starts_on: "2026-11-01",
        status: "open",
        closed_at: null,
        close_actor: null,
        closed_by: null,
        ...s,
    })) as Array<Record<string, unknown>>;

    function queryFor(table: string) {
        if (table !== "financial_billing_periods") throw new Error(`unexpected table ${table}`);
        const eqs: Array<[string, unknown]> = [];
        const lts: Array<[string, unknown]> = [];
        let patch: Record<string, unknown> | null = null;
        let ordered = false;
        let cap: number | null = null;

        const matching = () =>
            rows.filter(
                (r) => eqs.every(([k, v]) => r[k] === v) && lts.every(([k, v]) => String(r[k]) < String(v)),
            );

        const api: Record<string, unknown> = {
            select: () => api,
            eq: (k: string, v: unknown) => (eqs.push([k, v]), api),
            lt: (k: string, v: unknown) => (lts.push([k, v]), api),
            order: () => ((ordered = true), api),
            limit: (n: number) => ((cap = n), api),
            update: (p: Record<string, unknown>) => ((patch = p), api),
            maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
            then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
                if (opts.failDiscovery && !patch) {
                    return resolve({ data: null, error: { message: "discovery exploded" } });
                }
                let found = matching();
                if (patch) {
                    for (const r of found) Object.assign(r, patch);
                } else if (ordered) {
                    found = [...found].sort((a, b) => String(a.ends_on).localeCompare(String(b.ends_on)));
                    if (cap != null) found = found.slice(0, cap);
                }
                return resolve({ data: found.map((r) => ({ ...r })), error: null });
            },
        };
        return api;
    }

    return { db: { from: queryFor } as never, row: (id: string) => rows.find((r) => r.id === id)! };
}

describe("the close handler is registered, and only registered code can run", () => {
    it("binds the key the database rows will name", () => {
        __resetScheduledWorkRegistryForTests();
        /* Imported lazily so resetting the registry above cannot race module evaluation. */
        return import("@/lib/scheduledWork/scheduledWorkConsumers").then((mod) => {
            mod.registerScheduledWorkConsumers();
            expect(registeredScheduledWorkHandlerKeys()).toContain(BILLING_PERIOD_CLOSE_HANDLER_KEY);
            expect(resolveScheduledWorkHandler(BILLING_PERIOD_CLOSE_HANDLER_KEY)).toBeTypeOf("function");
            /* An unregistered name resolves to nothing, so configuration cannot introduce behaviour. */
            expect(resolveScheduledWorkHandler("financials.not_a_real_handler")).toBeNull();
            __resetScheduledWorkRegistryForTests();
        });
    });
});

describe("automatic close — discovery and the system transition", () => {
    it("closes every elapsed open period, attributed to the SYSTEM and to nobody", async () => {
        const { db, row } = makeDb([
            { id: "sep", customer_id: "c1", period_key: "2026-09", ends_on: "2026-09-30" },
            { id: "oct", customer_id: "c2", period_key: "2026-10", ends_on: "2026-10-31" },
        ]);
        const outcome = await evaluateBillingPeriodCloseOccurrence(ctx(), { supabase: db, todayYmd: "2026-12-01" });

        expect(outcome.kind).toBe("completed");
        expect(outcome.diagnostic?.closed_count).toBe(2);
        for (const id of ["sep", "oct"]) {
            expect(row(id).status).toBe("closed");
            expect(row(id).close_actor).toBe("system");
            /* NEVER a fabricated human. */
            expect(row(id).closed_by).toBeNull();
        }
    });

    it("leaves a period that has NOT finished alone", async () => {
        const { db, row } = makeDb([
            { id: "nov", customer_id: "c1", period_key: "2026-11", ends_on: "2026-11-30" },
        ]);
        const outcome = await evaluateBillingPeriodCloseOccurrence(ctx(), { supabase: db, todayYmd: "2026-11-15" });
        expect(outcome.kind).toBe("completed");
        expect(outcome.reason).toContain("no billing period has finished");
        expect(row("nov").status).toBe("open");
    });

    it("a no-op is COMPLETED, not a failure — a quiet day is a healthy day", async () => {
        const { db } = makeDb([]);
        const outcome = await evaluateBillingPeriodCloseOccurrence(ctx(), { supabase: db, todayYmd: "2026-12-01" });
        expect(outcome.kind).toBe("completed");
        expect(outcome.diagnostic?.closed_count).toBe(0);
    });

    it("an occurrence with NO TENANT closes nothing", async () => {
        /*
         * `scheduled_work.org_id` is nullable and a platform-level row exists. Null means "no
         * tenant", never "every organisation" — a scheduler row must not be able to finalize the
         * commercial periods of an org nobody named.
         */
        const { db, row } = makeDb([
            { id: "sep", customer_id: "c1", period_key: "2026-09", ends_on: "2026-09-30" },
        ]);
        const outcome = await evaluateBillingPeriodCloseOccurrence(ctx({ orgId: null }), {
            supabase: db,
            todayYmd: "2026-12-01",
        });
        expect(outcome.kind).toBe("completed");
        expect(outcome.reason).toContain("no tenant");
        expect(row("sep").status).toBe("open");
    });

    it("an already-closed period is reported, not re-closed", async () => {
        const { db, row } = makeDb([
            {
                id: "sep",
                customer_id: "c1",
                period_key: "2026-09",
                ends_on: "2026-09-30",
                status: "closed",
                closed_at: "2026-10-01T00:00:00.000Z",
                close_actor: "operator",
                closed_by: "user-1",
            },
        ]);
        const outcome = await evaluateBillingPeriodCloseOccurrence(ctx(), { supabase: db, todayYmd: "2026-12-01" });
        expect(outcome.kind).toBe("completed");
        /* Discovery only looks at OPEN periods, so it is not even a candidate. */
        expect(outcome.diagnostic?.closed_count).toBe(0);
        expect(row("sep").closed_at).toBe("2026-10-01T00:00:00.000Z");
        expect(row("sep").close_actor).toBe("operator");
    });

    it("a RETRY does not close anything twice", async () => {
        const { db, row } = makeDb([
            { id: "sep", customer_id: "c1", period_key: "2026-09", ends_on: "2026-09-30" },
        ]);
        const first = await evaluateBillingPeriodCloseOccurrence(ctx({ attemptNumber: 1 }), {
            supabase: db, todayYmd: "2026-12-01",
        });
        const closedAt = row("sep").closed_at;
        const second = await evaluateBillingPeriodCloseOccurrence(ctx({ attemptNumber: 2 }), {
            supabase: db, todayYmd: "2026-12-02",
        });
        expect(first.diagnostic?.closed_count).toBe(1);
        expect(second.diagnostic?.closed_count).toBe(0);
        expect(row("sep").closed_at).toBe(closedAt);
    });

    it("discovery failure is RETRYABLE, because nothing was closed and a retry cannot double-close", async () => {
        const { db } = makeDb(
            [{ id: "sep", customer_id: "c1", period_key: "2026-09", ends_on: "2026-09-30" }],
            { failDiscovery: true },
        );
        const outcome = await evaluateBillingPeriodCloseOccurrence(ctx(), { supabase: db, todayYmd: "2026-12-01" });
        expect(outcome.kind).toBe("retryable_failure");
        expect(outcome.reason).toContain("eligible");
    });

    it("is bounded per occurrence, so a backlog drains across wakes", async () => {
        expect(AUTOMATIC_CLOSE_PERIOD_LIMIT).toBe(100);
        const { db, row } = makeDb([
            { id: "a", customer_id: "c1", period_key: "a", ends_on: "2026-01-31" },
            { id: "b", customer_id: "c2", period_key: "b", ends_on: "2026-02-28" },
            { id: "c", customer_id: "c3", period_key: "c", ends_on: "2026-03-31" },
        ]);
        const outcome = await evaluateBillingPeriodCloseOccurrence(ctx(), {
            supabase: db, todayYmd: "2026-12-01", limit: 2,
        });
        expect(outcome.diagnostic?.closed_count).toBe(2);
        /* The third is untouched and will be found on the next wake. */
        expect(row("c").status).toBe("open");
    });
});

describe("what close must NOT reach", () => {
    it("AUTOPAY never asks about a billing period, so close cannot block collection", async () => {
        /*
         * Structural, and the strongest available form: Autopay selects on `status = 'posted'`,
         * `billable_source_*` and `due_date`, then asks `resolveFamilyCollectible` for the ceiling.
         * It reads no period column anywhere, so a closed period is invisible to it by construction
         * rather than by a rule someone has to remember.
         */
        const source = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/financials/payments/autopayCollectible.ts", "utf8"),
        );
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(code).not.toContain("billing_period_id");
        expect(code).not.toContain("financial_billing_periods");
    });

    it("PAYMENT settlement never asks about a billing period either", async () => {
        const source = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/financials/childcarePaymentService.ts", "utf8"),
        );
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        /*
         * Settlement is not period mutation. If this file ever reads the period table, a payment
         * could start being refused or re-dated by finality — which is the failure Phase 15 and 16
         * exist to prevent.
         */
        expect(code).not.toContain("financial_billing_periods");
    });
});
