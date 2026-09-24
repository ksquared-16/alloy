/**
 * THE COLLECTIBLE READ MUST NOT SCALE WITH THE LEDGER.
 *
 * Measured on deployed staging before this repair, through the card's own Server-Timing:
 *
 *   auth 330ms · perm 200ms · collectible 2,842ms · payments 123ms · policies 122ms · total 3,755ms
 *
 * `collectible` was 76% of the response, and it was O(posted charges): the card asked
 * `resolveFamilyCollectible` for ONE charge at a time, and that resolver issues about six round
 * trips each. The Certhouse specimen has 49 posted charges in the period, so roughly 294 round
 * trips — and the whole request was issued TWICE, so the operator waited ~7.3s for an answer that
 * was ready at ~3.5s.
 *
 * These gates hold the SHAPE of the read, which is the thing that regressed. A counting client is
 * the right instrument here precisely because the question is "how many reads", not "what do they
 * return" — the arithmetic is `computeCollectiblePosition`'s and is tested where it lives.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCollectiblePositionsForCharges, ID_BATCH } from "@/lib/financials/workspace/resolveFinancialPosition";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CARD_VM = "lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts";
const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";

/** A supabase double that counts table reads and answers every query with no rows. */
function countingClient() {
    const reads: string[] = [];
    const builder = (table: string) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        for (const k of ["select", "eq", "in", "is", "not", "gte", "lte", "order", "limit", "range"]) {
            chain[k] = () => self();
        }
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: [], error: null });
        reads.push(table);
        return chain;
    };
    return { client: { from: (t: string) => builder(t) } as never, reads };
}

const charges = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: `charge-${i}`,
        currencyCode: "USD",
        status: "posted",
        amountCents: 10_000,
    }));

describe("the collectible read is per table, not per charge", () => {
    it("one charge and fifty charges cost the same number of reads", async () => {
        const one = countingClient();
        await resolveCollectiblePositionsForCharges(one.client, { orgId: "org", charges: charges(1) });
        const fifty = countingClient();
        await resolveCollectiblePositionsForCharges(fifty.client, { orgId: "org", charges: charges(50) });
        expect(fifty.reads.length, `50 charges cost ${fifty.reads.length} reads, 1 charge cost ${one.reads.length}`)
            .toBe(one.reads.length);
        expect(
            fifty.reads.length,
            "a handful of set-based reads, not one per charge",
        ).toBeLessThan(12);
    });

    it("and it does not grow per charge inside one id batch", async () => {
        const a = countingClient();
        await resolveCollectiblePositionsForCharges(a.client, { orgId: "org", charges: charges(10) });
        const b = countingClient();
        await resolveCollectiblePositionsForCharges(b.client, { orgId: "org", charges: charges(ID_BATCH) });
        expect(b.reads.length).toBe(a.reads.length);
    });

    it("the id batch stays small enough that the request URI cannot overflow", () => {
        /*
         * Asserted as an ABSOLUTE bound, not relative to itself. The first version of the chunking
         * test below compared ID_BATCH against ID_BATCH * 3, so raising the constant scaled the
         * expectation with it and a plant that set it to 100000 stayed green — the exact defect
         * that once answered `URI too long` with null rows and overstated what families owed.
         */
        expect(ID_BATCH).toBeGreaterThan(0);
        expect(ID_BATCH, "an id list this long would overflow the request URI").toBeLessThanOrEqual(200);
    });

    it("it still chunks, so a large cohort cannot overflow the request URI", async () => {
        const small = countingClient();
        await resolveCollectiblePositionsForCharges(small.client, { orgId: "org", charges: charges(ID_BATCH) });
        const big = countingClient();
        await resolveCollectiblePositionsForCharges(big.client, { orgId: "org", charges: charges(ID_BATCH * 3) });
        expect(big.reads.length, "more batches, not more queries per charge").toBeGreaterThan(small.reads.length);
        expect(big.reads.length).toBeLessThanOrEqual(small.reads.length * 3 + 2);
    });

    it("no charges means no reads at all", async () => {
        const none = countingClient();
        const out = await resolveCollectiblePositionsForCharges(none.client, { orgId: "org", charges: [] });
        expect(none.reads.length).toBe(0);
        expect(out.size).toBe(0);
    });
});

describe("the card reaches the shared reader, and the duplicate deep read is gone", () => {
    it("the card VM no longer resolves collectible one charge at a time", () => {
        const vm = code(CARD_VM);
        expect(vm, "it asks the shared batched reader").toMatch(/resolveCollectiblePositionsForCharges\(supabase, \{/);
        expect(
            /resolveFamilyCollectible\(supabase, \{[\s\S]{0,120}chargeId: row\.chargeId/.test(vm),
            "a per-row resolve is the N+1 this slice removed",
        ).toBe(false);
        expect(
            /COLLECTIBLE_CONCURRENCY/.test(vm),
            "bounded concurrency hid the latency and none of the work; it is not needed once the read is set-based",
        ).toBe(false);
    });

    it("a bounded summary no longer discards a completed deep read of the same account", () => {
        const card = code(CARD);
        expect(card, "the guard exists").toMatch(/const fullReadCoversThisAccount =/);
        expect(card, "and it is scoped to THIS account, so subject safety is unchanged").toMatch(
            /deepLoadedForRef\.current === readKey/,
        );
        expect(card, "the in-flight window is covered, which is where the duplicate actually fired").toMatch(
            /deepReadInFlightForRef\.current === readKey/,
        );
        expect(card, "a projection for another subject still clears everything").toMatch(
            /if \(fullReadCoversThisAccount\) return;[\s\S]{0,400}deepLoadedForRef\.current = null;/,
        );
    });

    it("the cohort scan and the card share one implementation", () => {
        const pos = code("lib/financials/workspace/resolveFinancialPosition.ts");
        expect(pos, "the cohort delegates rather than computing a second time").toMatch(
            /positionsByCharge\.get\(v\.charge\.id\)/,
        );
        expect(
            (pos.match(/computeCollectiblePosition\(/g) || []).length,
            "exactly one call site for the arithmetic in this module",
        ).toBe(1);
    });
});
