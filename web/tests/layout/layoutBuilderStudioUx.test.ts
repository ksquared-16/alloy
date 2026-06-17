/**
 * Layout builder studio UX helpers — tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { addCustomOpportunityDrawerSection } from "@/lib/layout/layoutEditorGeneratedKeys";
import {
    buildAddSuccessMessage,
    diffNewSectionKeys,
    isPlatformOwnedDrawerSection,
    resolvePaletteTargetSectionId,
    shouldShowLayoutBuilderStartGuide,
} from "@/lib/layout/layoutBuilderStudioUx";

describe("layoutBuilderStudioUx", () => {
    it("diffNewSectionKeys finds sections added between doc snapshots", () => {
        const before = buildLeadDrawerDefaultDoc();
        const after = addCustomOpportunityDrawerSection(before, { title: "New card", zone: "main" });
        const added = diffNewSectionKeys(before, after);
        expect(added).toHaveLength(1);
        expect(after.sections.some((s) => s.key === added[0])).toBe(true);
    });

    it("resolvePaletteTargetSectionId prefers selected valid section", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = resolvePaletteTargetSectionId(doc, "lead_source", "field");
        expect(result.sectionId).toBe("lead_source");
        expect(result.reason).toBeUndefined();
    });

    it("resolvePaletteTargetSectionId falls back to KPI strip for widgets", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = resolvePaletteTargetSectionId(doc, "lead_source", "widget");
        expect(result.sectionId).toBe("lead_summary");
    });

    it("buildAddSuccessMessage describes created sections", () => {
        expect(
            buildAddSuccessMessage({
                itemLabel: "text block",
                sectionTitle: "Custom section 1",
                zoneLabel: "main content",
                createdSection: true,
            }),
        ).toContain("Created");
        expect(
            buildAddSuccessMessage({
                itemLabel: "Tour summary",
                sectionTitle: "Lead Summary",
                zoneLabel: "KPI strip",
            }),
        ).toContain("Tour summary");
    });

    it("does not flag drawer cards as platform-owned in experience builder", () => {
        expect(isPlatformOwnedDrawerSection("household_contact")).toBe(false);
        expect(isPlatformOwnedDrawerSection("lead_summary")).toBe(false);
        expect(isPlatformOwnedDrawerSection("lead_source")).toBe(false);
    });

    it("shows start guide for sparse layouts", () => {
        const sparse = { ...buildLeadDrawerDefaultDoc(), sections: [] };
        expect(shouldShowLayoutBuilderStartGuide(sparse)).toBe(true);
    });
});
