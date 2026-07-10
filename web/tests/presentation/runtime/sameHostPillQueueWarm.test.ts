import { describe, expect, it } from "vitest";

import {
    resolveSameHostPillQueueWarmPlan,
    SAME_HOST_PILL_QUEUE_WARM_TTL_MS,
} from "@/lib/presentation/runtime/sameHostPillQueueWarm";
import type { WorkViewCanonicalLocation } from "@/lib/workspace/resolveWorkViewCanonicalLocation";

function location(
    workUnitId: string,
    baseQueueKey = "all",
    routeKey = "new-leads",
): WorkViewCanonicalLocation {
    return { workUnitId, baseQueueKey, routeKey };
}

const views = [
    { id: "v-active", label: "Active Pipeline" },
    { id: "v-leads", label: "New Leads" },
];

describe("sameHostPillQueueWarm (C3)", () => {
    it("exports a short warm TTL shared with the active rows GET", () => {
        expect(SAME_HOST_PILL_QUEUE_WARM_TTL_MS).toBe(30_000);
    });

    it("noops when view is already active", () => {
        const map = new Map([["v-leads", location("wu-1")]]);
        expect(
            resolveSameHostPillQueueWarmPlan({
                workViewId: "v-leads",
                currentWorkViewId: "v-leads",
                currentWorkUnitId: "wu-1",
                canonicalLocationByViewId: map,
                hostBaseQueueKey: "all",
                targetInputs: { views, canonicalLocationByViewId: map, selectedSiteId: null },
            }).kind,
        ).toBe("noop");
    });

    it("plans same_host_queue when select action is in-page", () => {
        const map = new Map([
            ["v-active", location("wu-1", "all", "active-pipeline")],
            ["v-leads", location("wu-1", "all", "new-leads")],
        ]);
        expect(
            resolveSameHostPillQueueWarmPlan({
                workViewId: "v-leads",
                currentWorkViewId: "v-active",
                currentWorkUnitId: "wu-1",
                canonicalLocationByViewId: map,
                hostBaseQueueKey: "all",
                targetInputs: { views, canonicalLocationByViewId: map, selectedSiteId: null },
            }),
        ).toEqual({
            kind: "same_host_queue",
            workViewId: "v-leads",
            workUnitId: "wu-1",
            baseQueueKey: "all",
        });
    });

    it("plans cross_host_entry when select action navigates", () => {
        const map = new Map([
            ["v-active", location("wu-1", "all", "active-pipeline")],
            ["v-leads", location("wu-2", "all", "new-leads")],
        ]);
        const plan = resolveSameHostPillQueueWarmPlan({
            workViewId: "v-leads",
            currentWorkViewId: "v-active",
            currentWorkUnitId: "wu-1",
            canonicalLocationByViewId: map,
            hostBaseQueueKey: "all",
            targetInputs: { views, canonicalLocationByViewId: map, selectedSiteId: null },
        });
        expect(plan.kind).toBe("cross_host_entry");
        if (plan.kind === "cross_host_entry") {
            expect(plan.workViewId).toBe("v-leads");
            expect(plan.href).toContain("new-leads");
        }
    });

    it("falls back to hostBaseQueueKey when location omits the lane key", () => {
        const map = new Map<string, WorkViewCanonicalLocation>([
            ["v-leads", { workUnitId: "wu-1", baseQueueKey: "", routeKey: "new-leads" }],
        ]);
        expect(
            resolveSameHostPillQueueWarmPlan({
                workViewId: "v-leads",
                currentWorkViewId: "v-active",
                currentWorkUnitId: "wu-1",
                canonicalLocationByViewId: map,
                hostBaseQueueKey: "primary",
                targetInputs: { views, canonicalLocationByViewId: map, selectedSiteId: null },
            }),
        ).toEqual({
            kind: "same_host_queue",
            workViewId: "v-leads",
            workUnitId: "wu-1",
            baseQueueKey: "primary",
        });
    });
});
