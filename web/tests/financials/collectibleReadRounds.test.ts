/**
 * THE COLLECTIBLE READ MUST NOT SPEND MORE ROUND TRIPS THAN ITS DEPENDENCIES REQUIRE.
 *
 * The per-charge N+1 came out in the previous slice, and `collectible;dur=` still measured
 * 1,414–1,997 ms of a 2,677–3,446 ms response on deployed staging — the largest span left. The
 * cause was not how many rows were read but how many TIMES the reader waited: `readPositionFacts`
 * issued four charge-keyed reads together, then payments, then expected funding, then the subsidy
 * claim/variance pair, as three consecutive awaits. None of those three consumes another's result;
 * every one of them is keyed by ids that round one already produced.
 *
 * A duration cannot hold that. A COUNT OF ROUNDS can, and it is the thing that regresses: the same
 * source-order-as-dependency mistake would reappear the moment a new dependent read is added where
 * its rows are first used. So this drives the real reader with a client that answers nothing until
 * released, and counts the waves it has to release.
 */
import { describe, expect, it } from "vitest";

import { resolveCollectiblePositionsForCharges } from "@/lib/financials/workspace/resolveFinancialPosition";

/** Rows shaped so the DEPENDENT reads are genuinely reachable — empty rows would issue none. */
const ROWS: Record<string, Array<Record<string, unknown>>> = {
    charges: [{ id: "charge-0", amount_cents: 10_000, currency_code: "USD", status: "posted" }],
    financial_reduction_applications: [],
    payment_allocations: [
        { charge_id: "charge-0", allocated_amount_cents: 2_500, status: "active", payment_id: "pay-1" },
    ],
    financial_responsibility_allocations: [
        { id: "alloc-1", charge_id: "charge-0", assigned_amount_cents: 10_000, is_unassigned: false, share_id: "share-1" },
    ],
    financial_subsidy_claim_lines: [
        { id: "line-1", charge_id: "charge-0", claim_id: "claim-1", claimed_amount_cents: 1_000 },
    ],
    payments: [{ id: "pay-1", status: "succeeded", payer_entity_type: "customer" }],
    financial_expected_funding: [],
    financial_subsidy_claims: [{ id: "claim-1", state: "submitted" }],
    financial_subsidy_variances: [],
};

/**
 * A client that HOLDS every query until the test releases it. Releasing all currently-held
 * queries at once is one round trip; how many times that has to happen is the depth of the read.
 */
function holdingClient() {
    const held: Array<{ table: string; release: () => void }> = [];
    const builder = (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const k of ["select", "eq", "in", "is", "not", "gte", "lte", "order", "limit", "range"]) {
            chain[k] = () => chain;
        }
        const answer = { data: ROWS[table] ?? [], error: null };
        chain.maybeSingle = () =>
            new Promise((res) => held.push({ table, release: () => res({ data: null, error: null }) }));
        chain.then = (resolve: (v: unknown) => unknown) => {
            held.push({ table, release: () => resolve(answer) });
        };
        return chain;
    };
    return { client: { from: (t: string) => builder(t) } as never, held };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Every wave is one network round trip the operator waits for, in order. */
async function roundsFor(run: (client: never) => Promise<unknown>) {
    const { client, held } = holdingClient();
    let settled = false;
    const done = run(client).then(
        (v) => { settled = true; return v; },
        (e) => { settled = true; throw e; },
    );
    const waves: string[][] = [];
    await flush();
    while (held.length > 0 && waves.length < 25) {
        const wave = held.splice(0, held.length);
        waves.push(wave.map((w) => w.table).sort());
        wave.forEach((w) => w.release());
        await flush();
    }
    await done;
    expect(settled, "the reader settled").toBe(true);
    return waves;
}

const run = (client: never) =>
    resolveCollectiblePositionsForCharges(client, { orgId: "org", chargeIds: ["charge-0"] });

describe("the collectible read's depth, not just its width", () => {
    it("resolves in two round trips: the charge-keyed reads, then everything they unlock", async () => {
        const waves = await roundsFor(run);
        expect(
            waves.length,
            `waited on ${waves.length} round trips: ${JSON.stringify(waves)}`,
        ).toBeLessThanOrEqual(2);
    });

    it("issues the four charge-keyed reads together, not one behind another", async () => {
        const [first] = await roundsFor(run);
        for (const table of [
            "financial_reduction_applications",
            "payment_allocations",
            "financial_responsibility_allocations",
            "financial_subsidy_claim_lines",
        ]) {
            expect(first, `${table} must go out with the other charge-keyed reads`).toContain(table);
        }
    });

    it("issues payments, expected funding and the claim pair together, not in three waves", async () => {
        const waves = await roundsFor(run);
        const second = waves[1] ?? [];
        for (const table of ["payments", "financial_expected_funding", "financial_subsidy_claims"]) {
            expect(
                second,
                `${table} depends only on the first round, so it belongs in the second — waves: ${JSON.stringify(waves)}`,
            ).toContain(table);
        }
    });

    it("the variance read rides with its claim, because both are keyed off the claim lines", async () => {
        const waves = await roundsFor(run);
        const claimWave = waves.findIndex((w) => w.includes("financial_subsidy_claims"));
        const varianceWave = waves.findIndex((w) => w.includes("financial_subsidy_variances"));
        /* With no variance rows to read the query is skipped entirely; when present it must not add a wave. */
        if (varianceWave >= 0) expect(varianceWave).toBe(claimWave);
    });

    it("collapsing the waves did not drop a read", async () => {
        const waves = await roundsFor(run);
        const tables = waves.flat();
        for (const table of [
            "charges",
            "financial_reduction_applications",
            "payment_allocations",
            "financial_responsibility_allocations",
            "financial_subsidy_claim_lines",
            "payments",
            "financial_subsidy_claims",
            "financial_subsidy_variances",
        ]) {
            expect(tables, `${table} is still read`).toContain(table);
        }
    });

    it("the charge read does not gate the facts: both go out in the first wave", async () => {
        const [first] = await roundsFor((client) =>
            resolveCollectiblePositionsForCharges(client, { orgId: "org", chargeIds: ["charge-0"] }),
        );
        expect(first, "the charges read starts with the facts, not before them").toContain("charges");
    });
});
