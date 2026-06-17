/**
 * Summary strip shell partition — includes layoutZone summary_strip sections.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";

describe("splitDrawerLayoutDocShellZones summary_strip zone", () => {
    it("routes custom summary_strip KPI tiles to the summary doc", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const created = createExperienceBuilderCard(doc, {
            title: "Open Tasks",
            widthKey: "third",
            cardType: "widget",
            widgetKey: "tasks",
        });
        doc = created.doc;
        const split = splitDrawerLayoutDocShellZones(doc, "opportunity");
        expect(split.summarySectionKeys).toContain(created.sectionKey);
        expect(split.bodySectionKeys).not.toContain(created.sectionKey);
    });
});
