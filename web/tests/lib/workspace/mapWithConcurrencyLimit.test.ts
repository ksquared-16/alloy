/**
 * Bounded-concurrency map — order preservation + in-flight cap (Trust Closure §8 fan-out bound).
 */

import { describe, it, expect } from "vitest";
import { mapWithConcurrencyLimit } from "@/lib/workspace/mapWithConcurrencyLimit";

describe("mapWithConcurrencyLimit", () => {
    it("preserves input order regardless of completion order", async () => {
        const out = await mapWithConcurrencyLimit([10, 30, 20], 3, async (ms, i) => {
            await new Promise((r) => setTimeout(r, ms));
            return i * 100 + ms;
        });
        expect(out).toEqual([10, 130, 220]);
    });

    it("never runs more than `limit` workers at once", async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        await mapWithConcurrencyLimit(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight--;
            return null;
        });
        expect(maxInFlight).toBeLessThanOrEqual(4);
    });

    it("runs every item exactly once (total requests bounded by item count, not more)", async () => {
        let calls = 0;
        await mapWithConcurrencyLimit(Array.from({ length: 7 }, (_, i) => i), 4, async () => {
            calls++;
            return null;
        });
        expect(calls).toBe(7);
    });

    it("handles an empty list and a limit larger than the list", async () => {
        expect(await mapWithConcurrencyLimit([], 4, async () => 1)).toEqual([]);
        expect(await mapWithConcurrencyLimit([1, 2], 10, async (x) => x * 2)).toEqual([2, 4]);
    });
});
