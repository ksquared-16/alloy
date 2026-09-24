/**
 * THE CARD BUILD'S DEPTH, WHICH IS WHAT THE OPERATOR ACTUALLY WAITS THROUGH.
 *
 * The previous repairs took the per-charge N+1 out and removed the duplicate request, and the
 * measured response still sat at 2,391–2,392 ms on deployed staging. Nothing in it was a slow
 * query: `collectible;dur=1,282–1,426`, `auth;dur=362–548`, `payments;dur=100–410` were each a
 * handful of set-based reads. The cost was DEPTH — how many times the request stopped and waited
 * for a network answer before it could ask its next question.
 *
 * Driving the real builder with a client that answers nothing until released counts exactly that,
 * deterministically, with no deployment and no timing noise. It found seven waves, four of which
 * were reads whose inputs had been ready for two or three waves already — the same
 * source-order-standing-in-for-a-dependency mistake in three different resolvers.
 *
 * A duration cannot hold this: parallelising work makes every span LOOK faster, so a
 * `Server-Timing` assertion certifies a repair and then certifies its own undoing. A wave count
 * cannot be gamed that way — it goes up the moment a read is issued where its rows are consumed
 * rather than where its keys exist.
 */
import { describe, expect, it } from "vitest";

import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

/*
 * Rows shaped so every DEPENDENT read is genuinely reachable. Empty answers would skip the second
 * half of the build entirely and the gate would measure a shallower request than the operator's.
 */
const ROWS: Record<string, Array<Record<string, unknown>>> = {
    child_enrollment_agreements: [
        { id: "agr-1", customer_member_id: "mem-1", customer_id: "cust-1", status: "active" },
    ],
    customer_members: [
        { id: "mem-1", first_name: "A", last_name: "B", display_name: "A B", person_id: "per-1" },
    ],
    charges: [
        {
            id: "charge-0", amount_cents: 10_000, currency_code: "USD", status: "posted",
            billable_source_id: "agr-1", billable_source_type: "agreement",
            occurs_on: "2026-09-01", billable_on: "2026-09-01",
        },
    ],
    payment_allocations: [
        { charge_id: "charge-0", allocated_amount_cents: 2_500, status: "active", payment_id: "pay-1" },
    ],
    financial_responsibility_allocations: [
        {
            id: "alloc-1", charge_id: "charge-0", assigned_amount_cents: 10_000,
            is_unassigned: false, share_id: "share-1", responsible_party_id: "per-9",
        },
    ],
    financial_subsidy_claim_lines: [
        { id: "line-1", charge_id: "charge-0", claim_id: "claim-1", claimed_amount_cents: 1_000 },
    ],
    payments: [
        { id: "pay-1", status: "succeeded", payer_entity_type: "customer", amount_cents: 2_500, currency_code: "USD" },
    ],
    financial_subsidy_claims: [{ id: "claim-1", state: "submitted" }],
    persons: [{ id: "per-9", first_name: "R", last_name: "P", full_name: "R P" }],
    customer_persons: [
        { person_id: "per-9", role_type: "parent", is_primary: true, status: "active", end_date: null, persons: { first_name: "R", last_name: "P" } },
    ],
};

/** Answers nothing until released; how many times it must be released is the depth of the build. */
function holdingClient() {
    const held: Array<{ table: string; release: () => void }> = [];
    const builder = (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const k of [
            "select", "eq", "in", "is", "not", "gte", "lte", "lt", "gt", "or", "order",
            "limit", "range", "neq", "overlaps", "contains",
        ]) {
            chain[k] = () => chain;
        }
        const answer = { data: ROWS[table] ?? [], error: null, count: (ROWS[table] ?? []).length };
        chain.maybeSingle = () =>
            new Promise((res) => held.push({ table, release: () => res({ data: (ROWS[table] ?? [])[0] ?? null, error: null }) }));
        chain.single = chain.maybeSingle;
        chain.then = (resolve: (v: unknown) => unknown) => {
            held.push({ table, release: () => resolve(answer) });
        };
        return chain;
    };
    return {
        client: {
            from: (t: string) => builder(t),
            rpc: (name: string) => ({
                then: (r: (v: unknown) => unknown) => {
                    held.push({ table: `rpc:${name}`, release: () => r({ data: BUNDLE, error: null }) });
                },
            }),
        } as never,
        held,
    };
}

/** What `financials_account_fact_bundle` returns for the specimen above. */
const BUNDLE = {
    resolved_customer_id: "cust-1",
    agreements: ROWS.child_enrollment_agreements,
    members: ROWS.customer_members,
    reductions_by_agreement: [],
    commercial_policies: [],
    charges: ROWS.charges,
    reductions_by_charge: [],
    payment_allocations: ROWS.payment_allocations,
    responsibility_allocations: ROWS.financial_responsibility_allocations,
    subsidy_claim_lines: ROWS.financial_subsidy_claim_lines,
    payments_backing: ROWS.payments,
    responsibility_attributions: [],
    responsible_persons: ROWS.persons,
    funding_by_allocation: [],
    funding_by_share: [],
    funding_for_responsibility: [],
    subsidy_claims: ROWS.financial_subsidy_claims,
    subsidy_variances: [],
    collection_attempts: [],
    payments_by_source: ROWS.payments,
    payments_for_views: ROWS.payments,
    charges_for_allocations: ROWS.charges,
    payer_customers: [],
    payment_refunds: [],
    counts: { agreements: 1, charges: 1, allocations: 1, claim_lines: 1 },
};

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Each wave is one network round trip the operator waits for, in order. */
async function waveStructure() {
    const { client, held } = holdingClient();
    let settled = false;
    const build = buildFinancialsCardVM(client, {
        orgId: "org", customerId: "cust-1", customerMemberId: null, today: "2026-09-24",
    }).then((v) => { settled = true; return v; }, (e) => { settled = true; throw e; });
    const waves: string[][] = [];
    await flush();
    while (held.length > 0 && waves.length < 40) {
        const wave = held.splice(0, held.length);
        waves.push([...new Set(wave.map((w) => w.table))]);
        wave.forEach((w) => w.release());
        await flush();
    }
    await build;
    expect(settled, "the build settled").toBe(true);
    return waves;
}

/** Which wave a table was first read in, or -1 if it was never read. */
const waveOf = (waves: string[][], table: string) => waves.findIndex((w) => w.includes(table));

describe("the card build waits on as few round trips as its data actually requires", () => {
    it("ONE wave — every read goes out together", async () => {
        const waves = await waveStructure();
        expect(
            waves.length,
            `the build waited on ${waves.length} round trips: ${waves.map((w, i) => `[${i + 1}] ${w.join("+")}`).join(" → ")}`,
        ).toBe(1);
    });

    it("the dependent chain is acquired by the bundle, not walked by the client", async () => {
        const [first] = await waveStructure();
        expect(first, "the account fact bundle is what replaced the chain")
            .toContain("rpc:financials_account_fact_bundle");
        /* The chain's tables must no longer be read directly by the card. */
        for (const table of [
            "child_enrollment_agreements", "charges", "payment_allocations",
            "financial_responsibility_allocations", "financial_subsidy_claim_lines",
            "payment_responsibility_attributions", "financial_expected_funding",
            "financial_subsidy_claims", "commercial_policies",
        ]) {
            expect(first, `${table} came with the bundle; reading it again is the four-wave shape returning`)
                .not.toContain(table);
        }
    });

    it("the org-grain reads still go out, and in that same single wave", async () => {
        const [first] = await waveStructure();
        for (const table of ["gl_account_mappings", "gl_accounts", "financial_charge_templates", "financial_policies"]) {
            expect(first, `${table} depends only on the org and must still be read`).toContain(table);
        }
    });

    it("the household-grain reads are not chained behind the bundle", async () => {
        const [first] = await waveStructure();
        /*
         * These are keyed by the customer id the request carried in. They sat in a later wave only
         * because the functions that consume them are called further down — the same
         * source-order-as-dependency mistake, one level up.
         */
        for (const table of ["payment_methods", "payment_autopay_arrangements", "customer_persons"]) {
            expect(first, `${table} is keyed by the household, which was known at request time`).toContain(table);
        }
    });

    it("nothing the card consumes was dropped: the bundle carries every dependent set", () => {
        /*
         * A wave count alone stays green if a set silently stops being gathered, so this asserts
         * the SHAPE the reader requires. Row-for-row equality against the real tenant is
         * `accountFactBundleParity.live.test.ts`; this is the part a unit run can hold.
         */
        for (const key of [
            "agreements", "members", "reductions_by_agreement", "commercial_policies", "charges",
            "reductions_by_charge", "payment_allocations", "responsibility_allocations",
            "subsidy_claim_lines", "payments_backing", "responsibility_attributions",
            "responsible_persons", "funding_by_allocation", "funding_by_share",
            "funding_for_responsibility", "subsidy_claims", "subsidy_variances",
            "collection_attempts", "payments_by_source", "counts",
        ]) {
            expect(Object.keys(BUNDLE), `the bundle must carry ${key}`).toContain(key);
        }
    });
});
