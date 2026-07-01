import { describe, expect, it } from "vitest";
import {
    filterOpportunityOverviewSectionsForFirstPaint,
    opportunityDrawerFirstPaintActive,
    opportunityDrawerPrimaryContractReady,
    opportunityInquirySummaryRightPanelFromPrimaryOnly,
    opportunityInquiryTourDisplayFromPrimaryMetadata,
} from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";

describe("opportunityDrawerFirstPaintContract", () => {
    it("detects primary contract ready", () => {
        expect(opportunityDrawerPrimaryContractReady({ id: "o1", _record_surface: "drawer_primary" }, "o1")).toBe(true);
        expect(opportunityDrawerPrimaryContractReady({ id: "o1", _record_surface: "drawer_visible" }, "o1")).toBe(false);
    });

    it("first paint active only before full on bootstrap path", () => {
        const rec = { id: "o1", _record_surface: "drawer_primary" };
        expect(opportunityDrawerFirstPaintActive(rec, "o1", true)).toBe(true);
        expect(opportunityDrawerFirstPaintActive({ ...rec, _record_surface: "full" }, "o1", true)).toBe(false);
        expect(opportunityDrawerFirstPaintActive(rec, "o1", false)).toBe(false);
    });

    it("tour from metadata only", () => {
        expect(
            opportunityInquiryTourDisplayFromPrimaryMetadata({
                metadata: { tour_date: "2026-06-01" },
            })
        ).toBe(true);
        expect(opportunityInquiryTourDisplayFromPrimaryMetadata({ metadata: {} })).toBe(false);
    });

    it("right panel from primary lifecycle only", () => {
        expect(opportunityInquirySummaryRightPanelFromPrimaryOnly({ next_follow_up_at: "2026-06-02" })).toBe(true);
        expect(opportunityInquirySummaryRightPanelFromPrimaryOnly({})).toBe(false);
    });

    it("keeps overview section structure while collapsed until enrichment layout ready", () => {
        const sections = [
            { key: "inquiry_children", title: "Children", defaultExpanded: true, collapsible: true, fields: [] },
            { key: "quote", title: "Quote", defaultExpanded: true, collapsible: true, fields: [] },
        ];
        const before = filterOpportunityOverviewSectionsForFirstPaint(sections, true, false);
        expect(before).toHaveLength(2);
        expect(before.map((s) => s.key)).toEqual(["inquiry_children", "quote"]);
        expect(before.find((s) => s.key === "inquiry_children")?.defaultExpanded).toBe(false);
        expect(before.find((s) => s.key === "quote")?.defaultExpanded).toBe(true);
        const after = filterOpportunityOverviewSectionsForFirstPaint(sections, true, true);
        expect(after.map((s) => s.key)).toEqual(["inquiry_children", "quote"]);
    });

    it("holds section structure when enrichment is held pre-open", () => {
        const sections = [
            { key: "quote", title: "Quote", defaultExpanded: true, collapsible: true, fields: [] },
        ];
        const held = filterOpportunityOverviewSectionsForFirstPaint(sections, false, true, true);
        expect(held).toHaveLength(1);
        expect(held[0]?.key).toBe("quote");
        expect(held[0]?.defaultExpanded).toBe(false);
    });
});
