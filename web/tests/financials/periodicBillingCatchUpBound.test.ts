/**
 * AUTOMATIC PERIODIC BILLING — the N=2 catch-up bound, driven rather than described.
 *
 * Every lock here runs the real evaluation against a client that serves real-shaped rows, and
 * asserts what it DID: which assignment it billed, for which spans, and whether it called the
 * canonical generation authority at all. A source-text assertion would survive the defect that
 * matters most — an implementation that still says "limit 2" in a comment while quietly billing
 * two of seven — so none of these read the source.
 */
import { describe, expect, it } from "vitest";

import {
    AUTOMATIC_CATCH_UP_PERIOD_LIMIT,
    evaluatePeriodicBilling,
} from "@/lib/financials/periodicBilling/evaluatePeriodicBilling";
import { readOutstandingBillingPeriods } from "@/lib/financials/periodicBilling/readOutstandingBillingPeriods";

const ORG = "org-1";
const ASSIGNMENT = "ocm-1";
const AGREEMENT = "agr-1";

type ChargeRow = { billable_source_id: string; service_date: string };

/**
 * The narrowest client that answers what the reader asks: live terms, org policies, and the tuition
 * charges that decide convergence. Chainable because the production reads chain.
 */
function client(opts: { terms: Record<string, unknown>[]; charges: ChargeRow[]; policies?: Record<string, unknown>[] }) {
    const rowsFor = (table: string) =>
        table === "enrollment_pricing_terms" ? opts.terms
        : table === "charges" ? opts.charges
        : table === "financial_policies" ? (opts.policies ?? [])
        : [];
    return {
        from: (table: string) => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.select = self; chain.eq = self; chain.is = self; chain.in = self;
            chain.order = self; chain.lte = self; chain.gte = self; chain.not = self;
            chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rowsFor(table), error: null });
            return chain;
        },
    } as never;
}

function term(over: Partial<Record<string, unknown>> = {}) {
    return {
        id: "term-1", org_id: ORG,
        opportunity_customer_member_id: ASSIGNMENT, customer_member_id: "cm-1",
        enrollment_agreement_id: AGREEMENT, term_kind: "tuition",
        amount_cents: 20_000, currency_code: "USD", cadence_key: "monthly",
        effective_start: "2026-01-01", effective_end: null,
        source_entity: "rate_plan", source_id: "rp-1", variant_id: null, offering_id: null,
        program_key: null, location_id: null, payer_type: "family", state: "accepted",
        override_reason: null, recommended_source_id: null, config_version: null,
        resolution_key: "rk-1", accepted_by: null, accepted_at: "2026-01-01T00:00:00Z",
        superseded_at: null,
        ...over,
    };
}

/** Records what generation was asked to do, and answers as generation answers. */
function recordingGenerate() {
    const calls: { periodKey: string; cadenceKey?: string; scope?: readonly string[] | null; periodKeys?: readonly string[] | null }[] = [];
    const fn = (async (_supabase: unknown, args: { periodKey: string; cadenceKey?: string; opportunityCustomerMemberIds?: readonly string[] | null; periodKeys?: readonly string[] | null }) => {
        calls.push({ periodKey: args.periodKey, cadenceKey: args.cadenceKey, scope: args.opportunityCustomerMemberIds ?? null, periodKeys: args.periodKeys ?? null });
        return {
            periodKey: args.periodKey,
            servicePeriod: { start: `${args.periodKey}-01`, end: `${args.periodKey}-28` },
            cadenceKey: args.cadenceKey ?? "monthly",
            periodsBilled: [],
            counts: { generated: 1, unchanged: 0, notDue: 0, refused: 0, alreadyPosted: 0, errors: 0 },
            outcomes: [],
        };
    }) as never;
    return { calls, fn };
}

/** Monthly charges already written, so a period counts as converged. */
const charged = (...months: string[]): ChargeRow[] =>
    months.map((m) => ({ billable_source_id: AGREEMENT, service_date: `${m}-01` }));

async function evaluate(opts: { charges: ChargeRow[]; todayYmd: string; terms?: Record<string, unknown>[] }) {
    const gen = recordingGenerate();
    const result = await evaluatePeriodicBilling(
        client({ terms: opts.terms ?? [term()], charges: opts.charges }),
        { orgId: ORG, todayYmd: opts.todayYmd, generate: gen.fn },
    );
    return { result, calls: gen.calls, outcome: result.outcomes[0]! };
}

describe("the bound is two canonical billing periods", () => {
    it("is stated as a period count, not a duration", () => {
        expect(AUTOMATIC_CATCH_UP_PERIOD_LIMIT).toBe(2);
    });

    it("one outstanding period is ordinary automation and is billed", async () => {
        // Jan–Feb converged; March is the period containing today.
        const { outcome, calls } = await evaluate({ charges: charged("2026-01", "2026-02"), todayYmd: "2026-03-15" });
        expect(outcome.outstandingPeriods).toBe(1);
        expect(outcome.kind).toBe("normal_period_processed");
        expect(outcome.mutated).toBe(true);
        expect(calls.map((c) => c.periodKey)).toEqual(["2026-03"]);
        expect(calls[0]!.scope, "billed for this assignment only").toEqual([ASSIGNMENT]);
    });

    it("two outstanding periods are the maximum automatic recovery and both are billed", async () => {
        const { outcome, calls } = await evaluate({ charges: charged("2026-01"), todayYmd: "2026-03-15" });
        expect(outcome.outstandingPeriods).toBe(2);
        expect(outcome.kind).toBe("short_catch_up_processed");
        expect(outcome.mutated).toBe(true);
        expect(calls.map((c) => c.periodKey).sort()).toEqual(["2026-02", "2026-03"]);
    });

    it("three outstanding periods mutate NOTHING and name the operator's job", async () => {
        const { outcome, calls } = await evaluate({ charges: [], todayYmd: "2026-03-15" });
        expect(outcome.outstandingPeriods).toBe(3);
        expect(outcome.kind).toBe("catch_up_requires_operator");
        expect(outcome.mutated).toBe(false);
        expect(calls, "not the newest two, not the oldest two, not one").toEqual([]);
        expect(outcome.oldestOutstandingPeriod).toBe("2026-01");
        expect(outcome.newestOutstandingPeriod).toBe("2026-03");
        expect(outcome.operatorAction).toMatch(/Generate Tuition/);
    });

    it("twelve outstanding periods mutate NOTHING either", async () => {
        const { outcome, calls } = await evaluate({ charges: [], todayYmd: "2026-12-15" });
        expect(outcome.outstandingPeriods).toBe(12);
        expect(outcome.kind).toBe("catch_up_requires_operator");
        expect(calls).toEqual([]);
        expect(outcome.oldestOutstandingPeriod).toBe("2026-01");
        expect(outcome.newestOutstandingPeriod).toBe("2026-12");
    });
});

describe("the backlog cannot be drained", () => {
    /**
     * THE DEFECT THIS EXISTS TO CATCH: bill two of seven, and the next wake sees five, bills two,
     * sees three, bills two — unlimited catch-up arriving one wake at a time. Because an over-bound
     * assignment is left entirely untouched, the outstanding set never shrinks, so every wake
     * reaches the same conclusion. The absence of mutation is what remembers.
     */
    it("repeated wakes over the same over-bound backlog bill nothing, every time", async () => {
        const charges: ChargeRow[] = [];
        const seen: number[] = [];
        for (let wake = 0; wake < 4; wake += 1) {
            const { outcome, calls } = await evaluate({ charges, todayYmd: "2026-07-15" });
            seen.push(outcome.outstandingPeriods);
            expect(calls, `wake ${wake + 1} billed something`).toEqual([]);
            expect(outcome.kind).toBe("catch_up_requires_operator");
        }
        expect(seen, "the outstanding set never shrank across wakes").toEqual([7, 7, 7, 7]);
    });

    it("a retry of the same evaluation is the same episode, not a fresh allowance", async () => {
        // Attempt 1 bills the two outstanding periods; the charges it wrote are now visible.
        const first = await evaluate({ charges: charged("2026-01"), todayYmd: "2026-03-15" });
        expect(first.outcome.kind).toBe("short_catch_up_processed");
        // Attempt 2 re-reads canonical truth and finds nothing left to do.
        const retry = await evaluate({ charges: charged("2026-01", "2026-02", "2026-03"), todayYmd: "2026-03-15" });
        expect(retry.outcome.kind).toBe("no_work_due");
        expect(retry.outcome.mutated).toBe(false);
        expect(retry.calls).toEqual([]);
    });

    it("a retry of an over-bound refusal still refuses — attempts are not the unit", async () => {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            const { outcome, calls } = await evaluate({ charges: [], todayYmd: "2026-05-15" });
            expect(outcome.kind).toBe("catch_up_requires_operator");
            expect(calls, `attempt ${attempt} billed something`).toEqual([]);
        }
    });
});

describe("outstanding truth is complete, and is counted in periods", () => {
    it("knows the whole outstanding set, not merely the bound's worth", async () => {
        const truth = await readOutstandingBillingPeriods(
            client({ terms: [term()], charges: [] }),
            { orgId: ORG, todayYmd: "2026-07-15" },
        );
        // Seven outstanding, reported as seven — never truncated to two.
        expect(truth.assignments[0]!.outstanding).toHaveLength(7);
        expect(truth.assignments[0]!.outstanding.map((p) => p.periodKey))
            .toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
    });

    it("counts weekly periods as canonical weekly periods from the agreement anchor", async () => {
        const weekly = term({ cadence_key: "weekly", effective_start: "2026-03-04", amount_cents: 18_500 });
        const truth = await readOutstandingBillingPeriods(
            client({ terms: [weekly], charges: [] }),
            { orgId: ORG, todayYmd: "2026-03-17" },
        );
        const periods = truth.assignments[0]!.outstanding;
        // Anchored on the 4th — Wed-to-Tue weeks, not calendar weeks.
        expect(periods.map((p) => p.start)).toEqual(["2026-03-04", "2026-03-11"]);
        expect(periods[0]!.end).toBe("2026-03-10");
        expect(periods[0]!.periodKey).toContain("~");
    });

    it("a weekly assignment two weeks behind is a SHORT catch-up, not a four-period backlog", async () => {
        const weekly = term({ cadence_key: "weekly", effective_start: "2026-03-04" });
        const gen = recordingGenerate();
        const result = await evaluatePeriodicBilling(
            client({ terms: [weekly], charges: [] }),
            { orgId: ORG, todayYmd: "2026-03-17", generate: gen.fn },
        );
        expect(result.outcomes[0]!.outstandingPeriods).toBe(2);
        expect(result.outcomes[0]!.kind).toBe("short_catch_up_processed");
    });

    it("charge count never substitutes for period count", async () => {
        /*
         * One weekly period can produce one charge; one monthly span can produce several. The
         * bound is periods, so an assignment one period behind is ordinary automation no matter
         * how many charge rows that period turns into.
         */
        const { outcome } = await evaluate({ charges: charged("2026-01", "2026-02"), todayYmd: "2026-03-15" });
        expect(outcome.outstandingPeriods).toBe(1);
        expect(outcome.kind).toBe("normal_period_processed");
        // The figure the bound was applied to is the period count, and it is reported as such.
        expect(outcome.automaticCatchUpLimit).toBe(2);
    });
});

describe("manual convergence and automation are one authority", () => {
    it("periods an operator converged are no longer outstanding", async () => {
        const before = await evaluate({ charges: [], todayYmd: "2026-04-15" });
        expect(before.outcome.outstandingPeriods).toBe(4);
        expect(before.outcome.kind).toBe("catch_up_requires_operator");

        // The operator converges the three oldest through Generate Tuition.
        const after = await evaluate({ charges: charged("2026-01", "2026-02", "2026-03"), todayYmd: "2026-04-15" });
        expect(after.outcome.outstandingPeriods).toBe(1);
        expect(after.outcome.kind, "automation resumes once the set is within the bound").toBe("normal_period_processed");
        expect(after.calls.map((c) => c.periodKey)).toEqual(["2026-04"]);
    });

    it("a fully converged assignment is answered as no work, and nothing is billed again", async () => {
        const { outcome, calls } = await evaluate({
            charges: charged("2026-01", "2026-02", "2026-03"),
            todayYmd: "2026-03-15",
        });
        expect(outcome.kind).toBe("no_work_due");
        expect(calls).toEqual([]);
    });
});

describe("nothing is hidden and nothing is inferred", () => {
    it("a refused backlog reports every period it did not bill", async () => {
        const { outcome } = await evaluate({ charges: [], todayYmd: "2026-06-15" });
        expect(outcome.outstandingPeriods).toBe(6);
        expect(outcome.detail).toContain("6 canonical billing periods");
        expect(outcome.detail).toContain("2026-01");
        expect(outcome.detail).toContain("2026-06");
        expect(outcome.mutated, "no high-water mark, no periods marked handled").toBe(false);
        expect(outcome.periodsProcessed).toEqual([]);
    });

    it("a cadence with no interval has no outstanding periods and bills nothing", async () => {
        const { outcome, calls } = await evaluate({
            charges: [], todayYmd: "2026-06-15",
            terms: [term({ cadence_key: "hourly" })],
        });
        expect(outcome.outstandingPeriods).toBe(0);
        expect(outcome.kind).toBe("no_work_due");
        expect(calls).toEqual([]);
    });

    it("periods before the term was effective are never outstanding", async () => {
        const { outcome } = await evaluate({
            charges: [], todayYmd: "2026-03-15",
            terms: [term({ effective_start: "2026-03-01" })],
        });
        expect(outcome.outstandingPeriods).toBe(1);
        expect(outcome.oldestOutstandingPeriod).toBe("2026-03");
    });
});

describe("the deployed fixture, evaluated against the doctrine", () => {
    /**
     * THE ACTIVATION PICTURE, from MEASURED inputs.
     *
     * The per-assignment census on deployed staging (certification/financials/periodic-billing/
     * per-assignment-census.json) measured, for the September span: Certa 5 unconverged weekly
     * periods at $185.00, Certb 1 unconverged monthly period at $1,450.00, and nothing at all in
     * July or August. Both terms are effective 2026-09-01.
     *
     * The span preview enumerates every period that OVERLAPS September, including ones that have
     * not started. Automation only ever considers periods that have begun, which is the difference
     * between "what would a run for September create" and "what is due today" — so the question
     * this answers is what the doctrine does with those inputs on 2026-09-21.
     */
    const SEPT_TERM = { effective_start: "2026-09-01" };

    it("Certb — one monthly period due, which is ordinary automation", async () => {
        const { outcome, calls } = await evaluate({
            charges: [], todayYmd: "2026-09-21",
            terms: [term({ ...SEPT_TERM, cadence_key: "monthly", amount_cents: 145_000 })],
        });
        expect(outcome.outstandingPeriods).toBe(1);
        expect(outcome.kind).toBe("normal_period_processed");
        expect(calls.map((c) => c.periodKey)).toEqual(["2026-09"]);
    });

    it("Certa — three weekly periods have begun, which is over the bound and bills nothing", async () => {
        /*
         * Five weekly periods overlap September; three of them had started by the 21st
         * (Sep 1-7, 8-14, 15-21). Three exceeds two, so automation refuses ALL of them and the
         * operator converges them — which is the bound doing precisely the job it was set for, on
         * the very first tenant, rather than a rule that never fires.
         */
        const { outcome, calls } = await evaluate({
            charges: [], todayYmd: "2026-09-21",
            terms: [term({ ...SEPT_TERM, cadence_key: "weekly", amount_cents: 18_500 })],
        });
        expect(outcome.outstandingPeriods).toBe(3);
        expect(outcome.kind).toBe("catch_up_requires_operator");
        expect(outcome.mutated).toBe(false);
        expect(calls).toEqual([]);
        expect(outcome.oldestOutstandingPeriod).toBe("2026-09-01~2026-09-07");
        expect(outcome.newestOutstandingPeriod).toBe("2026-09-15~2026-09-21");
    });

    it("and a period that has not begun is never counted as due", async () => {
        const { outcome } = await evaluate({
            charges: [], todayYmd: "2026-09-21",
            terms: [term({ ...SEPT_TERM, cadence_key: "weekly", amount_cents: 18_500 })],
        });
        // Sep 22-28 and Sep 29-Oct 5 overlap the span the preview enumerates; neither is due.
        expect(outcome.newestOutstandingPeriod).not.toContain("2026-09-22");
        expect(outcome.outstandingPeriods).toBeLessThan(5);
    });
});

describe("automation bills the periods it decided were due, and no others", () => {
    /**
     * MEASURED ON DEPLOYED STAGING, and this is the lock that was missing.
     *
     * The handler asks generation for the month SPAN containing each outstanding period, and a
     * span contains periods that have not begun. A one-period specimen was billed for 2026-09-22
     * AND 2026-09-29; a two-period one received three charges. The outstanding count was right,
     * the refusal threshold was right, and the mutation was still larger than the set the bound
     * had been computed on — which is the bound not holding.
     *
     * The earlier locks could not catch it: the recording generate() asserted WHICH SPANS were
     * requested, and the spans were correct. What was never asserted is that the request carried
     * the due period keys, so generation could not wander past them.
     */
    it("passes the exact due period keys, not just the span", async () => {
        const { outcome, calls } = await evaluate({ charges: charged("2026-01"), todayYmd: "2026-03-15" });
        expect(outcome.outstandingPeriods).toBe(2);
        /*
         * TWO CALLS IS CORRECT, and asserting one was my mistake: February and March are different
         * month spans, so the span loop legitimately asks twice. What matters is that EVERY
         * request carries the due keys, so neither span can bill beyond them.
         */
        expect(calls.map((c) => c.periodKey).sort()).toEqual(["2026-02", "2026-03"]);
        for (const call of calls) {
            expect(call.periodKeys, "every request names the due periods").toEqual(["2026-02", "2026-03"]);
        }
    });

    it("a single due period is billed as a single period", async () => {
        const { outcome, calls } = await evaluate({ charges: charged("2026-01", "2026-02"), todayYmd: "2026-03-15" });
        expect(outcome.outstandingPeriods).toBe(1);
        expect(calls[0]!.periodKeys).toEqual(["2026-03"]);
    });

    it("a weekly specimen never carries a period that has not begun", async () => {
        /* The deployed shape: weekly anchored 2026-09-22, evaluated on 2026-09-22. */
        const { outcome, calls } = await evaluate({
            charges: [], todayYmd: "2026-09-22",
            terms: [term({ cadence_key: "weekly", effective_start: "2026-09-22", amount_cents: 19_500 })],
        });
        expect(outcome.outstandingPeriods).toBe(1);
        expect(calls[0]!.periodKeys).toEqual(["2026-09-22~2026-09-28"]);
        expect(calls[0]!.periodKeys, "2026-09-29 had not begun")
            .not.toContain("2026-09-29~2026-10-05");
    });
});
