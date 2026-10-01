import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const COLLECTIBLE = "lib/financials/payments/autopayCollectible.ts";
const ATTEMPT = "lib/financials/payments/collectionAttempt.ts";
const POSITION = "lib/financials/subsidy/collectiblePosition.ts";

/**
 * FOUND BY REAL-CLOCK CERTIFICATION, not by a unit test.
 *
 * On the 2026-09-29T21:00Z unattended run, Autopay created two collection attempts and had a
 * third charge REFUSED with `amount_exceeds_collectible`. The refusal was correct; the request
 * was not. Autopay asked for the charge's raw outstanding, and the collection engine measures a
 * request against the COLLECTIBLE ceiling.
 *
 * Those differ by exactly the submitted subsidy claim. So a subsidised charge was refused on
 * every daily wake and could never be collected by Autopay at all — silently, because each wake
 * reported itself completed and simply collected less than the family owed.
 */
describe("Autopay asks for what may be collected, not what is owed", () => {
    it("requests the collectible ceiling for each due charge", () => {
        const src = code(COLLECTIBLE);
        expect(src).toMatch(/resolveFamilyCollectible\(supabase, \{ orgId, chargeId \}\)/);
        expect(src).toMatch(/currentlyCollectibleCents/);
    });

    it("no longer requests the raw outstanding balance", () => {
        /* The exact line that made every subsidised charge uncollectible. */
        const src = code(COLLECTIBLE);
        expect(src, "raw outstanding is what the engine refuses").not.toMatch(
            /outstandingCents:\s*balance\.outstandingCents/,
        );
        expect(src).not.toMatch(/readChargeBalance\(/);
    });

    it("skips a charge with nothing collectible rather than requesting zero", () => {
        const src = code(COLLECTIBLE);
        expect(src).toMatch(/collectibleCents <= 0\) continue/);
    });

    it("the engine still refuses an over-ask — the guard is not weakened", () => {
        /*
         * The repair narrows what Autopay REQUESTS. It must not touch the ceiling itself: a clamp
         * inside the engine would take a different amount than was authorized and tell nobody.
         */
        const src = code(ATTEMPT);
        expect(src).toMatch(/requestedAmountCents > collectible\.currentlyCollectibleCents/);
        expect(src).toMatch(/amount_exceeds_collectible/);
    });

    it("the ceiling remains outstanding minus the submitted claim, unchanged", () => {
        const src = code(POSITION);
        expect(src).toMatch(/Math\.max\(0, outstandingCents - submittedClaimSuppressionCents\)/);
    });

    it("collecting the collectible can only narrow what Autopay takes", () => {
        /*
         * `currentlyCollectibleCents = max(0, outstanding - suppression)` and suppression is never
         * negative, so the requested amount is always <= the old one. This repair cannot broaden
         * economics, which is why it is a repair and not a policy change.
         */
        const src = read(POSITION);
        const m = src.match(/currentlyCollectibleCents:\s*Math\.max\(0,\s*outstandingCents\s*-\s*(\w+)\)/);
        expect(m, "the ceiling is a subtraction from outstanding").toBeTruthy();
        expect(m?.[1]).toBe("submittedClaimSuppressionCents");
    });
});
