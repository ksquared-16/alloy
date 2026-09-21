/**
 * AUTOPAY, AT THE MOMENT OF TRUTH.
 *
 * The scheduler has woken, the occurrence is claimed, and this handler decides whether a family's
 * card is charged. Everything worth testing here is a decision that either takes money that should
 * not be taken, or fails to take money that should.
 *
 * ── THE RULE THAT SHAPES EVERY CASE BELOW ──
 *
 * A DOMAIN REFUSAL IS `completed`. Nothing due, over the ceiling, paused, dead card — all of these
 * are the handler working correctly. If any of them returned `retryable_failure`, the generic
 * runtime would retry a MONEY decision on infrastructure cadence, and the operator's failure
 * surface would fill with healthy days. Several cases assert the outcome KIND for that reason
 * alone, and they are not redundant with asserting that no collection happened.
 */
import { describe, expect, it, vi } from "vitest";

import {
    businessDaysBetween,
    evaluateAutopayOccurrence,
    retryAdmission,
    AUTOPAY_MAX_RETRIES,
} from "@/lib/financials/payments/autopayHandler";
import type { AutopayArrangement } from "@/lib/financials/payments/autopayArrangement";
import type { ScheduledWorkContext } from "@/lib/scheduledWork/scheduledWorkTypes";

const ORG = "org-1";
const CUSTOMER = "cust-1";
const PAYER = "person-1";
const METHOD = "pm-1";
const ARRANGEMENT = "aa-1";

type Row = Record<string, unknown>;

const arrangementRow = (over: Row = {}): Row => ({
    id: ARRANGEMENT,
    org_id: ORG,
    customer_id: CUSTOMER,
    payer_entity_type: "person",
    payer_entity_id: PAYER,
    payment_method_id: METHOD,
    status: "active",
    authorized_by: "user-1",
    authorized_at: "2026-09-01T00:00:00.000Z",
    authorization_ref: "mandate-1",
    effective_from: "2026-09-01",
    effective_to: null,
    amount_policy: "amount_due",
    max_amount_cents: null,
    timing_policy: "on_due_date",
    timing_offset_days: 0,
    retry_policy: "standard_v1",
    failure_count: 0,
    last_attempt_at: null,
    last_failure_reason: null,
    revoked_at: null,
    metadata: {},
    ...over,
});

const methodRow = (over: Row = {}): Row => ({
    id: METHOD, org_id: ORG, customer_id: CUSTOMER, payer_entity_id: PAYER,
    usability_state: "usable", rail: "card", ...over,
});

const merchantRow = (over: Row = {}): Row => ({
    org_id: ORG, readiness: "ready", ach_readiness: "ready", is_active: true, ...over,
});

/**
 * A store serving only the four tables the handler reads, and recording what it wrote.
 *
 * It deliberately does NOT implement the immutability or transition triggers: those are database
 * guarantees, proved against the real database by the migration's own self-test. A fake that
 * re-implemented them would be the test agreeing with itself.
 */
function store(opts: { arrangement?: Row | null; method?: Row | null; merchant?: Row | null } = {}) {
    const tables: Record<string, Row[]> = {
        payment_autopay_arrangements: opts.arrangement === null ? [] : [opts.arrangement ?? arrangementRow()],
        payment_methods: opts.method === null ? [] : [opts.method ?? methodRow()],
        payment_provider_merchants: opts.merchant === null ? [] : [opts.merchant ?? merchantRow()],
    };
    const updates: Array<{ table: string; patch: Row }> = [];

    /*
     * STRICT ON PURPOSE (W4 boundary).
     *
     * An unexpected table is an error rather than an empty result, which is what makes "Autopay
     * never touches held money" a PROVEN claim instead of a stated one: if the handler ever read or
     * wrote `payment_holds`, `payment_hold_dispositions` or `payments`, every case below would fail
     * loudly rather than quietly returning nothing and passing.
     */
    const ALLOWED = new Set([
        "payment_autopay_arrangements",
        "payment_methods",
        "payment_provider_merchants",
        "scheduled_work",
    ]);

    const touched = new Set<string>();

    const client = {
        from(table: string) {
            if (!ALLOWED.has(table)) throw new Error(`autopay must not touch ${table}`);
            touched.add(table);
            const filters: Array<(r: Row) => boolean> = [];
            let kind: "select" | "update" = "select";
            let patch: Row = {};
            const self: Record<string, unknown> = {};
            self.select = () => self;
            self.order = () => self;
            self.limit = () => self;
            self.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return self; };
            self.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return self; };
            self.update = (v: Row) => { kind = "update"; patch = v; return self; };

            const settle = async () => {
                const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
                if (kind === "update") {
                    updates.push({ table, patch });
                    for (const r of rows) Object.assign(r, patch);
                }
                return { data: rows[0] ?? null, error: null };
            };
            self.maybeSingle = settle;
            /*
             * The real client is a thenable: a write with no `.maybeSingle()` executes when it is
             * awaited. `recordAutopayAttempt` is exactly that shape, and a fake that only ran on
             * `maybeSingle` silently dropped it — which read as the handler failing to count a
             * failed collection when in fact it had.
             */
            self.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => settle().then(res, rej);
            return self;
        },
    };
    return { client: client as never, updates, tables, touched };
}

const ctx = (over: Partial<ScheduledWorkContext> = {}): ScheduledWorkContext => ({
    scheduledWorkId: "sw-1",
    occurrenceId: "occ-1",
    orgId: ORG,
    handlerKey: "payments.autopay.evaluate",
    dueAt: "2026-10-01T00:00:00.000Z",
    attemptNumber: 1,
    workerId: "worker-1",
    domainRef: { arrangement_id: ARRANGEMENT },
    ...over,
});

const NOW = () => new Date("2026-10-01T12:00:00.000Z");

const collectibleOf = (charges: Array<{ chargeId: string; outstandingCents: number; dueDate?: string }>) =>
    vi.fn(async () => ({
        charges: charges.map((c) => ({ chargeId: c.chargeId, dueDate: c.dueDate ?? "2026-10-01", outstandingCents: c.outstandingCents })),
        totalCents: charges.reduce((s, c) => s + c.outstandingCents, 0),
        nextDueDate: null,
    })) as never;

const collectorOk = () =>
    vi.fn(async (_s: unknown, input: { chargeId: string; requestedAmountCents: number }) => ({
        ok: true as const,
        attemptId: `att-${input.chargeId}`,
        providerTransactionId: "pi_1",
        clientSecret: "cs_1",
        connectedAccountRef: "acct_1",
        amountCents: input.requestedAmountCents,
        currency: "USD",
        reused: false,
        paymentMethodId: METHOD,
    })) as never;

describe("nothing is collected unless every authority still says yes", () => {
    it("collects exactly what is currently due, as an ordinary W3 attempt", async () => {
        const s = store();
        const collect = collectorOk();
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });

        expect(out.kind).toBe("completed");
        expect(out.diagnostic?.collected).toBe(true);
        expect(out.diagnostic?.total_cents).toBe(50_000);

        // The attempt is an ORDINARY collection: the payer, the canonical method and the rail all
        // travel with it. No autopay-specific writer, no autopay-specific provider path.
        const call = (collect as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1] as Record<string, unknown>;
        expect(call.chargeId).toBe("chg-1");
        expect(call.requestedAmountCents).toBe(50_000);
        expect(call.paymentMethodId).toBe(METHOD);
        expect(call.payerPersonId).toBe(PAYER);
        expect(call.rail).toBe("card");
    });

    /*
     * THE CASE THAT PROVES THERE IS NO SHADOW BALANCE.
     *
     * An operator recorded a cheque between the occurrence being scheduled and this moment. The
     * collectible is re-read here, finds zero, and nothing is charged.
     */
    it("collects nothing when the family already paid, and calls that a success", async () => {
        const s = store();
        const collect = collectorOk();
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect, resolveCollectible: collectibleOf([]),
        });

        expect(out.kind, "a healthy no-op is not a failure").toBe("completed");
        expect(out.diagnostic?.no_collection_reason).toBe("nothing_due");
        expect((collect as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    });

    /*
     * THE CEILING IS A REFUSAL, NOT A CAP. Collecting the authorized maximum against a larger
     * balance would be Alloy inventing a payment plan the payer never agreed to.
     */
    it("refuses entirely when the amount due exceeds the authorization, and never collects the maximum", async () => {
        const s = store({ arrangement: arrangementRow({ max_amount_cents: 30_000 }) });
        const collect = collectorOk();
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });

        expect(out.kind).toBe("completed");
        expect(out.diagnostic?.no_collection_reason).toBe("exceeds_authorized_maximum");
        expect(out.diagnostic?.collectible_cents).toBe(50_000);
        expect((collect as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    });

    it("collects when the amount due is exactly the authorized maximum", async () => {
        const s = store({ arrangement: arrangementRow({ max_amount_cents: 50_000 }) });
        const collect = collectorOk();
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.collected).toBe(true);
    });
});

describe("the authorization itself is revalidated at execution", () => {
    it("collects nothing while paused, and keeps the schedule alive", async () => {
        const s = store({ arrangement: arrangementRow({ status: "paused" }) });
        const collect = collectorOk();
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.no_collection_reason).toBe("arrangement_paused");
        expect((collect as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
        // A pause is temporary, so the schedule must NOT be wound down.
        expect(out.nextDueAt).toBeUndefined();
    });

    it("collects nothing once revoked, and winds the schedule down for good", async () => {
        const s = store({ arrangement: arrangementRow({ status: "revoked", revoked_at: "2026-09-20T00:00:00Z" }) });
        const collect = collectorOk();
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.no_collection_reason).toBe("arrangement_revoked");
        expect(out.nextDueAt, "a withdrawn authorization never wakes again").toBeNull();
        expect((collect as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    });

    it("collects nothing before the effective period begins", async () => {
        const s = store({ arrangement: arrangementRow({ effective_from: "2026-11-01" }) });
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect: collectorOk(),
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.no_collection_reason).toBe("outside_effective_period");
    });

    it("stops for good once the effective period has ended", async () => {
        const s = store({ arrangement: arrangementRow({ effective_to: "2026-09-30" }) });
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect: collectorOk(),
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.no_collection_reason).toBe("outside_effective_period");
        expect(out.nextDueAt).toBeNull();
    });
});

describe("the instrument and the merchant", () => {
    /*
     * A dead method FAILS the arrangement rather than skipping a cycle. Leaving it active would
     * mean the surface says "Autopay on" while every wake quietly refuses.
     */
    it("fails the arrangement when the authorized method is no longer usable, and never falls back", async () => {
        const s = store({ method: methodRow({ usability_state: "revoked" }) });
        const collect = collectorOk();
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });

        expect(out.diagnostic?.no_collection_reason).toBe("method_unusable");
        expect(out.nextDueAt).toBeNull();
        expect((collect as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
        expect(s.updates.some((u) => u.table === "payment_autopay_arrangements" && u.patch.status === "failed")).toBe(true);
    });

    it("treats a missing method the same as an unusable one", async () => {
        const s = store({ method: null });
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect: collectorOk(),
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.no_collection_reason).toBe("method_unusable");
    });

    /*
     * A merchant problem is the ORGANISATION's, not the family's, so the arrangement survives and
     * tries again — the opposite of the dead-method case above.
     */
    it("collects nothing when the merchant is not ready, and leaves the arrangement live", async () => {
        const s = store({ merchant: merchantRow({ readiness: "restricted" }) });
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect: collectorOk(),
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.no_collection_reason).toBe("merchant_not_ready");
        expect(out.nextDueAt).toBeUndefined();
        expect(s.updates.some((u) => u.patch.status === "failed")).toBe(false);
    });

    it("refuses an ACH collection when only cards are enabled for the merchant", async () => {
        const s = store({
            method: methodRow({ rail: "ach" }),
            merchant: merchantRow({ ach_readiness: "not_enabled" }),
        });
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect: collectorOk(),
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.no_collection_reason).toBe("merchant_not_ready");
        expect(out.diagnostic?.rail).toBe("ach");
    });
});

describe("a refused collection is a PAYMENT failure, never an infrastructure one", () => {
    it("counts the failure against Payments' own budget and still reports a completed run", async () => {
        const s = store();
        const collect = vi.fn(async () => ({ ok: false as const, reason: "method_unavailable_at_provider", message: "declined" })) as never;
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });

        expect(out.kind, "the generic runtime must not retry a declined card in 60 seconds").toBe("completed");
        expect(out.diagnostic?.collected).toBe(false);
        expect(out.diagnostic?.no_collection_reason).toBe("collection_refused");
        const bump = s.updates.find((u) => u.patch.failure_count !== undefined);
        expect(bump?.patch.failure_count).toBe(1);
    });
});

describe("Payments' own retry policy is bounded three separate ways", () => {
    const base = (over: Partial<AutopayArrangement>): AutopayArrangement => ({
        id: ARRANGEMENT, orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER,
        paymentMethodId: METHOD, status: "active", authorizedBy: "u", authorizedAt: "2026-09-01T00:00:00Z",
        authorizationRef: null, effectiveFrom: "2026-09-01", effectiveTo: null, amountPolicy: "amount_due",
        maxAmountCents: null, timingPolicy: "on_due_date", timingOffsetDays: 0, retryPolicy: "standard_v1",
        failureCount: 0, lastAttemptAt: null, lastFailureReason: null, revokedAt: null, metadata: {}, ...over,
    });

    it("allows a first attempt and the two retries the policy grants", () => {
        expect(retryAdmission(base({ failureCount: 0 }), "card", "2026-10-01").allowed).toBe(true);
        expect(retryAdmission(base({ failureCount: AUTOPAY_MAX_RETRIES }), "card", "2026-10-01").allowed).toBe(true);
    });

    it("stops after the second retry rather than charging indefinitely", () => {
        const verdict = retryAdmission(base({ failureCount: AUTOPAY_MAX_RETRIES + 1 }), "card", "2026-10-01");
        expect(verdict.allowed).toBe(false);
        expect(verdict.allowed === false && verdict.reason).toBe("retry_window_exhausted");
    });

    /* Forty days is the outer bound. A family that left in October is not charged in December. */
    it("stops retrying once the 40-day window has passed", () => {
        const verdict = retryAdmission(
            base({ failureCount: 1, metadata: { first_failure_at: "2026-09-01" } }),
            "card",
            "2026-10-15",
        );
        expect(verdict.allowed).toBe(false);
        expect(verdict.allowed === false && verdict.reason).toBe("retry_window_exhausted");
    });

    /*
     * ACH SPACING. Re-presenting a debit before the first has had time to return incurs a second
     * return fee on money that was never there.
     */
    it("holds an ACH retry until three business days have passed", () => {
        // Thu 2026-10-01 -> Fri 2026-10-02 is one business day.
        expect(retryAdmission(base({ failureCount: 1, lastAttemptAt: "2026-10-01" }), "ach", "2026-10-02").allowed).toBe(false);
        // Thu -> the following Tue is three business days (Fri, Mon, Tue).
        expect(retryAdmission(base({ failureCount: 1, lastAttemptAt: "2026-10-01" }), "ach", "2026-10-06").allowed).toBe(true);
    });

    it("does not impose ACH spacing on a card retry", () => {
        expect(retryAdmission(base({ failureCount: 1, lastAttemptAt: "2026-10-01" }), "card", "2026-10-02").allowed).toBe(true);
    });

    it("counts only weekdays between two dates", () => {
        expect(businessDaysBetween("2026-10-01", "2026-10-02")).toBe(1);
        expect(businessDaysBetween("2026-10-02", "2026-10-05")).toBe(1); // Fri -> Mon
        expect(businessDaysBetween("2026-10-01", "2026-10-01")).toBe(0);
    });

    /*
     * THE WINDOW MUST BE ANCHORED, AND THIS CAUGHT IT NOT BEING.
     *
     * `retryAdmission` reads `metadata.first_failure_at` and falls back to the LAST attempt. Nothing
     * wrote that stamp, so every run fell back — and a window measured from the most recent attempt
     * slides forward with each one and never expires. A family who left in October could still be
     * charged in December.
     */
    it("stamps the first failure so the 40-day window has something to measure from", async () => {
        const s = store();
        const collect = vi.fn(async () => ({ ok: false as const, reason: "method_unavailable_at_provider", message: "declined" })) as never;
        await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });

        const stamped = s.updates.find((u) => u.patch.metadata != null);
        expect(stamped, "the first failure must anchor the window").toBeTruthy();
        expect((stamped!.patch.metadata as Record<string, unknown>).first_failure_at).toBe(NOW().toISOString());
    });

    it("does not move the anchor on a later failure", async () => {
        const s = store({ arrangement: arrangementRow({ failure_count: 1, metadata: { first_failure_at: "2026-09-01T00:00:00.000Z" } }) });
        const collect = vi.fn(async () => ({ ok: false as const, reason: "method_unavailable_at_provider", message: "declined" })) as never;
        await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(s.updates.some((u) => u.patch.metadata != null), "the original anchor stands").toBe(false);
    });

    it("fails the arrangement when the retry budget is spent, and stops waking", async () => {
        const s = store({ arrangement: arrangementRow({ failure_count: AUTOPAY_MAX_RETRIES + 1 }) });
        const collect = collectorOk();
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect,
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.no_collection_reason).toBe("retry_window_exhausted");
        expect(out.nextDueAt).toBeNull();
        expect(s.updates.some((u) => u.patch.status === "failed")).toBe(true);
        expect((collect as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    });
});

describe("the W4 boundary", () => {
    /*
     * Held money is W4's, and Autopay owns none of those economics. It may not release a hold,
     * consume one, or treat held money as available prepaid — so it must not reach those tables at
     * all. The store above throws on any table outside the four this handler legitimately reads,
     * which is what makes this case meaningful rather than decorative.
     */
    it("collects without reading or writing any held-money table", async () => {
        const s = store();
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect: collectorOk(),
            resolveCollectible: collectibleOf([{ chargeId: "chg-1", outstandingCents: 50_000 }]),
        });
        expect(out.diagnostic?.collected).toBe(true);
        /*
         * The tables ACTUALLY reached, not the ones the fixture happens to hold. The first version
         * of this asserted `Object.keys(s.tables)`, which is fixed at construction and would have
         * passed even if the handler had read every hold in the database.
         */
        expect([...s.touched].sort()).toEqual([
            "payment_autopay_arrangements", "payment_methods", "payment_provider_merchants",
        ]);
    });
});

describe("an occurrence that cannot name its work", () => {
    /*
     * Terminal, not retryable: a second attempt reads the same empty reference and fails the same
     * way, so retrying would only delay the operator seeing it.
     */
    it("fails terminally when the occurrence carries no arrangement reference", async () => {
        const s = store();
        const out = await evaluateAutopayOccurrence(ctx({ domainRef: {} }), {
            supabase: s.client, now: NOW, collect: collectorOk(), resolveCollectible: collectibleOf([]),
        });
        expect(out.kind).toBe("terminal_failure");
    });

    it("stops waking for an arrangement that no longer exists", async () => {
        const s = store({ arrangement: null });
        const out = await evaluateAutopayOccurrence(ctx(), {
            supabase: s.client, now: NOW, collect: collectorOk(), resolveCollectible: collectibleOf([]),
        });
        expect(out.kind).toBe("completed");
        expect(out.diagnostic?.no_collection_reason).toBe("arrangement_missing");
        expect(out.nextDueAt).toBeNull();
    });
});
