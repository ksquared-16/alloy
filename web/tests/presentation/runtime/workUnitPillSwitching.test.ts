import { describe, expect, it, vi } from "vitest";

import {
    isSameHostWorkView,
    resolveSelectWorkViewAction,
    shouldAutoOpenFirstRowForView,
} from "@/lib/presentation/runtime/workUnitPillSwitching";
import type { WorkViewCanonicalLocation } from "@/lib/workspace/resolveWorkViewCanonicalLocation";

const views = [
    { id: "v-active", label: "Active Pipeline" },
    { id: "v-leads", label: "New Leads" },
];

function location(workUnitId: string, routeKey = "active-pipeline"): WorkViewCanonicalLocation {
    return {
        workUnitId,
        baseQueueKey: "all",
        routeKey,
    };
}

describe("workUnitPillSwitching", () => {
    it("isSameHostWorkView is true when canonical host matches current unit", () => {
        const map = new Map<string, WorkViewCanonicalLocation>([
            ["v-leads", location("wu-enrollment", "new-leads")],
        ]);
        expect(isSameHostWorkView("v-leads", "wu-enrollment", map)).toBe(true);
        expect(isSameHostWorkView("v-leads", "wu-other", map)).toBe(false);
    });

    it("isSameHostWorkView is true when target shares the active view's settled host (Tours↔All)", () => {
        const map = new Map<string, WorkViewCanonicalLocation>([
            ["new_work_view_5", location("wu-lead", "tours")],
            ["new_work_view_6", location("wu-lead", "all")],
        ]);
        expect(isSameHostWorkView("new_work_view_5", null, map, "new_work_view_6")).toBe(true);
        expect(isSameHostWorkView("new_work_view_5", "wu-other", map, "new_work_view_6")).toBe(true);
    });

    it("unknown host while on a work unit stays in-page (never label-slug navigate)", () => {
        const empty = new Map<string, WorkViewCanonicalLocation>();
        const action = resolveSelectWorkViewAction({
            workViewId: "new_work_view_5",
            currentWorkViewId: "new_work_view_6",
            currentWorkUnitId: "wu-lead",
            canonicalLocationByViewId: empty,
            targetInputs: {
                views: [
                    { id: "new_work_view_5", label: "Tours" },
                    { id: "new_work_view_6", label: "All" },
                ],
                canonicalLocationByViewId: empty,
                selectedSiteId: null,
            },
        });
        expect(action).toEqual({ kind: "in-page", workViewId: "new_work_view_5" });
    });

    it("pill-strip views stay in-page even when Settlement hosts count elsewhere (Waitlist shell)", () => {
        // LENS-on-shell is intentional (no label-slug remount). Rows agree with Settlement because
        // Operational Commit loads `queueTotalTarget.hostWorkUnitId` via
        // `resolveProvisioningPopulationWorkUnitId` — not because the shell work unit owns the cohort.
        const lifecycleViews = [
            { id: "new_work_view_5", label: "Tours" },
            { id: "new_work_view_4", label: "Waitlist" },
            { id: "new_work_view_6", label: "All" },
        ];
        const crossHostMap = new Map<string, WorkViewCanonicalLocation>([
            ["new_work_view_5", { workUnitId: "wu-lead", baseQueueKey: "lifecycle_lead", routeKey: "tours" }],
            ["new_work_view_4", { workUnitId: "wu-waitlist", baseQueueKey: "lifecycle_waitlist", routeKey: "waitlist" }],
            ["new_work_view_6", { workUnitId: "wu-lead", baseQueueKey: "lifecycle_lead", routeKey: "all" }],
        ]);
        const waitlist = resolveSelectWorkViewAction({
            workViewId: "new_work_view_4",
            currentWorkViewId: "new_work_view_6",
            currentWorkUnitId: "wu-lead",
            canonicalLocationByViewId: crossHostMap,
            targetInputs: {
                views: lifecycleViews,
                canonicalLocationByViewId: crossHostMap,
                selectedSiteId: null,
            },
            surfaceLensIds: lifecycleViews.map((v) => v.id),
        });
        expect(waitlist).toEqual({ kind: "in-page", workViewId: "new_work_view_4" });

        const tours = resolveSelectWorkViewAction({
            workViewId: "new_work_view_5",
            currentWorkViewId: "new_work_view_6",
            currentWorkUnitId: "wu-lead",
            canonicalLocationByViewId: crossHostMap,
            targetInputs: {
                views: lifecycleViews,
                canonicalLocationByViewId: crossHostMap,
                selectedSiteId: null,
            },
            surfaceLensIds: lifecycleViews.map((v) => v.id),
        });
        expect(tours).toEqual({ kind: "in-page", workViewId: "new_work_view_5" });
    });

    it("cross-host All Leads navigates; same-host All Leads stays in-page (count + queue share canonical host)", () => {
        const lifecycleViews = [
            { id: "new_leads", label: "New Leads" },
            { id: "new_work_view_6", label: "All Leads" },
        ];
        const sameHostMap = new Map<string, WorkViewCanonicalLocation>([
            ["new_leads", { workUnitId: "wu-lead", baseQueueKey: "lifecycle_lead", routeKey: "new_leads" }],
            ["new_work_view_6", { workUnitId: "wu-lead", baseQueueKey: "lifecycle_lead", routeKey: "all_leads" }],
        ]);
        const crossHostMap = new Map<string, WorkViewCanonicalLocation>([
            ["new_leads", { workUnitId: "wu-lead", baseQueueKey: "lifecycle_lead", routeKey: "new_leads" }],
            ["new_work_view_6", { workUnitId: "wu-waitlist", baseQueueKey: "lifecycle_waitlist", routeKey: "all_leads" }],
        ]);

        const sameHost = resolveSelectWorkViewAction({
            workViewId: "new_work_view_6",
            currentWorkViewId: "new_leads",
            currentWorkUnitId: "wu-lead",
            canonicalLocationByViewId: sameHostMap,
            targetInputs: { views: lifecycleViews, canonicalLocationByViewId: sameHostMap, selectedSiteId: null },
        });
        expect(sameHost).toEqual({ kind: "in-page", workViewId: "new_work_view_6" });

        const crossHost = resolveSelectWorkViewAction({
            workViewId: "new_work_view_6",
            currentWorkViewId: "new_leads",
            currentWorkUnitId: "wu-lead",
            canonicalLocationByViewId: crossHostMap,
            targetInputs: { views: lifecycleViews, canonicalLocationByViewId: crossHostMap, selectedSiteId: null },
        });
        expect(crossHost.kind).toBe("navigate");
        if (crossHost.kind === "navigate") {
            expect(crossHost.href).toContain("all-leads");
            expect(crossHost.href).toContain("work_view_id=new_work_view_6");
        }
    });

    it("resolveSelectWorkViewAction returns in-page for same-host view (no router.push)", () => {
        const map = new Map<string, WorkViewCanonicalLocation>([
            ["v-active", location("wu-1", "active-pipeline")],
            ["v-leads", location("wu-1", "new-leads")],
        ]);
        const action = resolveSelectWorkViewAction({
            workViewId: "v-leads",
            currentWorkViewId: "v-active",
            currentWorkUnitId: "wu-1",
            canonicalLocationByViewId: map,
            targetInputs: { views, canonicalLocationByViewId: map, selectedSiteId: null },
        });
        expect(action).toEqual({ kind: "in-page", workViewId: "v-leads" });
    });

    it("resolveSelectWorkViewAction returns navigate for cross-host view", () => {
        const map = new Map<string, WorkViewCanonicalLocation>([
            ["v-active", location("wu-1", "active-pipeline")],
            ["v-leads", location("wu-2", "new-leads")],
        ]);
        const action = resolveSelectWorkViewAction({
            workViewId: "v-leads",
            currentWorkViewId: "v-active",
            currentWorkUnitId: "wu-1",
            canonicalLocationByViewId: map,
            targetInputs: { views, canonicalLocationByViewId: map, selectedSiteId: null },
        });
        expect(action.kind).toBe("navigate");
        if (action.kind === "navigate") {
            expect(action.href).toContain("new-leads");
            expect(action.href).toContain("work_view_id=v-leads");
        }
    });

    it("shouldAutoOpenFirstRowForView re-arms on each view after queue settles", () => {
        expect(
            shouldAutoOpenFirstRowForView({
                viewId: "v-leads",
                autoOpenedViewId: "v-active",
                queueLoading: false,
                queueSettled: true,
                rowCount: 3,
                routeRecordId: null,
                forceAutoOpenViewId: "v-leads",
            }),
        ).toBe(true);
    });

    it("shouldAutoOpenFirstRowForView skips when deep-linked unless force flag matches", () => {
        expect(
            shouldAutoOpenFirstRowForView({
                viewId: "v-active",
                autoOpenedViewId: null,
                queueLoading: false,
                queueSettled: true,
                rowCount: 2,
                routeRecordId: "opp-1",
                forceAutoOpenViewId: null,
            }),
        ).toBe(false);
    });

    it("shouldAutoOpenFirstRowForView returns false for empty queue (clears focus via closeDrawer)", () => {
        expect(
            shouldAutoOpenFirstRowForView({
                viewId: "v-leads",
                autoOpenedViewId: null,
                queueLoading: false,
                queueSettled: true,
                rowCount: 0,
                routeRecordId: null,
                forceAutoOpenViewId: "v-leads",
            }),
        ).toBe(false);
    });

    it("noop when clicking the already-active pill", () => {
        const map = new Map<string, WorkViewCanonicalLocation>();
        expect(
            resolveSelectWorkViewAction({
                workViewId: "v-active",
                currentWorkViewId: "v-active",
                currentWorkUnitId: "wu-1",
                canonicalLocationByViewId: map,
                targetInputs: { views, canonicalLocationByViewId: map, selectedSiteId: null },
            }).kind,
        ).toBe("noop");
    });
});
