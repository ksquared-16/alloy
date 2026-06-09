/**
 * Patch 5 — default Lead drawer preset shape and summary-strip partition.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { collectLayoutItems } from "@/lib/layout/runtime/classifyLayoutItemBinding";
import {
    drawerLayoutDocHasSummaryStripSections,
    splitDrawerLayoutDocShellZones,
} from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";

function allWidgetKeys(doc: ReturnType<typeof buildLeadDrawerDefaultDoc>): string[] {
    return collectLayoutItems(doc)
        .filter((i) => i.kind === "widget_placeholder")
        .map((i) => i.refKey);
}

describe("lead drawer default preset (Patch 5)", () => {
    it("validates and exposes the operational section order", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const res = parseLayoutDoc(doc);
        expect(res.ok, res.errors.join("; ")).toBe(true);
        expect(doc.metadata?.template).toBe("lead_drawer_v2");
        expect(doc.sections.map((s) => s.key)).toEqual([
            "lead_summary",
            "children_enrollment",
            "household_contact",
            "lead_source",
            "notes_communication",
            "activity",
        ]);
    });

    it("routes lead_summary widgets to the summary strip partition", () => {
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
        expect(drawerLayoutDocHasSummaryStripSections(doc, "opportunity")).toBe(true);

        const summaryWidgets = collectLayoutItems(split.summaryDoc)
            .filter((i) => i.kind === "widget_placeholder")
            .map((i) => i.refKey);
        expect(summaryWidgets).toEqual(["attention", "tasks", "tour_summary", "children_list"]);
    });

    it("centers Children & Enrollment with enrollment-context columns", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections.find((s) => s.key === "children_enrollment");
        expect(section?.title).toBe("Children & Enrollment");
        expect(section?.defaultExpanded).toBe(true);

        const table = collectLayoutItems(doc).find((i) => i.kind === "related_list" && i.displayMode === "table");
        expect(table?.columns?.map((c) => c.refKey)).toEqual([
            "child.name",
            "child.dob_age",
            "child.program",
            "child.desired_start_date",
            "child.schedule",
            "child.room",
            "child.location",
            "child.status",
        ]);
    });

    it("configures activity as a real preview widget with rail metadata", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const activity = collectLayoutItems(doc).find((i) => i.refKey === "activity");
        expect(activity?.metadata?.futureModule).toBeUndefined();
        const activitySection = doc.sections.find((s) => s.key === "activity");
        expect(activitySection?.metadata?.priority).toBe(10);
        expect(activitySection?.metadata?.railSlot).toBe("right_rail");
        expect(allWidgetKeys(doc)).toEqual(
            expect.arrayContaining([
                "attention",
                "tasks",
                "tour_summary",
                "children_list",
                "recent_communication",
                "notes",
                "activity",
            ]),
        );
    });
});
