/**
 * THE ACTION ENVELOPE, BOUND AT BOTH ENDS.
 *
 * `/api/admin/actions/execute` reshapes the executor's answer before it crosses the network. The
 * browser sees the ROUTE's envelope; the executor's internal field names never reach it. Add Charge
 * read the internal ones, so `createdChargeIds` was always empty, `applyChargeDecisions` returned
 * on its first line, and two things silently never ran: the follow-up that makes a charge inherit
 * the standing arrangement — the W7 defect — and the idempotency check, which is why repeated
 * clicks could each report success while creating nothing.
 *
 * Captured verbatim from deployed staging (responsibility/charge-add-response.json):
 *
 *     {"ok":true,"data":{"execution_result":{"write_status":"created",…},
 *                        "affected_id":"77b02ec2-…"},"correlation_id":"…"}
 *
 * ── WHY THIS TEST IS WRITTEN THE WAY IT IS ────────────────────────────────────────────────────
 *
 * The expected key names are DERIVED FROM THE ROUTE, never restated here. A test that hardcoded
 * "affected_id" would keep passing if the route renamed it, which is the same shape of failure it
 * exists to catch — and the previous guard did exactly the inverse, pinning the executor's
 * `affectedId` and staying green for as long as the consumer was broken.
 *
 * So the contract fails from EITHER side: rename the envelope in the route and the consumer no
 * longer reads what the route sends; change the consumer and it no longer reads what the route
 * sends. Neither half can drift alone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const CARD = strip(read("components/admin/focusPanel/cards/FinancialsCard.tsx"));
const ROUTE = strip(read("app/api/admin/actions/execute/route.ts"));

/**
 * The route's own transform, read out of the route: every `<wireKey>: …result.<executorKey>` pair
 * inside the generic success envelope.
 */
function envelopeContract(): Array<{ wireKey: string; executorKey: string }> {
    const pairs: Array<{ wireKey: string; executorKey: string }> = [];
    const re = /(\w+):\s*result\.actionResult\.result\.(\w+)/g;
    for (const m of ROUTE.matchAll(re)) pairs.push({ wireKey: m[1]!, executorKey: m[2]! });
    return pairs;
}

describe("the route states an envelope", () => {
    it("maps executor fields onto wire names", () => {
        const pairs = envelopeContract();
        expect(pairs.length, "the generic success envelope is findable").toBeGreaterThanOrEqual(2);
        /* Sanity: the mapping is a RENAME, not a pass-through — which is the whole trap. */
        expect(pairs.some((p) => p.wireKey !== p.executorKey)).toBe(true);
    });
});

describe("the Add Charge commit reads that envelope and nothing else", () => {
    it("reads every wire key the route sends, under data", () => {
        for (const { wireKey } of envelopeContract()) {
            expect(
                CARD.includes(`json.data?.${wireKey}`),
                `the commit reads json.data.${wireKey}, which is what the route sends`,
            ).toBe(true);
        }
    });

    it("reads no executor-internal name off the response", () => {
        /*
         * Derived from the route, not restated: whatever the executor calls its fields, the browser
         * must not look for them on the wire. This is what was wrong, and naming the old spelling
         * here would only catch the one mistake already made.
         */
        for (const { executorKey } of envelopeContract()) {
            expect(
                CARD.includes(`json.result?.${executorKey}`),
                `json.result.${executorKey} is the executor's shape and never crosses the network`,
            ).toBe(false);
        }
    });

    it("feeds the ids it reads to the follow-up that inherits responsibility", () => {
        expect(/await applyChargeDecisions\(createdChargeIds\)/.test(CARD)).toBe(true);
        /* And the follow-up still refuses an empty list — the honest guard, not the bug. */
        expect(/if \(chargeIds\.length === 0\) return failures;/.test(CARD)).toBe(true);
    });
});
