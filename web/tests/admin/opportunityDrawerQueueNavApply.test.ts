import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("AdminDrawerContext opportunity queue navigation", () => {
    it("applies warm navigation immediately and prefetches target + adjacents", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("applyOpportunityQueueNavigation");
        expect(ctx).toContain("prefetchOpportunityDrawerOnRowIntent(targetId");
        expect(ctx).toContain("prefetchAdjacentOpportunityDrawers");
        expect(ctx).toMatch(/primaryWarm && bootstrapWarm[\s\S]*applyOpportunityQueueNavigation/);
        expect(ctx).toContain("drawer_nav_generation");
    });
});
