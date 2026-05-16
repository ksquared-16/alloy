import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/workspace/mapWithConcurrency";

describe("mapWithConcurrency", () => {
    it("preserves result order with bounded concurrency", async () => {
        const items = [1, 2, 3, 4, 5];
        const out = await mapWithConcurrency(items, 2, async (n) => {
            await new Promise((r) => setTimeout(r, (6 - n) * 2));
            return n * 10;
        });
        expect(out).toEqual([10, 20, 30, 40, 50]);
    });
});
