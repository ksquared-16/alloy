/**
 * W7-F001 — THE OTHER HALF OF THE LIFECYCLE: THE DAY THE PERIOD BEGINS.
 *
 * A gate that makes a charge a draft and nothing that ever clears it is the defect from the other
 * direction — ordinary billing waiting on a manual posting step no business rule asked for, which is
 * precisely what the Director's walkthrough found. These cases prove the clock clears it, and prove
 * the two properties that make that safe:
 *
 *   * a `posting_review` boundary configured AFTER the charge was written still binds. The
 *     activation path must not become a way for a future-dated charge to escape a control the
 *     organisation has since put in place.
 *   * the candidate query is allowed to be approximate, because the authority re-decides. A label
 *     that says the wait is over does not make it over.
 *
 * The handler is driven with a shape-faithful fake and a fixed business date, and it reaches the
 * REAL `autoPostGeneratedCharge` and the REAL `postChildcareCharge` underneath — a stub there would
 * prove only that the handler asked something.
 */
import { describe, expect, it } from "vitest";

import {
    evaluateFuturePeriodActivationOccurrence,
    findActivatableFuturePeriodCharges,
} from "@/lib/financials/posting/futurePeriodActivation";
import { FUTURE_PERIOD_ACTIVATION_HANDLER_KEY } from "@/lib/scheduledWork/scheduledWorkHandlerKeys";
import type { ScheduledWorkContext } from "@/lib/scheduledWork/scheduledWorkTypes";

const ORG = "org-1";

function ctx(overrides: Partial<ScheduledWorkContext> = {}): ScheduledWorkContext {
    return {
        scheduledWorkId: "sw-1",
        occurrenceId: "occ-1",
        orgId: ORG,
        handlerKey: FUTURE_PERIOD_ACTIVATION_HANDLER_KEY,
        dueAt: "2026-11-01T11:30:00.000Z",
        attemptNumber: 1,
        workerId: "worker-test",
        domainRef: {},
        ...overrides,
    };
}

type Row = Record<string, unknown>;

/**
 * Tables, filters and conditional updates — the three things that decide these outcomes.
 *
 * `metadata->>key` filters are evaluated against the row's own jsonb, because that is the whole
 * mechanism the candidate query runs on; faking it as a plain column would make the test pass with
 * a query that returns nothing in production.
 */
function makeDb(seed: { charges: Row[]; periods: Row[]; policies?: Row[]; obligations?: Row[] }) {
    const tables: Record<string, Row[]> = {
        charges: seed.charges.map((c) => ({ ...c })),
        financial_billing_periods: seed.periods.map((p) => ({ ...p })),
        financial_policies: (seed.policies ?? []).map((p) => ({ ...p })),
        resolved_obligations: (seed.obligations ?? []).map((o) => ({ ...o })),
        org_settings: [],
    };

    function read(row: Row, col: string): unknown {
        const arrow = col.indexOf("->>");
        if (arrow === -1) return row[col];
        const base = col.slice(0, arrow);
        const key = col.slice(arrow + 3);
        const obj = (row[base] ?? {}) as Record<string, unknown>;
        const v = obj[key];
        return v == null ? null : String(v);
    }

    function builder(table: string) {
        const rows = tables[table];
        if (!rows) throw new Error(`unexpected table ${table}`);
        const eqs: Array<[string, unknown]> = [];
        const ins: Array<[string, unknown[]]> = [];
        const ltes: Array<[string, unknown]> = [];
        let patch: Row | null = null;
        let limit = Infinity;

        const matching = (): Row[] =>
            rows.filter(
                (r) =>
                    eqs.every(([c, v]) => (c === "org_id" ? v === ORG : read(r, c) === v))
                    && ins.every(([c, vs]) => vs.includes(read(r, c) as never))
                    && ltes.every(([c, v]) => {
                        const got = read(r, c);
                        return got != null && String(got) <= String(v);
                    }),
            );

        const apply = (): Row[] => {
            const hit = matching();
            if (patch) for (const r of hit) Object.assign(r, patch);
            return hit;
        };

        const api: Record<string, unknown> = {
            select: () => api,
            update: (p: Row) => { patch = p; return api; },
            eq: (c: string, v: unknown) => { eqs.push([c, v]); return api; },
            in: (c: string, v: unknown[]) => { ins.push([c, v]); return api; },
            lte: (c: string, v: unknown) => { ltes.push([c, v]); return api; },
            order: () => api,
            limit: (n: number) => { limit = n; return api; },
            maybeSingle: async () => {
                const hit = apply();
                return { data: hit.length ? { ...hit[0] } : null, error: null };
            },
            single: async () => (api.maybeSingle as () => Promise<unknown>)(),
        };
        (api as { then?: unknown }).then = (resolve: (v: unknown) => unknown) => {
            const hit = apply();
            return Promise.resolve(
                resolve({ data: hit.slice(0, limit).map((r) => ({ ...r })), error: null }),
            );
        };
        return api;
    }

    return { client: { from: (t: string) => builder(t) } as never, tables };
}

function waitingDraft(id: string, postsOn: string, periodId: string): Row {
    return {
        id,
        org_id: ORG,
        job_id: null,
        source_charge_id: null,
        billable_source_type: "customer",
        billable_source_id: "cust-1",
        charge_type: "fee",
        charge_category: "one_time",
        status: "draft",
        currency_code: "USD",
        amount_cents: 4000,
        service_date: postsOn,
        due_date: null,
        posted_at: null,
        voided_at: null,
        description: "tuition",
        metadata: { source: "charge_template", post_gate: "period_not_started", post_not_before: postsOn },
        created_at: "2026-10-02T00:00:00.000Z",
        updated_at: null,
        created_by: "user-1",
        updated_by: null,
        posted_by: null,
        billing_period_id: periodId,
        legacy_billing_period_key: null,
        billing_period_generation: "canonical",
        service_id: null,
    };
}

describe("findActivatableFuturePeriodCharges", () => {
    it("offers only drafts whose recorded wait is over", async () => {
        const db = makeDb({
            charges: [
                waitingDraft("ready", "2026-11-01", "bp-nov"),
                waitingDraft("not-yet", "2026-12-01", "bp-dec"),
                { ...waitingDraft("posted-already", "2026-11-01", "bp-nov"), status: "posted" },
                /* A draft held for review is NOT a candidate: its gate is a different one. */
                {
                    ...waitingDraft("in-review", "2026-11-01", "bp-nov"),
                    metadata: { post_gate: "review_required" },
                },
                /* And neither is a historical draft with no gate recorded at all. */
                { ...waitingDraft("historical", "2026-11-01", "bp-nov"), metadata: {} },
            ],
            periods: [],
        });
        const found = await findActivatableFuturePeriodCharges(db.client, {
            orgId: ORG, todayYmd: "2026-11-01",
        });
        expect(found.map((f) => f.id)).toEqual(["ready"]);
    });
});

describe("evaluateFuturePeriodActivationOccurrence", () => {
    const novOpen = { id: "bp-nov", org_id: ORG, period_key: "2026-11", status: "open", starts_on: "2026-11-01" };

    it("posts a draft whose period has begun, through the real authority", async () => {
        const db = makeDb({ charges: [waitingDraft("chg-1", "2026-11-01", "bp-nov")], periods: [novOpen] });
        const outcome = await evaluateFuturePeriodActivationOccurrence(ctx(), {
            supabase: db.client, todayYmd: "2026-11-01",
        });
        expect(outcome.kind).toBe("completed");
        expect(outcome.reason).toContain("posted 1 charge");
        const charge = db.tables.charges[0];
        expect(charge.status).toBe("posted");
        /* The waiting label goes with the gate it explained; a posted charge is not "waiting". */
        const metadata = charge.metadata as Record<string, unknown>;
        expect(metadata.post_gate).toBeUndefined();
        expect(metadata.post_not_before).toBeUndefined();
    });

    it("attributes the post to nobody, because the clock did it", async () => {
        const db = makeDb({ charges: [waitingDraft("chg-1", "2026-11-01", "bp-nov")], periods: [novOpen] });
        await evaluateFuturePeriodActivationOccurrence(ctx(), { supabase: db.client, todayYmd: "2026-11-01" });
        const charge = db.tables.charges[0];
        expect(charge.posted_by).toBeNull();
        /* The author of the charge is still recorded. Activation does not rewrite authorship. */
        expect(charge.created_by).toBe("user-1");
    });

    it("HOLDS a charge when a review boundary was configured after the draft was written", async () => {
        const db = makeDb({
            charges: [waitingDraft("chg-1", "2026-11-01", "bp-nov")],
            periods: [novOpen],
            policies: [
                {
                    id: "pol-1",
                    org_id: ORG,
                    policy_type: "posting_review",
                    scope_type: "org",
                    is_active: true,
                    value: { required: true },
                    effective_start: "2026-10-15",
                    effective_end: null,
                },
            ],
        });
        const outcome = await evaluateFuturePeriodActivationOccurrence(ctx(), {
            supabase: db.client, todayYmd: "2026-11-01",
        });
        expect(outcome.reason).toContain("held for review");
        const charge = db.tables.charges[0];
        expect(charge.status).toBe("draft");
        expect((charge.metadata as Record<string, unknown>).post_gate).toBe("review_required");
    });

    it("does not post into a period that closed while the draft waited", async () => {
        const db = makeDb({
            charges: [waitingDraft("chg-1", "2026-11-01", "bp-nov")],
            periods: [{ ...novOpen, status: "closed" }],
        });
        const outcome = await evaluateFuturePeriodActivationOccurrence(ctx(), {
            supabase: db.client, todayYmd: "2026-11-05",
        });
        expect(db.tables.charges[0].status).toBe("draft");
        expect(outcome.reason).toContain("failed");
    });

    it("re-labels and reports a charge the authority says is still waiting", async () => {
        /* The candidate query read a label; the authority reads the period. The authority wins. */
        const db = makeDb({
            charges: [waitingDraft("chg-1", "2026-11-01", "bp-nov")],
            periods: [{ ...novOpen, starts_on: "2026-12-01", period_key: "2026-12" }],
        });
        const outcome = await evaluateFuturePeriodActivationOccurrence(ctx(), {
            supabase: db.client, todayYmd: "2026-11-01",
        });
        expect(outcome.kind).toBe("completed");
        expect(outcome.reason).toContain("still waiting");
        const metadata = db.tables.charges[0].metadata as Record<string, unknown>;
        expect(metadata.post_not_before).toBe("2026-12-01");
    });

    it("a quiet day is a success, not a failure", async () => {
        const db = makeDb({ charges: [], periods: [] });
        const outcome = await evaluateFuturePeriodActivationOccurrence(ctx(), {
            supabase: db.client, todayYmd: "2026-11-01",
        });
        expect(outcome.kind).toBe("completed");
        expect(outcome.reason).toContain("no draft is waiting");
    });

    it("an occurrence with no tenant activates nothing", async () => {
        /* `scheduled_work.org_id` is nullable and null means "no tenant", never "every org". A
         * scheduler row must not be able to post one organisation's charges on behalf of all. */
        const db = makeDb({ charges: [waitingDraft("chg-1", "2026-11-01", "bp-nov")], periods: [novOpen] });
        const outcome = await evaluateFuturePeriodActivationOccurrence(ctx({ orgId: null }), {
            supabase: db.client, todayYmd: "2026-11-01",
        });
        expect(outcome.kind).toBe("completed");
        expect(outcome.reason).toContain("no tenant");
        expect(db.tables.charges[0].status).toBe("draft");
    });
});
