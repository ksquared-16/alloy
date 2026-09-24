/**
 * THE PAYMENT VIEWS NEVER NEEDED THE PAYMENTS READ (P0-7.6 / Slice 12F).
 *
 * ── THE DEFECT, AND WHOSE IT WAS ──
 *
 * Slice 12E chained `resolveHouseholdPaymentViews` behind `readAccountPayments` and wrote in its own
 * commit message that the dependency was real. It is not. The function's signature is
 * `(supabase, { orgId, customerId })`; it issues its OWN `payments` read plus its own allocations,
 * charges and customers reads, and never touches what `readAccountPayments` returned — the two
 * answers are married afterwards, by payment id.
 *
 * The deployed spans put a number on it: `payment_views_ms` 1,152 ms median, **75 %** of
 * `financials_build_ms`, spent waiting for a read it does not consume. Both of its inputs are known
 * before the build's first await, so that is where it now starts.
 *
 * ── WHAT THESE GATES ASSERT ──
 *
 * The runtime START ORDER, from the recorded trip graph — not that a `Promise.all` appears
 * somewhere. And the failure contract, which is the part concurrency can quietly destroy: a views
 * read that fails must still make the card say it cannot answer about payments, never resolve to
 * "no payment views".
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

const LATENCY = 20;
const TODAY = "2026-09-17";

/** One database round trip: which table, which columns, and when it started and finished. */
type Trip = { table: string; select: string; startRel: number; endRel: number };

/**
 * The views read and the account payments read BOTH hit `payments`, so the table name alone cannot
 * tell them apart. The selected columns can: the views read asks for the payment-view column set,
 * the account read does not.
 */
const VIEWS_PAYMENT_MARKER = "billable_source_type";

function latencyClient(fixture: Record<string, unknown[]>, trips: Trip[], t0: () => number, fail?: (table: string, select: string) => boolean) {
    const build = (table: string) => {
        let one = false;
        let select = "";
        const self: Record<string, unknown> = {};
        for (const m of ["eq", "neq", "in", "is", "gt", "gte", "lt", "lte", "not", "or",
            "order", "limit", "range", "filter", "contains", "overlaps", "match", "returns", "abortSignal"]) self[m] = () => self;
        self.select = (cols?: string) => { select = typeof cols === "string" ? cols : ""; return self; };
        self.maybeSingle = () => { one = true; return self; };
        self.single = () => { one = true; return self; };
        self.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
            const startRel = Math.round(performance.now() - t0());
            return new Promise((r) => setTimeout(r, LATENCY)).then(() => {
                trips.push({ table, select, startRel, endRel: Math.round(performance.now() - t0()) });
                if (fail?.(table, select)) {
                    return onErr ? onErr(new Error(`planted failure: ${table}`)) : Promise.reject(new Error(`planted failure: ${table}`));
                }
                const rows = fixture[table] ?? [];
                return onOk({ data: one ? (rows[0] ?? null) : rows, error: null, count: rows.length });
            }, onErr);
        };
        return self;
    };
    /*
     * ONE trip, resolved without a timer: the bundle is the canonical acquisition boundary, and
     * giving it its own latency only couples this fake to each test's clock. The `fail` predicate
     * still reaches it, so a planted acquisition failure is modelled where production has one.
     */
    const bundleRpc = () => ({
        then: (onOk: (v: unknown) => unknown) => {
            const startRel = Math.round(performance.now() - t0());
            return new Promise((r) => setTimeout(r, LATENCY)).then(() => {
                trips.push({ table: "financials_account_fact_bundle", select: "bundle", startRel, endRel: Math.round(performance.now() - t0()) });
                return onOk(fail?.("financials_account_fact_bundle", "")
                    ? { data: null, error: { message: "planted failure: account fact bundle" } }
                    : { data: bundleFor(fixture), error: null });
            });
        },
    });
    return {
        from: (tbl: string) => build(tbl),
        rpc: (name: string) => (name === "financials_account_fact_bundle" ? bundleRpc() : build("(rpc)")),
    } as never;
}

/**
 * What the account fact bundle returns for a fixture.
 *
 * Production acquires every dependent fact in one server-side round trip, so a fake that answers
 * only table reads answers nothing at all. This models that boundary from the same fixture the
 * table reads use, which keeps these contracts pointed at the acquisition production actually has.
 */
function bundleFor(fixture: Record<string, unknown[]>) {
    const all = (t: string) => (fixture[t] ?? []) as Array<Record<string, unknown>>;
    const agreements = all("child_enrollment_agreements");
    const charges = all("charges");
    return {
        resolved_customer_id: (agreements[0]?.customer_id as string) ?? null,
        agreements,
        members: all("customer_members"),
        reductions_by_agreement: all("financial_reduction_applications"),
        commercial_policies: all("commercial_policies"),
        charges,
        reductions_by_charge: all("financial_reduction_applications"),
        payment_allocations: all("payment_allocations"),
        responsibility_allocations: all("financial_responsibility_allocations"),
        subsidy_claim_lines: all("financial_subsidy_claim_lines"),
        payments_backing: all("payments"),
        responsibility_attributions: all("payment_responsibility_attributions"),
        responsible_persons: all("persons"),
        funding_by_allocation: [],
        funding_by_share: [],
        funding_for_responsibility: all("financial_expected_funding"),
        subsidy_claims: all("financial_subsidy_claims"),
        subsidy_variances: all("financial_subsidy_variances"),
        collection_attempts: all("payment_collection_attempts"),
        payments_by_source: all("payments"),
        counts: {
            agreements: agreements.length,
            charges: charges.length,
            allocations: all("financial_responsibility_allocations").length,
            claim_lines: all("financial_subsidy_claim_lines").length,
        },
    };
}

function fixture(posted = 3, agreements = 3): Record<string, unknown[]> {
    const ids = Array.from({ length: agreements }, (_, i) => `agr-${i + 1}`);
    return {
        child_enrollment_agreements: ids.map((id, i) => ({ id, customer_member_id: `mem-${i + 1}`, customer_id: "cust-1", status: "active" })),
        customer_members: ids.map((_, i) => ({ id: `mem-${i + 1}`, first_name: "A", last_name: "B", display_name: `C${i + 1}` })),
        charges: Array.from({ length: posted }, (_, i) => ({
            id: `chg-${i + 1}`, billable_source_type: "child_enrollment_agreement", billable_source_id: ids[i % agreements],
            source_charge_id: null, charge_category: "tuition", charge_type: "tuition", status: "posted",
            amount_cents: 10000, currency_code: "USD", charge_template_id: "tpl-1", service_date: TODAY,
            occurs_on: TODAY, billable_on: TODAY, due_date: TODAY, posted_at: `${TODAY}T00:00:00Z`,
            voided_at: null, description: "t", metadata: {}, created_at: `${TODAY}T00:00:00Z`,
        })),
        gl_account_mappings: [{ key: "tuition", gl_account_id: "gl-1", is_active: true }],
        gl_accounts: [{ id: "gl-1", code: "4000", name: "Tuition", is_active: true }],
        financial_charge_templates: [{ id: "tpl-1", label: "Tuition", charge_category: "tuition", amount_strategy: "fixed", amount_cents: 10000, currency_code: "USD", occurs_on_strategy: "s", billable_on_strategy: "s", trigger_type: "manual", is_active: true, effective_start: null, effective_end: null }],
        payment_provider_merchants: [{ ach_readiness: "ready" }],
        payment_allocations: [{ id: "pa-1", allocated_amount_cents: 1000, status: "active", payment_id: "pay-1", charge_id: "chg-1" }],
        payments: [{ id: "pay-1", status: "posted", direction: "inbound", payer_entity_type: "person", payer_entity_id: "per-1", amount_cents: 1000, received_at: `${TODAY}T00:00:00Z`, method: "card", currency_code: "USD", billable_source_type: "enrollment_agreement", billable_source_id: "agr-1", customer_id: "cust-1", refunds_payment_id: null }],
        financial_responsibility_allocations: [{ id: "ra-1", assigned_amount_cents: 10000, is_unassigned: false, share_id: "sh-1", charge_id: "chg-1", state: "active" }],
        financial_expected_funding: [{ id: "ef-1", expected_amount_cents: 2000, percent_basis_points: null, basis: "amount", state: "active", allocation_id: "ra-1", share_id: "sh-1" }],
        financial_subsidy_claim_lines: [{ id: "cl-1", claim_id: "cm-1", allocation_id: "ra-1", amount_cents: 2000, state: "submitted" }],
        financial_subsidy_claims: [{ id: "cm-1", state: "submitted" }],
        financial_subsidy_variances: [{ id: "sv-1", claim_line_id: "cl-1", variance_cents: 0, state: "open" }],
        financial_reduction_applications: [{ id: "fra-1", charge_id: "chg-1", amount_cents: 0, state: "active", source_charge_id: "chg-1" }],
        payment_responsibility_attributions: [{ id: "pra-1", charge_id: "chg-1", person_id: "per-1", amount_cents: 1000 }],
        persons: [{ id: "per-1", first_name: "P", last_name: "Q", full_name: "P Q" }],
        customers: [{ id: "cust-1", name: "The Household" }],
    };
}

/**
 * The longest CHAIN of round trips that had to happen one after another.
 *
 * Computed from the recorded intervals, not from a wall clock divided by the latency — that reads
 * differently under a busy event loop, and depth is a property of the dependency graph.
 */
function serialDepth(trips: Trip[]): number {
    const ordered = [...trips].sort((a, b) => a.startRel - b.startRel);
    const depth = new Map<Trip, number>();
    let best = 0;
    for (const t of ordered) {
        let prior = 0;
        for (const o of ordered) {
            if (o !== t && o.endRel - 1 <= t.startRel) prior = Math.max(prior, depth.get(o) ?? 0);
        }
        depth.set(t, prior + 1);
        best = Math.max(best, prior + 1);
    }
    return best;
}

async function measure(opts: { posted?: number; fail?: (table: string, select: string) => boolean } = {}) {
    const trips: Trip[] = [];
    let base = 0;
    const supabase = latencyClient(fixture(opts.posted ?? 3), trips, () => base, opts.fail);
    base = performance.now();
    const vm = await buildFinancialsCardVM(supabase, { orgId: "o", customerId: "cust-1", today: TODAY });
    const counts: Record<string, number> = {};
    for (const t of trips) counts[t.table] = (counts[t.table] ?? 0) + 1;
    return { vm, trips, counts, depth: serialDepth(trips) };
}

/** The first trip issued by the payment-VIEWS composition, identified by its column set. */
const firstViewsTrip = (trips: Trip[]) => trips.find((t) => t.table === "payments" && t.select.includes(VIEWS_PAYMENT_MARKER));
/** The first trip issued by `readAccountPayments`, which is the other `payments` reader. */
const firstAccountPaymentsTrip = (trips: Trip[]) => trips.find((t) => t.table === "payments" && !t.select.includes(VIEWS_PAYMENT_MARKER));

const SRC = readFileSync(join(process.cwd(), "lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const VIEWS_SRC = readFileSync(join(process.cwd(), "lib/financials/paymentApplicationView.ts"), "utf8");

describe("the dependency is not real — proven from current source", () => {
    it("THE GATE: resolveHouseholdPaymentViews takes only orgId and customerId", () => {
        const sig = VIEWS_SRC.slice(
            VIEWS_SRC.indexOf("export async function resolveHouseholdPaymentViews"),
            VIEWS_SRC.indexOf("): Promise<PaymentView[]>"),
        );
        expect(sig).toContain("input: { orgId: string; customerId: string }");
        // If it ever grows an input derived from the account payments read, the concurrency below
        // stops being safe and this gate is where that must be noticed.
        expect(sig).not.toMatch(/payments\s*:|applied|allocations\s*:/);
    });

    it("the views composition issues its OWN payments read — it does not receive one", () => {
        const body = VIEWS_SRC.slice(VIEWS_SRC.indexOf("export async function resolveHouseholdPaymentViews"));
        expect(body).toContain('.from("payments")');
    });
});

describe("the payment views no longer wait for the payments read", () => {
    it("THE GATE: the views read is in the FIRST wave of trips — nothing precedes it", async () => {
        /*
         * RELATIVE TO THE RUN'S OWN FIRST TRIP, not to a constant.
         *
         * The first cut asserted `startRel < LATENCY` — an absolute 20 ms bound on when the build
         * issues its first query. That is an event-loop assertion wearing a structural one's
         * clothes: on a loaded runner, module import and scheduling push the whole first wave past
         * 20 ms and the gate fails on an unchanged tree. It did exactly that, once, in a run that
         * had three suites in flight.
         *
         * The structural claim is that nothing is awaited before the views read. Measuring it
         * against the earliest trip of the same run says that, and moves with the jitter instead of
         * being caught by it.
         */
        const { trips } = await measure();
        const views = firstViewsTrip(trips);
        expect(views, "the payment-views read was never issued").toBeDefined();
        const earliest = Math.min(...trips.map((t) => t.startRel));
        expect(
            views!.startRel - earliest,
            "the views read is waiting behind an earlier round trip",
        ).toBeLessThan(LATENCY);
    }, 30_000);

    it("THE GATE: the views read starts BEFORE the account payments read, not after it", async () => {
        const { trips } = await measure();
        const views = firstViewsTrip(trips);
        const payments = firstAccountPaymentsTrip(trips);
        expect(views).toBeDefined();
        expect(payments, "the account payments read was never issued").toBeDefined();
        expect(
            views!.startRel,
            "payments -> payment views serialization has been restored",
        ).toBeLessThan(payments!.startRel);
    }, 30_000);

    it("THE GATE: the build's serial depth is 9 round trips, where the chained shape was 12", async () => {
        /*
         * The OUTCOME, measured, not the ordering asserted. Both numbers come from this same harness:
         * 12 with the Slice 12E chaining planted back, 9 with the views in flight from entry. The
         * bound is the after value as a ceiling, so a further improvement passes and any
         * re-serialization fails.
         *
         * Depth is what a hosted round-trip time multiplies, which is why three trips off a chain
         * that ran 1,152 ms deployed is the whole point of this slice.
         */
        const { depth } = await measure();
        expect(depth, "the payment views have been re-serialized behind the payments read")
            .toBeLessThanOrEqual(9);
    }, 30_000);
});

describe("the query multiset is unchanged on the success path", () => {
    it("THE GATE: the same reads, the same number of them", async () => {
        const { counts } = await measure();
        /*
         * Identical to the counts the chained shape produced — verified by planting it back and
         * re-running this same harness. Only the SCHEDULE changed: 29 round trips either way.
         */
        expect(counts).toEqual({
            charges: 6,
            child_enrollment_agreements: 2,
            customer_members: 1,
            /* Payments W2: the canonical method table replaced customer_payment_methods here. */
            payment_methods: 1,
            customer_persons: 1,
            customers: 1,
            financial_charge_templates: 1,
            financial_expected_funding: 1,
            financial_reduction_applications: 1,
            financial_responsibility_allocations: 1,
            gl_account_mappings: 1,
            gl_accounts: 1,
            payment_allocations: 3,
            payment_collection_attempts: 1,
            payment_provider_merchants: 2,
            payment_responsibility_attributions: 1,
            payments: 4,
        });
    }, 30_000);

    it("THE GATE: the views composition runs exactly ONCE", async () => {
        // Starting a read earlier must never mean starting it twice.
        const { trips } = await measure();
        expect(trips.filter((t) => t.table === "payments" && t.select.includes(VIEWS_PAYMENT_MARKER)).length).toBe(1);
        expect(trips.filter((t) => t.table === "customers").length).toBe(1);
    }, 30_000);
});

describe("the failure contract survives the concurrency — this is the money-facing half", () => {
    it("A · both succeed: the views are merged into the payments by payment id", async () => {
        const { vm } = await measure();
        expect(vm.unavailable.map((u) => u.fact)).not.toContain("payments");
        expect(vm.payments.length).toBeGreaterThan(0);
        expect(vm.payments[0].payerLabel).toBe("The Household");
    }, 30_000);

    it("B · the PAYMENTS read fails: the card still says it cannot answer about payments", async () => {
        const { vm } = await measure({ fail: (table, select) => table === "payments" && !select.includes(VIEWS_PAYMENT_MARKER) });
        expect(vm.unavailable.map((u) => u.fact)).toContain("payments");
        for (const r of vm.rows) {
            expect(r.appliedCents).toBe(0);
            expect(r.outstandingCents).toBe(r.amountCents);
        }
    }, 30_000);

    it("THE GATE: C · the VIEWS read fails — still UNAVAILABLE, never 'no payment views'", async () => {
        /*
         * The one thing concurrency could quietly buy. Before this slice a views failure rejected the
         * chained promise and the whole payments answer became unavailable. Running the two in
         * parallel makes it trivially easy to let the views resolve to null instead — an error
         * presented as an absence, on a money surface.
         */
        const { vm } = await measure({ fail: (table, select) => table === "payments" && select.includes(VIEWS_PAYMENT_MARKER) });
        expect(vm.unavailable.map((u) => u.fact), "a failed payment-views read collapsed into an empty state")
            .toContain("payments");
    }, 30_000);

    it("D · the ACQUISITION fails: one unavailable answer, and no ledger at all", async () => {
        /*
         * ── THE CONTRACT CHANGE, STATED WHERE IT HAPPENED ──────────────────────────────────────
         *
         * This used to plant a failure on the account's receipts read and require the ledger to
         * render anyway with everything outstanding — a partial answer, honestly labelled.
         *
         * The receipts no longer have their own read. They arrive with every other dependent fact
         * from the canonical account fact bundle, and there is no state in which the charges
         * answered and the receipts did not. So the contract is whole-card: a bundle that cannot
         * answer makes the account's financial answer UNAVAILABLE, and no ledger is assembled from
         * an acquisition that partly failed. That is the direction this gate always protected,
         * applied to every fact at once instead of one family at a time.
         */
        const { vm } = await measure({ fail: (table) => table === "financials_account_fact_bundle" });
        expect(vm.unavailableReason, "one unavailable answer").toMatch(/unavailable/i);
        expect(vm.rows, "and not a partial ledger").toEqual([]);
    }, 30_000);

    it("THE GATE: the join re-throws the views failure rather than defaulting it", () => {
        expect(CODE).toMatch(/const seen = await paymentViewsP;[\s\S]{0,160}if \(!seen\.ok\) throw seen\.error;/);
    });

    it("the views promise never rejects, so an early return cannot leave one unhandled", () => {
        // It resolves to a tagged outcome at creation; the failure is re-imposed at the join.
        expect(CODE).toMatch(/\.catch\(\(error: unknown\) => \(\{ ok: false as const, error \}\)\)/);
    });
});

describe("truth, authorization and meaning are untouched", () => {
    it("THE GATE: the produced card is identical to the pre-repair card", async () => {
        const { vm } = await measure();
        expect(vm.rows.map((r) => [r.chargeId, r.amountCents, r.appliedCents, r.outstandingCents, r.lifecycleStatus, r.offersPayment, r.offersReverse]))
            .toEqual([
                ["chg-1", 10000, 1000, 9000, "posted", true, true],
                ["chg-2", 10000, 0, 10000, "posted", true, true],
                ["chg-3", 10000, 0, 10000, "posted", true, true],
            ]);
        expect(vm.collectible).toEqual({
            outstandingCents: 0, expectedSubsidyCents: 0, submittedClaimSuppressionCents: 0,
            actualSubsidyReceivedCents: 0, unresolvedVarianceCents: 0, currentlyCollectibleCents: 0,
        });
        expect(vm.achAvailable).toBe(true);
        expect(vm.subjects.map((s) => s.displayName)).toEqual(["C1", "C2", "C3"]);
    }, 30_000);

    it("THE GATE: the card is identical across representative account shapes", async () => {
        /*
         * Zero activity, one obligation and several — the shapes §6 names. Each value below was
         * produced by the chained build first and by this one second, and compared.
         */
        const zero = await measure({ posted: 0 });
        expect(zero.vm.rows).toEqual([]);
        expect(zero.vm.unavailable.map((u) => u.fact)).not.toContain("payments");

        const one = await measure({ posted: 1 });
        expect(one.vm.rows.map((r) => [r.chargeId, r.appliedCents, r.outstandingCents])).toEqual([["chg-1", 1000, 9000]]);
        expect(one.vm.payments[0]?.payerLabel).toBe("The Household");

        const many = await measure({ posted: 6 });
        expect(many.vm.rows.length).toBe(6);
        expect(many.vm.rows.filter((r) => r.appliedCents > 0).length).toBe(1);
    }, 60_000);

    it("THE GATE: the payment-id merge semantics are unchanged", () => {
        // The views decorate an existing payment row; they never create one, drop one, or reorder.
        expect(CODE).toMatch(/const byPaymentId = new Map\(views\.map\(\(v\) => \[v\.paymentId, v\]\)\)/);
        expect(CODE).toMatch(/const view = byPaymentId\.get\(row\.paymentId\);[\s\S]{0,60}if \(!view\) return row;/);
        expect(CODE).toMatch(/unappliedCents: view\.unappliedCents,[\s\S]{0,90}applications: view\.applications,/);
    });

    it("THE GATE: the build still holds no authorization opinion of its own", () => {
        // `fin.read` is evaluated in the producer, before this function is entered, and starting a
        // read EARLIER must not mean starting it outside that gate.
        expect(CODE).not.toContain("fin.read");
        expect(CODE).not.toContain("assertFinancialsReadAllowed");
        expect(CODE).not.toMatch(/permissionKeys|hasPermission|user_roles/);
    });

    it("the views read is still scoped to this household, and skipped when there is none", () => {
        expect(CODE).toMatch(/resolveHouseholdPaymentViews\(supabase, \{ orgId: args\.orgId, customerId: household \}\)/);
        expect(CODE).toMatch(/: Promise\.resolve\(\{ ok: true as const, views: null \}\)/);
    });
});

describe("what this slice deliberately did NOT do", () => {
    it("the collectibility loop is untouched — 245 ms and two calls, not a long pole", () => {
        const loop = CODE.slice(CODE.indexOf("for (const row of collectibleRows)"), CODE.indexOf("vm.collectible = collectible"));
        expect(loop).toContain('await clock.time("collectible_ms"');
        expect(loop).not.toContain("Promise.all");
    });

    it("nothing was cached, deferred or given a second owner", () => {
        expect(CODE).not.toMatch(/setTimeout|unstable_cache|revalidate|\bcache\(/);
        // One views composition, one call site.
        expect((CODE.match(/resolveHouseholdPaymentViews\(/g) ?? []).length).toBe(1);
    });
});
