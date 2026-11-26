/**
 * THE BALANCE AUTHORITY READS THE WHOLE LEDGER, OR SAYS IT CANNOT (N1).
 *
 * ── THE DEFECT THIS LOCKS ──
 *
 * `buildFinancialsCardVM` asked for an account's charges in one query. PostgREST answers at most
 * `db-max-rows` — 1,000 on this deployment — and says nothing about it: no error, no header the
 * code read. The card then computed balance, collectible and past due from the first thousand rows
 * of a longer ledger and presented the result as the account's position.
 *
 * Measured on the certification tenant before the repair: 2,821 charges on the account, 1,000
 * returned, and the Financials Workspace — which already paged — reporting a different figure for
 * the same family. Two surfaces, two numbers, one account.
 *
 * ── WHY THE FAKE CAPS AT 1,000 ──
 *
 * A fake that returns everything it holds cannot fail this way, so it would certify nothing. This
 * one behaves like the server: it honours `.range()` and never returns more than `PAGE_CAP` rows,
 * which is the only thing that makes "2,000 charges" a different test from "3 charges".
 */
import { describe, expect, it } from "vitest";

import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

const TODAY = "2026-09-17";
const ORG = "org-1";
const HOUSEHOLD = "cust-1";
const AGREEMENT = "agr-1";
/** The server's row ceiling, reproduced. Not a tuning knob — the thing under test. */
const PAGE_CAP = 1000;

type Row = Record<string, unknown>;

/**
 * A supabase fake that pages like PostgREST.
 *
 * `.range(from, to)` slices; every response is truncated to `PAGE_CAP`; and a query with no range
 * gets the first `PAGE_CAP` rows — exactly the silent behaviour the repair exists to survive.
 */
function pagingClient(fixture: Record<string, Row[]>, trips: { table: string; from: number | null }[] = []) {
    const build = (table: string) => {
        let one = false;
        let from: number | null = null;
        let to: number | null = null;
        /*
         * `eq` and `in` are honoured, because the batched reads this repair touches send the SAME
         * table 25 requests with different id slices. A fake that ignored the filter would answer
         * each one with every row and count one receipt twenty-five times — which is a fake defect
         * wearing the shape of a product defect.
         */
        const filters: Array<(row: Row) => boolean> = [];
        const self: Record<string, unknown> = {};
        for (const m of ["neq", "gt", "gte", "lt", "lte", "not", "or",
            "order", "limit", "filter", "contains", "overlaps", "match", "returns", "abortSignal", "select"]) {
            self[m] = () => self;
        }
        /*
         * A column the fixture does not carry is not a filter. These rows are deliberately minimal —
         * they omit `org_id` and other tenancy columns the real tables have — and a fake that
         * filtered on an absent column would answer every read with nothing, which proves only that
         * the fixture is small.
         */
        const carries = (col: string) => (fixture[table] ?? []).some((row) => col in row);
        self.eq = (col: string, value: unknown) => {
            if (carries(col)) filters.push((row) => row[col] === value);
            return self;
        };
        self.in = (col: string, values: unknown[]) => {
            if (carries(col)) {
                const set = new Set(values);
                filters.push((row) => set.has(row[col]));
            }
            return self;
        };
        self.is = (col: string, value: unknown) => {
            if (carries(col)) filters.push((row) => (value === null ? row[col] == null : row[col] === value));
            return self;
        };
        self.range = (f: number, t: number) => { from = f; to = t; return self; };
        self.maybeSingle = () => { one = true; return self; };
        self.single = () => { one = true; return self; };
        self.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
            try {
                const all = (fixture[table] ?? []).filter((row) => filters.every((f) => f(row)));
                const start = from ?? 0;
                const endExclusive = to == null ? start + PAGE_CAP : Math.min(to + 1, start + PAGE_CAP);
                const page = all.slice(start, endExclusive);
                trips.push({ table, from });
                return Promise.resolve(onOk({ data: one ? (page[0] ?? null) : page, error: null }));
            } catch (e) {
                return onErr ? Promise.resolve(onErr(e)) : Promise.reject(e);
            }
        };
        return self;
    };
    /*
     * ── THE BUNDLE IS NOT PAGE-CAPPED, AND THAT IS THE POINT ────────────────────────────────────
     *
     * The defect this file locks was PostgREST's silent row ceiling: a balance computed from the
     * first thousand rows of a longer ledger. The account fact bundle answers as one jsonb value,
     * so the ceiling does not apply to it — which is why this fake serves the RPC WITHOUT the cap
     * while still capping every table read. If the card ever walks the tables again, it meets the
     * cap again and these tests fail, which is exactly the regression worth catching.
     */
    const rpcBundle = () => {
        const all = (t: string) => fixture[t] ?? [];
        const agreements = all("child_enrollment_agreements");
        const charges = all("charges");
        trips.push({ table: "rpc:financials_account_fact_bundle", from: null });
        return {
            resolved_customer_id: HOUSEHOLD,
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
            funding_for_responsibility: [],
            subsidy_claims: all("financial_subsidy_claims"),
            subsidy_variances: [],
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
    };
    return {
        from: (tbl: string) => build(tbl),
        rpc: (name: string) =>
            name === "financials_account_fact_bundle"
                ? { then: (r: (v: unknown) => unknown) => r({ data: rpcBundle(), error: null }) }
                : build("(rpc)"),
    } as never;
}

function charge(i: number, over: Row = {}): Row {
    return {
        id: `chg-${String(i).padStart(5, "0")}`,
        billable_source_type: "child_enrollment_agreement",
        billable_source_id: AGREEMENT,
        source_charge_id: null,
        charge_category: "tuition",
        charge_type: "tuition",
        status: "posted",
        amount_cents: 10_000,
        currency_code: "USD",
        charge_template_id: null,
        service_date: TODAY,
        occurs_on: TODAY,
        billable_on: TODAY,
        /* Due before today, so PAST DUE is exercised rather than merely present. */
        due_date: "2026-08-01",
        posted_at: `${TODAY}T00:00:00Z`,
        voided_at: null,
        description: "tuition",
        metadata: {},
        created_at: `${TODAY}T00:00:00Z`,
        ...over,
    };
}

function fixture(chargeCount: number, extra: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
    return {
        child_enrollment_agreements: [
            { id: AGREEMENT, customer_member_id: "mem-1", customer_id: HOUSEHOLD, status: "active" },
        ],
        customer_members: [{ id: "mem-1", first_name: "Certa", last_name: "Child", display_name: "Certa" }],
        charges: Array.from({ length: chargeCount }, (_, i) => charge(i + 1)),
        gl_account_mappings: [],
        gl_accounts: [],
        financial_charge_templates: [],
        payment_provider_merchants: [],
        payment_allocations: [],
        payments: [],
        financial_responsibility_allocations: [],
        financial_expected_funding: [],
        financial_subsidy_claim_lines: [],
        financial_subsidy_claims: [],
        financial_subsidy_variances: [],
        financial_reduction_applications: [],
        payment_responsibility_attributions: [],
        persons: [],
        customers: [{ id: HOUSEHOLD, name: "Certification Household" }],
        financial_policies: [],
        ...extra,
    } as Record<string, Row[]>;
}

async function cardFor(fx: Record<string, Row[]>) {
    return await buildFinancialsCardVM(pagingClient(fx), { orgId: ORG, customerId: HOUSEHOLD, today: TODAY });
}

describe("the account balance authority consumes the complete charge cohort", () => {
    it("reads all 1,000 charges when the cohort is exactly one server page", async () => {
        const vm = await cardFor(fixture(1_000));
        expect(vm.unavailableReason ?? null, "a complete cohort is not an unavailability").toBeNull();
        expect(vm.rows.length, "every charge is in the ledger").toBe(1_000);
        // 1,000 × $100. The figure the operator reads.
        expect(vm.reconciliation.grossCents).toBe(10_000_000);
        expect(vm.reconciliation.balanceCents).toBe(10_000_000);
    });

    it("reads all 2,000 charges — the case a single page silently answered with half", async () => {
        const vm = await cardFor(fixture(2_000));
        expect(vm.unavailableReason ?? null).toBeNull();
        /*
         * BEFORE THE REPAIR this was 1,000 and $10,000,000 — a number that looks like an answer.
         * The assertion is on the whole cohort, so a reader that pages once cannot pass it.
         */
        expect(vm.rows.length).toBe(2_000);
        expect(vm.reconciliation.grossCents).toBe(20_000_000);
        expect(vm.reconciliation.balanceCents).toBe(20_000_000);
    });

    it("counts a payment applied to a charge beyond the first page, not just the charges it could see", async () => {
        /*
         * The point of the case: the settled charge is row 1,500. A reader that stops at 1,000 never
         * sees the obligation the money answered, so the receipt has nothing to reduce and the
         * family is shown a balance they have already partly paid.
         */
        const fx = fixture(2_000, {
            payments: [
                {
                    id: "pay-1",
                    direction: "inbound",
                    refunds_payment_id: null,
                    reversal_origin: null,
                    amount_cents: 10_000,
                    currency: "USD",
                    status: "posted",
                    payment_method: "check",
                    processor: null,
                    received_at: `${TODAY}T09:00:00Z`,
                    posted_at: `${TODAY}T09:00:00Z`,
                    reference_number: null,
                    notes: null,
                    billable_source_type: "child_enrollment_agreement",
                    billable_source_id: AGREEMENT,
                    customer_id: HOUSEHOLD,
                },
            ],
            payment_allocations: [
                {
                    id: "alloc-1",
                    payment_id: "pay-1",
                    charge_id: "chg-01500",
                    allocated_amount_cents: 10_000,
                    status: "active",
                },
            ],
        });
        const vm = await cardFor(fx);
        expect(vm.unavailableReason ?? null).toBeNull();
        expect(vm.rows.length).toBe(2_000);
        expect(vm.reconciliation.grossCents).toBe(20_000_000);
        expect(vm.reconciliation.paymentsCents, "the receipt is counted").toBe(10_000);
        expect(vm.reconciliation.balanceCents, "and it reduces what is owed, exactly once").toBe(19_990_000);

        const settled = vm.rows.find((r) => r.chargeId === "chg-01500");
        expect(settled, "the settled charge is in the ledger at all").toBeTruthy();
        expect(settled!.appliedCents).toBe(10_000);
        expect(settled!.outstandingCents, "past due is the residual, never the face amount").toBe(0);

        /*
         * PAST DUE over the same complete cohort, and it is the RESIDUAL: the settled charge
         * contributes nothing to it, and the 1,999 unsettled ones contribute all of it.
         *
         * `collectible` is deliberately not asserted here. It is the subsidy-aware projection and
         * takes expected funding, claim lines and variances as its own inputs; asserting it against
         * a minimal fixture would test the fixture rather than the cohort. It is proven on
         * authoritative data instead — see `accountCohortParity.live.test.ts`.
         */
        expect(vm.pastDue?.amountCents).toBe(19_990_000);
    });

    it("fails visibly rather than answering from part of the ledger when the platform bound is reached", async () => {
        /*
         * The bound is 25,000. A balance computed from part of a ledger is not incomplete, it is
         * wrong — so the card says it cannot answer. What must never happen is a smaller number
         * presented as the position.
         */
        const vm = await cardFor(fixture(25_001));
        expect(String(vm.unavailableReason ?? ""), "the cap is reported, not absorbed").toMatch(/more than 25,000 charges/i);
        expect(vm.reconciliation.balanceCents, "and no partial figure is offered").toBe(0);
    });
});
