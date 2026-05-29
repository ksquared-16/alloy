import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("Person drawer premium primitives", () => {
    it("PersonDrawerContextPanel uses shared header and restores back link slot", () => {
        const src = read("components/admin/entity/PersonDrawerContextPanel.tsx");
        expect(src).toContain("RecordDrawerContextPanel");
        expect(src).toContain("RecordDrawerPremiumHeader");
        expect(src).toContain("backLink");
        expect(src).not.toContain("PersonDrawerAboveFoldSnapshot");
    });

    it("AdminEntityDrawer wires person context panel with back link", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("PersonDrawerContextPanel");
        expect(drawer).toContain("Back to");
        expect(drawer).toContain("personRecordChromeBodyShell");
    });

    it("uses premium section surface for adminV2 person drawer", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toMatch(/sectionSurface=\{[\s\S]*drawer\.type === "persons"/);
    });
});
