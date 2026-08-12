import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("person drawer perf follow-up wiring", () => {

    it("View Person hover and pointerdown prefetch uses persons entity endpoint", () => {
        const card = read("components/admin/opportunity/EditablePersonContactCard.tsx");
        expect(card).toContain("prefetchViewPersonOnHover");
        expect(card).toContain("prefetchViewPersonOnPointerDown");
    });

    it("prefetch and open modules emit perf log tags", () => {
        const prefetch = read("lib/admin/prefetchPersonDrawerSnapshot.ts");
        const open = read("lib/admin/drawer/openViewPersonFromOpportunity.ts");
        const logs = read("lib/admin/drawer/personDrawerPerfLogs.ts");
        expect(prefetch).toContain("logPersonPrefetch");
        expect(open).toContain("isPersonDrawerSnapshotWarm");
        expect(logs).toContain("perfDrawer");
        expect(logs).toContain("logDrawerBackRestore");
    });
});
