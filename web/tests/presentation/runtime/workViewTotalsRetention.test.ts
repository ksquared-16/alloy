import { describe, expect, it } from "vitest";
import {
    workViewTotalKey,
    type WorkViewTotalTarget,
} from "@/lib/presentation/runtime/useWorkViewTotals";
import {
    applyWorkViewTotalsFetchResult,
    mergeWorkViewTotalsForDisplay,
    populationKeyFromTarget,
    pruneWorkViewSettledTotalsStore,
    workViewPopulationIdentityKey,
} from "@/lib/presentation/runtime/workViewTotalsRetention";

const TARGET: WorkViewTotalTarget = {
    viewId: "new_leads",
    workUnitId: "wu-lead",
    baseQueueKey: "lifecycle_lead",
};

describe("workViewTotalsRetention", () => {
    it("retains settled inactive count during same-population refresh", () => {
        const settled = new Map([[populationKeyFromTarget(null, TARGET), 2]]);
        const display = mergeWorkViewTotalsForDisplay({
            targets: [TARGET],
            selectedSiteId: null,
            freshTotals: null,
            settledStore: settled,
            fetchSettled: false,
        });
        expect(display.get(workViewTotalKey("wu-lead", "new_leads"))).toBe(2);
    });

    it("replaces retained value when fresh settled total arrives", () => {
        const settled = new Map([[populationKeyFromTarget(null, TARGET), 2]]);
        const fresh = new Map([[workViewTotalKey("wu-lead", "new_leads"), 3]]);
        const display = mergeWorkViewTotalsForDisplay({
            targets: [TARGET],
            selectedSiteId: null,
            freshTotals: fresh,
            settledStore: settled,
            fetchSettled: true,
        });
        expect(display.get(workViewTotalKey("wu-lead", "new_leads"))).toBe(3);
    });

    it("legitimate settled zero replaces retained positive value", () => {
        const settled = new Map([[populationKeyFromTarget(null, TARGET), 2]]);
        const fresh = new Map([[workViewTotalKey("wu-lead", "new_leads"), 0]]);
        const display = mergeWorkViewTotalsForDisplay({
            targets: [TARGET],
            selectedSiteId: null,
            freshTotals: fresh,
            settledStore: settled,
            fetchSettled: true,
        });
        expect(display.get(workViewTotalKey("wu-lead", "new_leads"))).toBe(0);
    });

    it("fetch failure retains last settled value for same population", () => {
        const settled = new Map([[populationKeyFromTarget(null, TARGET), 2]]);
        const fresh = new Map([[workViewTotalKey("wu-lead", "new_leads"), null]]);
        const display = mergeWorkViewTotalsForDisplay({
            targets: [TARGET],
            selectedSiteId: null,
            freshTotals: fresh,
            settledStore: settled,
            fetchSettled: true,
        });
        expect(display.get(workViewTotalKey("wu-lead", "new_leads"))).toBe(2);
    });

    it("changed site scope uses a different population identity", () => {
        const siteA = populationKeyFromTarget("site-a", TARGET);
        const siteB = populationKeyFromTarget("site-b", TARGET);
        expect(siteA).not.toBe(siteB);
        const settled = new Map([[siteA, 2]]);
        const display = mergeWorkViewTotalsForDisplay({
            targets: [TARGET],
            selectedSiteId: "site-b",
            freshTotals: null,
            settledStore: settled,
            fetchSettled: false,
        });
        expect(display.get(workViewTotalKey("wu-lead", "new_leads"))).toBeNull();
    });

    it("changed canonical host/lane does not retain old count", () => {
        const oldTarget: WorkViewTotalTarget = {
            viewId: "all_leads",
            workUnitId: "wu-waitlist",
            baseQueueKey: "lifecycle_waitlist",
        };
        const newTarget: WorkViewTotalTarget = {
            viewId: "all_leads",
            workUnitId: "wu-lead",
            baseQueueKey: "lifecycle_lead",
        };
        const settled = new Map([[populationKeyFromTarget(null, oldTarget), 0]]);
        const pruned = pruneWorkViewSettledTotalsStore({
            targets: [newTarget],
            selectedSiteId: null,
            settledStore: settled,
        });
        const display = mergeWorkViewTotalsForDisplay({
            targets: [newTarget],
            selectedSiteId: null,
            freshTotals: null,
            settledStore: pruned,
            fetchSettled: false,
        });
        expect(display.get(workViewTotalKey("wu-lead", "all_leads"))).toBeNull();
    });

    it("removed Work View drops retained count after prune", () => {
        const settled = new Map([[populationKeyFromTarget(null, TARGET), 2]]);
        const pruned = pruneWorkViewSettledTotalsStore({
            targets: [],
            selectedSiteId: null,
            settledStore: settled,
        });
        expect(pruned.size).toBe(0);
    });

    it("newly added Work View starts unresolved", () => {
        const other: WorkViewTotalTarget = {
            viewId: "all_leads",
            workUnitId: "wu-lead",
            baseQueueKey: "lifecycle_lead",
        };
        const display = mergeWorkViewTotalsForDisplay({
            targets: [other],
            selectedSiteId: null,
            freshTotals: null,
            settledStore: new Map(),
            fetchSettled: false,
        });
        expect(display.get(workViewTotalKey("wu-lead", "all_leads"))).toBeNull();
    });

    it("explicit zero remains distinct from unresolved null", () => {
        const settled = new Map([[populationKeyFromTarget(null, TARGET), 0]]);
        const display = mergeWorkViewTotalsForDisplay({
            targets: [TARGET],
            selectedSiteId: null,
            freshTotals: null,
            settledStore: settled,
            fetchSettled: false,
        });
        expect(display.get(workViewTotalKey("wu-lead", "new_leads"))).toBe(0);
    });

    it("applyWorkViewTotalsFetchResult only stores non-null settled values", () => {
        const next = applyWorkViewTotalsFetchResult({
            targets: [TARGET],
            selectedSiteId: null,
            freshTotals: new Map([[workViewTotalKey("wu-lead", "new_leads"), null]]),
            settledStore: new Map([[populationKeyFromTarget(null, TARGET), 2]]),
        });
        expect(next.get(populationKeyFromTarget(null, TARGET))).toBe(2);
    });

    it("population identity includes site, host, lane, and view id", () => {
        expect(
            workViewPopulationIdentityKey(null, "wu-lead", "new_leads", "lifecycle_lead"),
        ).toBe("|wu-lead|new_leads|lifecycle_lead");
    });
});
