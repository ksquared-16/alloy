import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    drawerLayoutDocHasSummaryStripSections,
    splitDrawerLayoutDocShellZones,
} from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";

describe("splitDrawerLayoutDocShellZones", () => {
    it("routes lead_summary to summary strip for opportunity", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const split = splitDrawerLayoutDocShellZones(doc, "opportunity");
        expect(split.summarySectionKeys).toEqual(["lead_summary"]);
        expect(split.bodySectionKeys).toEqual([
            "children_enrollment",
            "household_contact",
            "lead_source",
            "notes_communication",
            "activity",
        ]);
        expect(split.summaryDoc.sections).toHaveLength(1);
        expect(split.bodyDoc.sections).toHaveLength(5);
    });

    it("returns full body doc for person when no summary keys are registered", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const split = splitDrawerLayoutDocShellZones(doc, "person");
        expect(split.summarySectionKeys).toEqual([]);
        expect(split.bodySectionKeys).toEqual(doc.sections.map((s) => s.key));
        expect(drawerLayoutDocHasSummaryStripSections(doc, "person")).toBe(false);
    });
});
