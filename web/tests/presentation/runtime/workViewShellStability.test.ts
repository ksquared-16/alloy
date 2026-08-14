/**
 * Behavioral proof: Work View pill selection on an open surface must stay in-page
 * (LENS) for every id in the surface lens set — including views whose Settlement
 * count host differs from the open Work Unit. Navigating those pills remounts the
 * Work Unit shell and is rejected by operator UAT.
 */
import { describe, expect, it } from "vitest";
import { resolveSelectWorkViewAction } from "@/lib/presentation/runtime/workUnitPillSwitching";
import type { WorkViewCanonicalLocation } from "@/lib/workspace/resolveWorkViewCanonicalLocation";

describe("work view shell stability (pill strip = lens)", () => {
    it("All → Tours → Waitlist stay in-page on New Leads even when Waitlist count is cross-host", () => {
        const views = [
            { id: "new_work_view_5", label: "Tours" },
            { id: "new_work_view_4", label: "Waitlist" },
            { id: "new_work_view_6", label: "All" },
        ];
        const map = new Map<string, WorkViewCanonicalLocation>([
            ["new_work_view_5", { workUnitId: "wu-lead", baseQueueKey: "lifecycle_lead", routeKey: "tours" }],
            ["new_work_view_4", { workUnitId: "wu-waitlist", baseQueueKey: "lifecycle_waitlist", routeKey: "waitlist" }],
            ["new_work_view_6", { workUnitId: "wu-lead", baseQueueKey: "lifecycle_lead", routeKey: "all" }],
        ]);
        const lensIds = views.map((v) => v.id);
        const inputs = { views, canonicalLocationByViewId: map, selectedSiteId: null };

        for (const [from, to] of [
            ["new_work_view_6", "new_work_view_5"],
            ["new_work_view_5", "new_work_view_4"],
            ["new_work_view_4", "new_work_view_6"],
            ["new_work_view_6", "new_work_view_5"],
        ] as const) {
            const action = resolveSelectWorkViewAction({
                workViewId: to,
                currentWorkViewId: from,
                currentWorkUnitId: "wu-lead",
                canonicalLocationByViewId: map,
                targetInputs: inputs,
                surfaceLensIds: lensIds,
            });
            expect(action, `${from}→${to}`).toEqual({ kind: "in-page", workViewId: to });
        }
    });
});
