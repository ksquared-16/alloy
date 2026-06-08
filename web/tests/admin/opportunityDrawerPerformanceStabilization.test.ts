import { describe, expect, it } from "vitest";
import {
    clearOpportunityDrawerTabPrefetchForTests,
    scheduleOpportunityDrawerTabPrefetch,
    takeOpportunityDrawerDocumentsPrefetch,
} from "@/lib/admin/opportunityDrawerTabPrefetch";
import { ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS } from "@/lib/adminV2/drawerOutsideClick";

describe("opportunityDrawerTabPrefetch", () => {
    it("arms a single slot per opportunity id", () => {
        clearOpportunityDrawerTabPrefetchForTests();
        scheduleOpportunityDrawerTabPrefetch("opp-1");
        scheduleOpportunityDrawerTabPrefetch("opp-1");
        expect(takeOpportunityDrawerDocumentsPrefetch("opp-1")).toBeDefined();
        clearOpportunityDrawerTabPrefetchForTests();
    });
});

describe("drawerOutsideClick action overlays", () => {
    it("ignores action modals host and portaled actions menu", () => {
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain(
            '[data-vm-drawer-action-modals-host="true"]',
        );
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain(
            '[data-opportunity-header-actions-menu-portal="true"]',
        );
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain(
            '[data-opportunity-drawer-action-overlay="true"]',
        );
    });
});

describe("opportunityRelatedListPath", () => {
    it("uses singular opportunity entity slug for related API", async () => {
        const { opportunityRelatedListPath } = await import("@/lib/admin/opportunityRelatedApiPaths");
        expect(opportunityRelatedListPath("opp-1")).toBe("/api/admin/related/opportunity/opp-1");
    });
});
