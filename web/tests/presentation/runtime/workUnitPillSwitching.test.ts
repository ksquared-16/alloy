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
