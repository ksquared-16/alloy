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
            rpc: () => ({
                then: (r: (v: unknown) => unknown) => { held.push({ table: "rpc", release: () => r({ data: [], error: null }) }); },
            }),
        } as never,
        held,
    };
}

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
    it("four waves, not seven", async () => {
        const waves = await waveStructure();
        expect(
            waves.length,
            `the build waited on ${waves.length} round trips: ${waves.map((w, i) => `[${i + 1}] ${w.join("+")}`).join(" → ")}`,
        ).toBeLessThanOrEqual(4);
    });

    it("the org-grain reads go out first, before anything is known about the family", async () => {
        const waves = await waveStructure();
        for (const table of ["gl_account_mappings", "gl_accounts", "financial_charge_templates", "financial_policies"]) {
            expect(waveOf(waves, table), `${table} depends only on the org and belongs in wave 1`).toBe(0);
        }
        expect(waveOf(waves, "child_enrollment_agreements"), "the agreements are the first family question").toBe(0);
    });

    it("everything the charges unlock is asked in ONE wave, not one resolver at a time", async () => {
        const waves = await waveStructure();
        const chargeKeyed = [
            "payment_allocations",
            "financial_responsibility_allocations",
            "financial_subsidy_claim_lines",
            "payment_collection_attempts",
        ];
        const at = chargeKeyed.map((t) => waveOf(waves, t));
        expect(at.every((w) => w >= 0), `all of ${chargeKeyed.join(", ")} are read`).toBe(true);
        expect(
            new Set(at).size,
            `these are all keyed by charge id and belong together: ${chargeKeyed.map((t, i) => `${t}@${at[i] + 1}`).join(", ")}`,
        ).toBe(1);
    });

    it("the collectible position does not wait for the payments composition", async () => {
        const waves = await waveStructure();
        expect(
            waveOf(waves, "financial_subsidy_claim_lines"),
            "the collectible facts are charge-keyed, so they ride with the other charge-keyed reads",
        ).toBe(waveOf(waves, "payment_allocations"));
    });

    it("the payer candidates are not chained behind the responsibility resolution", async () => {
        const waves = await waveStructure();
        expect(
            waveOf(waves, "customer_persons"),
            "the candidates read is keyed by household; responsibility only decorates its rows",
        ).toBeLessThanOrEqual(waveOf(waves, "payment_responsibility_attributions"));
    });

    it("attributions, party names and expected funding share one wave", async () => {
        const waves = await waveStructure();
        const at = ["payment_responsibility_attributions", "persons", "financial_expected_funding"]
            .map((t) => waveOf(waves, t));
        expect(at.every((w) => w >= 0), "all three are read").toBe(true);
        expect(new Set(at).size, `all three hang off the allocations alone: wave ${at.join(", ")}`).toBe(1);
    });

    it("collapsing the waves did not drop a read", async () => {
        const tables = (await waveStructure()).flat();
        for (const table of [
            "child_enrollment_agreements", "customer_members", "charges", "financial_policies",
            "payment_allocations", "financial_responsibility_allocations", "financial_subsidy_claim_lines",
            "payment_responsibility_attributions", "financial_expected_funding", "persons",
            "customer_persons", "payments", "financial_subsidy_claims",
        ]) {
            expect(tables, `${table} is still read`).toContain(table);
        }
    });
});
