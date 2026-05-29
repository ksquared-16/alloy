import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("OpportunityInquiryChildrenSection grid layout", () => {
    it("gives Desired Start more width and keeps DOB compact without truncate", () => {
        const src = read("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(src).toContain("INQUIRY_CHILD_DOB_CELL");
        expect(src).toContain("whitespace-nowrap");
        expect(src).toContain("minmax(6.5rem");
        expect(src).toContain("minmax(7.75rem");
        expect(src).toContain(" · ${age}");
        expect(src).not.toContain("minmax(8.75rem");
    });
});
