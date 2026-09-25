/**
 * THE FINANCIALS BUILD MUST NOT WAIT ON READS IT DOES NOT DEPEND ON (P0-7.6 / Slice 12E).
 *
 * ── WHAT WAS MEASURED, AND WHY THIS IS THE REPAIR ──
 *
 * Slice 12D measured `buildFinancialsCardVM` deployed as the card-producer LONG POLE:
 * `financials_build_ms` 2,423 ms median, 89 % of `card_producers_ms` and 49 % of the whole outer
 * compose. It could not say what inside it costs that, because the build was one span over roughly
 * fifteen table reads.
 *
 * The decomposition found the cost is not one slow query. It is DEPTH: the build made seventeen
 * database round trips strictly one after another, and most of those edges were not dependencies.
 * The GL configuration, the charge templates and the merchant row depend on `orgId` alone, yet sat
 * four and nine trips deep. Members, reductions and charges each need only the agreements, yet ran
 * in single file. Responsibility, payments, payment setup and open collections consume none of each
 * other's results, yet queued behind one another. Source order was standing in for a dependency
 * graph that does not exist.
 *
 * ── THE MEASUREMENT THAT MAKES THIS A NUMBER, NOT A HUNCH ──
 *
 * The client below applies a FIXED latency to every round trip, and `serialDepth` reads the longest
 * chain of trips that had to happen one after another straight off the recorded intervals. Depth is
 * a property of the dependency graph, so it is machine-independent; on a hosted database it is what
 * RTT multiplies. Calibrated against Slice 12D's own deployed medians — the Financials gate
 * (1 trip / 234 ms), Attendance (1 / 120 ms) and Health (3 / 345 ms) — hosted cost is ~115-120 ms
 * per serial round trip, so the eight trips this repair removes are worth ~920-960 ms.
 *
 * Nothing here is stubbed except the transport. `readAccountReductions`, `readResponsibility`,
 * `readAccountPayments`, `resolveFamilyCollectible`, `resolvePaymentSetup`, `resolvePayerCandidates`
 * and `resolveHouseholdPaymentViews` all run for real and issue their own queries through this
 * client, so their trips are counted too.
 *
 * ── WHAT THESE GATES ASSERT ──
 *
 * The repaired OUTCOME, not the presence of a `Promise.all`. Depth is measured; the query multiset
 * is pinned so concurrency can never be bought with extra database work; and the produced card is
 * compared field by field, because this is money and a latency repair that changes a number is not
 * a latency repair.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

const LATENCY = 20;
const TODAY = "2026-09-17";

type Trip = { table: string; startRel: number; endRel: number };

/** A thenable query builder that records one round trip and costs exactly `LATENCY` to answer. */
function latencyClient(fixture: Record<string, unknown[]>, trips: Trip[], t0: () => number) {
    const build = (table: string) => {
        let one = false;
        const self: Record<string, unknown> = {};
        for (const m of [
            "select", "eq", "neq", "in", "is", "gt", "gte", "lt", "lte", "not", "or",
            "order", "limit", "range", "filter", "contains", "overlaps", "match", "returns", "abortSignal",
        ]) self[m] = () => self;
        self.maybeSingle = () => { one = true; return self; };
        self.single = () => { one = true; return self; };
        self.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
            const startRel = Math.round(performance.now() - t0());
            return new Promise((r) => setTimeout(r, LATENCY)).then(() => {
                trips.push({ table, startRel, endRel: Math.round(performance.now() - t0()) });
                const rows = fixture[table] ?? [];
                return onOk({ data: one ? (rows[0] ?? null) : rows, error: null, count: rows.length });
            }, onErr);
        };
        return self;
    };
    /*
     * ONE trip, resolved without a timer. The table reads model latency so these tests can count
     * ROUND-TRIP WINDOWS; the bundle is a single trip whose whole point is that nothing waits on
     * it in sequence, and giving it its own timer only couples this fake to each test's clock.
     */
    const bundleRpc = () => ({
        then: (onOk: (v: unknown) => unknown) => {
            const at = Math.round(performance.now() - t0());
            trips.push({ table: "financials_account_fact_bundle", startRel: at, endRel: at });
            const answer = { data: bundleFor(fixture), error: null };
            return Promise.resolve(onOk(answer));
        },
    });
    return {
        from: (tbl: string) => build(tbl),
        rpc: (name: string) => (name === "financials_account_fact_bundle" ? bundleRpc() : build("(rpc)")),
    } as never;
}

/** A household with `posted` obligations in the current billing period. */

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
        payments_for_views: all("payments"),
        charges_for_allocations: charges,
        payer_customers: all("customers"),
        payment_refunds: [],
        counts: {
            agreements: agreements.length,
            charges: charges.length,
            allocations: all("financial_responsibility_allocations").length,
            claim_lines: all("financial_subsidy_claim_lines").length,
        },
    };
}

function fixture(posted: number, agreements = 3): Record<string, unknown[]> {
    const ids = Array.from({ length: agreements }, (_, i) => `agr-${i + 1}`);
    return {
        child_enrollment_agreements: ids.map((id, i) => ({
            id, customer_member_id: `mem-${i + 1}`, customer_id: "cust-1", status: "active",
        })),
        customer_members: ids.map((_, i) => ({
            id: `mem-${i + 1}`, first_name: "A", last_name: "B", display_name: `C${i + 1}`,
        })),
        charges: Array.from({ length: posted }, (_, i) => ({
            id: `chg-${i + 1}`, billable_source_type: "child_enrollment_agreement",
            billable_source_id: ids[i % agreements], source_charge_id: null,
            charge_category: "tuition", charge_type: "tuition", status: "posted",
            amount_cents: 10000, currency_code: "USD", charge_template_id: "tpl-1",
            service_date: TODAY, occurs_on: TODAY, billable_on: TODAY, due_date: TODAY,
            posted_at: `${TODAY}T00:00:00Z`, voided_at: null, description: "t", metadata: {},
            created_at: `${TODAY}T00:00:00Z`,
        })),
        gl_account_mappings: [{ key: "tuition", gl_account_id: "gl-1", is_active: true }],
        gl_accounts: [{ id: "gl-1", code: "4000", name: "Tuition", is_active: true }],
        financial_charge_templates: [{
            id: "tpl-1", label: "Tuition", charge_category: "tuition", amount_strategy: "fixed",
            amount_cents: 10000, currency_code: "USD", occurs_on_strategy: "s",
            billable_on_strategy: "s", trigger_type: "manual", is_active: true,
            effective_start: null, effective_end: null,
        }],
        payment_provider_merchants: [{ ach_readiness: "ready" }],
        payment_allocations: [{ id: "pa-1", allocated_amount_cents: 1000, status: "active", payment_id: "pay-1", charge_id: "chg-1" }],
        payments: [{ id: "pay-1", status: "posted", direction: "inbound", payer_entity_type: "person", payer_entity_id: "per-1", amount_cents: 1000, received_at: `${TODAY}T00:00:00Z`, method: "card", currency_code: "USD" }],
        financial_responsibility_allocations: [{ id: "ra-1", assigned_amount_cents: 10000, is_unassigned: false, share_id: "sh-1", charge_id: "chg-1", state: "active" }],
        financial_expected_funding: [{ id: "ef-1", expected_amount_cents: 2000, percent_basis_points: null, basis: "amount", state: "active", allocation_id: "ra-1", share_id: "sh-1" }],
        financial_subsidy_claim_lines: [{ id: "cl-1", claim_id: "cm-1", allocation_id: "ra-1", amount_cents: 2000, state: "submitted" }],
        financial_subsidy_claims: [{ id: "cm-1", state: "submitted" }],
        financial_subsidy_variances: [{ id: "sv-1", claim_line_id: "cl-1", variance_cents: 0, state: "open" }],
        financial_reduction_applications: [{ id: "fra-1", charge_id: "chg-1", amount_cents: 0, state: "active", source_charge_id: "chg-1" }],
        payment_responsibility_attributions: [{ id: "pra-1", charge_id: "chg-1", person_id: "per-1", amount_cents: 1000 }],
        persons: [{ id: "per-1", first_name: "P", last_name: "Q", full_name: "P Q" }],
    };
}

async function measure(posted: number) {
    const trips: Trip[] = [];
    let base = 0;
    const supabase = latencyClient(fixture(posted), trips, () => base);
    base = performance.now();
    const started = performance.now();
    const vm = await buildFinancialsCardVM(supabase, { orgId: "o", customerId: "cust-1", today: TODAY });
    const wall = performance.now() - started;
    const counts: Record<string, number> = {};
    for (const t of trips) counts[t.table] = (counts[t.table] ?? 0) + 1;
    return { vm, trips, counts, wall, depth: serialDepth(trips) };
}

/**
 * The longest CHAIN of round trips that had to happen one after another.
 *
 * Dividing the wall clock by the latency was the first version of this, and it read 10 under a bare
 * runner and 13 under vitest — the same code, measured through a busier event loop. Depth is a
 * property of the dependency graph, so it is computed from the graph: for each trip, one plus the
 * deepest trip that had already FINISHED when it started.
 */
function serialDepth(trips: Trip[]): number {
    const ordered = [...trips].sort((a, b) => a.startRel - b.startRel);
    const depth = new Map<Trip, number>();
    let best = 0;
    for (const t of ordered) {
        let prior = 0;
        for (const o of ordered) {
            if (o === t) continue;
            // `- 1` absorbs the millisecond of rounding at a boundary where one trip's answer
            // immediately starts the next; without it two genuinely serial trips can read parallel.
            if (o.endRel - 1 <= t.startRel) prior = Math.max(prior, depth.get(o) ?? 0);
        }
        depth.set(t, prior + 1);
        best = Math.max(best, prior + 1);
    }
    return best;
}

const SRC = readFileSync(
    join(process.cwd(), "lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts"),
    "utf8",
);
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DIAG = readFileSync(join(process.cwd(), "lib/perf/routeTimingDiagnostic.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the measured repair — serial depth, not query count", () => {
    /*
     * Measured, three runs each, in a probe worktree at `c911a6644` (the commit this repair sits on)
     * and here. Graph depth is deterministic — every run returned the same integer:
     *
     *      obligations   0    1    3    6   12
     *      before       10   15   17   20   26
     *      after         5    7    9   12   18
     *
     * The bounds are the AFTER values exactly, as ceilings: a further improvement passes, and any
     * re-serialization fails. A first cut used looser bounds and a planted `await configRead` ahead
     * of the agreements read — real re-serialization — slipped through them.
     */
    it("THE GATE: a household with three obligations costs at most 9 serial round trips (was 17)", async () => {
        const { depth } = await measure(3);
        expect(depth, "the build re-serialized: independent reads are waiting on each other again").toBeLessThanOrEqual(9);
    }, 30_000);

    it("THE GATE: an account with NO obligations costs at most 5 (was 10)", async () => {
        // The fixed prefix, with the per-obligation loop out of the picture entirely.
        const { depth } = await measure(0);
        expect(depth).toBeLessThanOrEqual(5);
    }, 30_000);

    it("THE GATE: the saving holds as the account grows — twelve obligations at most 18 (was 26)", async () => {
        const { depth } = await measure(12);
        expect(depth).toBeLessThanOrEqual(18);
    }, 60_000);

    it("THE GATE: the depth removed is CONSTANT, not bought back as the account grows", async () => {
        // serial ≈ fixed prefix + one trip per obligation. If a later change re-serialized the
        // prefix, the gap between these two would close.
        const small = await measure(1);
        const large = await measure(12);
        // Eleven more obligations, eleven more trips — and not one extra from the prefix.
        expect(large.depth - small.depth).toBeLessThanOrEqual(11);
    }, 60_000);
});

describe("the concurrency was not bought with extra database work", () => {
    it("THE GATE: the query multiset is exactly what it was before the repair", async () => {
        const { counts } = await measure(3);
        expect(counts).toEqual({
            charges: 5,
            child_enrollment_agreements: 1,
            customer_members: 1,
            /* Payments W2: the canonical method table replaced customer_payment_methods here. */
            payment_methods: 1,
            customer_persons: 1,
            financial_charge_templates: 1,
            financial_expected_funding: 1,
            financial_reduction_applications: 1,
            financial_responsibility_allocations: 1,
            gl_account_mappings: 1,
            gl_accounts: 1,
            payment_allocations: 1,
            payment_collection_attempts: 1,
            // TWO, deliberately. `resolvePaymentSetup` reads this table for ANY active merchant;
            // the card's own read pins `processor = stripe`. They are not the same question, so the
            // near-duplicate is hoisted rather than collapsed — collapsing it would quietly change
            // which merchant answers for ACH.
            payment_provider_merchants: 2,
            payment_responsibility_attributions: 1,
            payments: 2,
        });
    }, 30_000);

    it("THE GATE: the org-grain reads are issued in the FIRST round-trip window", async () => {
        // The hoist, measured rather than read: these depend on orgId alone, so nothing may be
        // awaited before them. `startRel` is milliseconds from the build's own start.
        const { trips } = await measure(3);
        for (const table of ["gl_account_mappings", "gl_accounts", "financial_charge_templates", "payment_provider_merchants"]) {
            const first = trips.find((t) => t.table === table);
            expect(first, `${table} was never read`).toBeDefined();
            expect(first!.startRel, `${table} is still waiting behind an unrelated read`).toBeLessThan(LATENCY);
        }
    }, 30_000);

    it("THE GATE: members, reductions and charges no longer cost the client a round trip at all", async () => {
        /*
         * These three used to be measured against each other: they needed the agreements and
         * nothing else, so a card that read them in single file paid three round trips for one
         * question. They are not read by the client any more — they arrive with the rest of the
         * account's dependent facts — so "together" is no longer the strongest thing that can be
         * said about them. "Not a client trip at all" is, and that is what is asserted.
         */
        const { trips } = await measure(3);
        const tables = trips.map((t) => t.table);
        expect(tables, "the canonical acquisition is the bundle").toContain("financials_account_fact_bundle");
        for (const table of ["customer_members", "financial_reduction_applications", "charges"]) {
            expect(tables, `${table} came with the bundle; reading it again is the old chain returning`)
                .not.toContain(table);
        }
    }, 30_000);
});

describe("financial truth is untouched — this is scheduling only", () => {
    it("THE GATE: the produced card is identical to the pre-repair card, field for field", async () => {
        /*
         * Not a shape check. These are the exact values `c911a6644` produced for this fixture,
         * captured from a probe worktree at that commit and compared byte for byte at five account
         * sizes. A repair that reorders money-facing reads has to prove it changed no money.
         */
        const { vm } = await measure(3);
        expect(vm.rows.map((r) => [r.chargeId, r.amountCents, r.appliedCents, r.outstandingCents, r.lifecycleStatus, r.offersPayment, r.offersReverse, r.responsiblePartyName, r.glCode]))
            .toEqual([
                ["chg-1", 10000, 1000, 9000, "posted", true, true, null, null],
                ["chg-2", 10000, 0, 10000, "posted", true, true, null, null],
                ["chg-3", 10000, 0, 10000, "posted", true, true, null, null],
            ]);
        expect(vm.reconciliation).toBeTruthy();
        expect(vm.collectible).toEqual({
            outstandingCents: 0, expectedSubsidyCents: 0, submittedClaimSuppressionCents: 0,
            actualSubsidyReceivedCents: 0, unresolvedVarianceCents: 0, currentlyCollectibleCents: 0,
        });
        expect(vm.achAvailable).toBe(true);
        expect(vm.subjects.map((s) => s.displayName)).toEqual(["C1", "C2", "C3"]);
    }, 30_000);

    it("THE GATE: a failed acquisition is UNAVAILABLE, never 'nothing has been paid'", async () => {
        /*
         * ── THE FAILURE CONTRACT, AFTER THE ACQUISITION BOUNDARY MOVED ─────────────────────────
         *
         * The account's receipts used to be their own read, so a failure there could be reported
         * as "cannot answer about payments" while the ledger still rendered with nothing applied.
         * They now arrive with every other dependent fact in ONE server-side round trip, and there
         * is no state where the charges answered and the receipts did not.
         *
         * So the contract is whole-card: a bundle that cannot answer makes the account's financial
         * answer UNAVAILABLE. That is the direction this gate always protected — a family that has
         * paid must never be shown the full amount owed because a read failed — and it is now
         * enforced for every fact at once rather than one family of facts at a time.
         */
        const rows = fixture(3);
        const supabase = {
            from: (table: string) => (latencyClient(rows, [], () => 0) as unknown as { from: (t: string) => unknown }).from(table),
            rpc: () => ({
                then: (ok: (v: unknown) => unknown) => ok({ data: null, error: { message: "bundle down" } }),
            }),
        } as never;
        const vm = await buildFinancialsCardVM(supabase, { orgId: "o", customerId: "cust-1", today: TODAY });
        expect(vm.unavailableReason, "the card says it cannot answer").toMatch(/unavailable/i);
        /* No ledger assembled from an acquisition that failed — not one row, not a zero balance. */
        expect(vm.rows, "no partial ledger").toEqual([]);
        expect(vm.collectible?.currentlyCollectibleCents ?? 0, "no balance claimed").toBe(0);
    }, 30_000);

    it("a reduction history is a fact the bundle carries, not a second read that can half-fail", async () => {
        /*
         * This asserted a `.catch(() => [] as AccountReduction[])` on a reductions read that no
         * longer exists — the history arrives with the rest of the account's facts. The RULE it
         * protected still holds and is what is asserted now: an account whose bundle answered and
         * whose reduction history is genuinely empty is a KNOWN ZERO and renders; only a failed
         * acquisition is UNAVAILABLE. A spelling in SQL would be no better a gate than a spelling
         * in TypeScript, so this asserts the behaviour.
         */
        const rows = fixture(3);
        rows.financial_reduction_applications = [];
        const supabase = latencyClient(rows, [], () => 0) as never;
        const vm = await buildFinancialsCardVM(supabase, { orgId: "o", customerId: "cust-1", today: TODAY });
        expect(vm.unavailableReason, "an empty history is not an unavailable card").toBeFalsy();
        expect(vm.reductions, "asked, and there are none").toEqual([]);
        expect(vm.rows.length, "the ledger still renders").toBeGreaterThan(0);
    }, 30_000);

    it("THE GATE: the account is still scoped to the household the request named", async () => {
        /*
         * Collapsing the acquisition must not widen what the card can see. The scope moved WITH the
         * acquisition — `financials_account_fact_bundle` bounds charges to this household's
         * agreements plus the household itself, and org-scopes every statement — so the rule this
         * gate protects is now proven in two places and asserted in the one a unit run can reach:
         * the card asks about the identities the request carried, and invents none.
         *
         * That the function HONOURS those identities is proven against the real database by
         * `accountFactBundleParity.live`, where a household read under another org returns nothing
         * rather than that tenant's ledger. Asserting the SQL's spelling here would replace a
         * TypeScript spelling with a SQL one and prove no more than either.
         */
        const asked: Array<Record<string, unknown>> = [];
        const rows = fixture(3);
        const supabase = {
            from: (table: string) => (latencyClient(rows, [], () => 0) as unknown as { from: (t: string) => unknown }).from(table),
            rpc: (name: string, params: Record<string, unknown>) => {
                asked.push({ name, ...params });
                return { then: (ok: (v: unknown) => unknown) => Promise.resolve(ok({ data: bundleFor(rows), error: null })) };
            },
        } as never;
        await buildFinancialsCardVM(supabase, { orgId: "o", customerId: "cust-1", today: TODAY });
        const call = asked.find((a) => a.name === "financials_account_fact_bundle");
        expect(call, "the card acquires through the canonical bundle").toBeDefined();
        expect(call!.p_org_id, "the org comes from the request, never widened").toBe("o");
        expect(call!.p_customer_id, "and the household it named").toBe("cust-1");
    }, 30_000);
});

describe("authorization is untouched", () => {
    it("THE GATE: the build performs no permission decision of its own", async () => {
        // `fin.read` is evaluated by the producer, BEFORE this function is ever called, and the
        // build must not acquire a second opinion — nor a way around the first.
        expect(CODE).not.toContain("fin.read");
        expect(CODE).not.toContain("assertFinancialsReadAllowed");
        expect(CODE).not.toMatch(/permissionKeys|hasPermission|user_roles/);
    });

    it("THE GATE: every read is still org-scoped", async () => {
        const { trips } = await measure(3);
        expect(trips.length).toBeGreaterThan(10);
        // A cross-tenant read would be a new table with no org predicate; the source keeps one on
        // every query this file issues.
        const queries = CODE.split('.from("').slice(1);
        for (const q of queries) {
            const table = q.slice(0, q.indexOf('"'));
            const body = q.slice(0, 700);
            expect(body, `${table} must stay org-scoped`).toMatch(/org_id|customer_id/);
        }
    }, 30_000);
});

describe("the instrument names every boundary it crosses", () => {
    it("THE GATE: the spans the build records and the spans the payload declares are the SAME SET", () => {
        /*
         * BOTH directions, because either one alone false-greens. Asserting only "every declared
         * span is recorded" survives deleting a declaration; asserting only "every recorded span is
         * declared" survives deleting a timer. The first cut of this gate was the former, and a
         * planted removal of `merchant_ms` from the payload walked straight past it.
         */
        const at = DIAG.indexOf("financials?: {");
        expect(at, "the payload no longer declares the Financials spans at all").toBeGreaterThan(-1);
        const declared = [...DIAG.slice(at, DIAG.indexOf("};", at)).matchAll(/^\s+(\w+_ms):/gm)]
            .map((m) => m[1]).sort();
        const recorded = [...new Set([...CODE.matchAll(/clock\s*\.\s*time\("(\w+_ms)"/g)].map((m) => m[1]))].sort();
        /*
         * Fourteen since the policies read became a measured boundary. It was always an awaited
         * database read; it was simply issued nine reads deep, where nobody had put a timer on it.
         * Hoisting it to the org-grain wave is what made it worth naming — and this gate is what
         * required the name, because a recorded span the payload does not declare is a boundary
         * the instrument cannot report.
         */
        expect(declared.length, "the payload names every boundary the build still crosses").toBe(recorded.length);
        expect(recorded).toEqual(declared);
    });

    it("THE GATE: no awaited database boundary is left unmeasured", () => {
        /*
         * Every `await` in the build body must either be a measured boundary or a promise that was
         * measured where it was CREATED. An unmeasured read is how a boundary gets called cheap
         * because nobody ever saw its number — which is the whole reason this slice exists.
         */
        /*
         * COMMENTS ARE NOT CODE. This scanned the raw source, so the prose "never await these" and
         * "never await it" in two explanatory blocks read as unmeasured awaits — and a gate that
         * cannot pass guards nothing. It had been failing on them long enough to hide two reads
         * that genuinely had no timer: the `commercial_policies` window read and the payment holds
         * read. Stripping comments first is what let it say so.
         */
        const source = CODE.slice(CODE.indexOf("async function buildFinancialsCardVMInner"));
        const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        /*
         * `await (` is captured too. The first version matched only an identifier, so wrapping the
         * expression in parentheses — `await (supabase.from(...))` — captured nothing and the gate
         * had nothing to object to. A planted removal of the policy-window timer walked straight
         * past it in exactly that shape.
         */
        const awaited = [...body.matchAll(/await\s+(\(|[A-Za-z_.]+)/g)].map((m) => m[1]);
        const measuredPromises = [
            "configRead", "merchantRead", "responsibilityP", "paymentsP", "setupP", "payersP",
            // Slice 12F: the payment views, in flight from entry and measured where they are created.
            // Admitted BY NAME, not by loosening the pattern — this gate caught the new await on its
            // first run, which is the gate doing its job.
            "paymentViewsP",
            /*
             * Both measured where they are CREATED, in the org-grain and post-charges waves, and
             * awaited later where their answers are assembled. Admitted by name for the same reason
             * `paymentViewsP` was: the pattern stays tight, and a genuinely unmeasured await still
             * fails this gate.
             */
            "financialPoliciesP", "collectiblePositionsP",
            "openCollectionsP", "Promise.all", "clock.time",
        ];
        for (const a of awaited) {
            expect(measuredPromises.some((p) => a.startsWith(p)), `unmeasured await: ${a}`).toBe(true);
        }
    });

    it("the spans are filed on every exit, including the failure paths", () => {
        // The wrapper, not a call at each `return` — the early returns are exactly the paths a
        // per-return recorder would leave unmeasured.
        expect(CODE).toMatch(/try \{[\s\S]{0,200}buildFinancialsCardVMInner[\s\S]{0,120}finally \{[\s\S]{0,120}recordFinancialsSpans\(clock\.spans\(\)\)/);
    });

    it("the collectibility loop reports how many round trips it made, not just how long it took", () => {
        // A duration alone cannot tell one slow read from N reads, and those want opposite repairs.
        expect(CODE).toContain('clock.count("collectible_calls", collectibleRows.length)');
    });
});

describe("what this slice deliberately did NOT do", () => {
    it("the per-obligation collectibility loop is still serial — 12F's decision, not this one", () => {
        /*
         * Parallelising it multiplies concurrent database pressure by the number of obligations and
         * is money-facing. Left serial ON PURPOSE, and asserted so that a later slice changes it
         * deliberately rather than by accident.
         */
        const loop = CODE.slice(CODE.indexOf("for (const row of collectibleRows)"), CODE.indexOf("vm.collectible = collectible"));
        expect(loop).toContain("await clock.time(\"collectible_ms\"");
        expect(loop).not.toContain("Promise.all");
    });

    it("nothing was deferred, cached or dropped to buy the saving", () => {
        expect(CODE).not.toMatch(/setTimeout|unstable_cache|revalidate|\bcache\(/);
    });
});
