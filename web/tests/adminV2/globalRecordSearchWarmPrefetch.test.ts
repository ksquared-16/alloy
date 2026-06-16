import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("globalRecordSearchWarmPrefetch", () => {
    it("warms opportunity and person drawer intent on search hover", () => {
        const warm = read("lib/adminV2/globalRecordSearchWarmPrefetch.ts");
        expect(warm).toContain("warmGlobalSearchHitDrawerIntent");
        expect(warm).toContain("prefetchOpportunityDrawerOnRowIntent");
        expect(warm).toContain("prefetchPersonDrawerSnapshot");
        expect(warm).toContain("prepareDrawerViewModelDeduped");
        const box = read("app/adminV2/components/GlobalSearchBox.tsx");
        expect(box).toContain("warmGlobalSearchHitDrawerIntent");
    });
});
