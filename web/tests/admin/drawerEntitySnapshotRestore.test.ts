import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("drawer stack snapshot restore", () => {
    it("AdminEntityDrawer continuously snapshots open drawer entity", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("peekDrawerEntitySnapshot");
        expect(drawer).toContain("putDrawerEntitySnapshot(drawer.type, drawer.id, data");
    });

    it("prefetches person before navigation from inquiry children", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("prefetchPersonDrawerSnapshot");
        const children = read("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(children).toContain("prefetchPersonDrawerSnapshot");
    });
});
