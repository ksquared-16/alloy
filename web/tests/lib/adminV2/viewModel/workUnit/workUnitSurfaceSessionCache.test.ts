/**
 * Trust Closure (Commit 2) — the PRV2 Work Unit surface session cache is the read-through/write-back
 * layer that makes return navigation instant. These tests pin the load-bearing guarantees: the cache
 * survives a surface unmount (it is module-scoped), is isolated by org, resolves fresh/stale/miss by
 * age, and invalidates one work unit without touching another. (Sprint §16 items 1,2,5,6,7,8,9,16,18.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    putWorkUnitSurfaceConfigCache,
    peekWorkUnitSurfaceConfigCache,
    putWorkUnitSurfaceQueueCache,
    peekWorkUnitSurfaceQueueCache,
    putWorkUnitSurfaceSummariesCache,
    peekWorkUnitSurfaceSummariesCache,
    putWorkUnitSurfaceRightRailCache,
    peekWorkUnitSurfaceRightRailCache,
    putWorkUnitSurfaceTotalsCache,
    peekWorkUnitSurfaceTotalsCache,
    invalidateWorkUnitSurfaceCachesForWorkUnit,
    clearWorkUnitViewModelSessionCacheForTests,
    type WorkUnitViewModelCacheContext,
    type WorkUnitViewModelCacheLaneState,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { ADMINV2_UI_SESSION_CACHE_TTL_MS } from "@/lib/adminV2/runtime/adminV2UiSessionCacheTtl";
import type { QueueItemsResult } from "@/lib/queues/types";

const CTX_A: WorkUnitViewModelCacheContext = {
    orgId: "org-1",
    departmentId: "dept-1",
    workUnitId: "wu-1",
    userId: "user-1",
    scopeFingerprint: "scope:1",
};
const CTX_OTHER_ORG: WorkUnitViewModelCacheContext = { ...CTX_A, orgId: "org-2" };
const CTX_WU2: WorkUnitViewModelCacheContext = { ...CTX_A, workUnitId: "wu-2" };

const LANE: WorkUnitViewModelCacheLaneState = {
    selectedQueueKey: "all",
    recordFilterFingerprint: "view:v1|site:_",
};

function configEntry(surfaceId = "pipeline-queue-row") {
    return {
        deptMetadata: { a: 1 },
        queueDefinition: { queues: [] },
        deptWorkUnits: null,
        queueRowLayoutConfig: null,
        queueRowSurfaceId: surfaceId,
    };
}

function queueResult(total: number): QueueItemsResult {
    return {
        queue: { key: "all", label: "All", entity_type: "opportunity", priority: "standard", display: "list" },
        items: [],
        total,
        limit: 25,
        offset: 0,
    };
}

beforeEach(() => {
    clearWorkUnitViewModelSessionCacheForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
});

afterEach(() => {
    vi.useRealTimers();
    clearWorkUnitViewModelSessionCacheForTests();
});

describe("work unit surface config cache", () => {
    it("persists across a (simulated) surface unmount — module-scoped, survives remount", () => {
        putWorkUnitSurfaceConfigCache(configEntry(), CTX_A);
        // A remount would create a brand-new hook instance; the module cache is unaffected.
        const read = peekWorkUnitSurfaceConfigCache(CTX_A);
        expect(read?.entry.queueRowSurfaceId).toBe("pipeline-queue-row");
        expect(read?.fresh).toBe(true);
    });

    it("is isolated by org — another tenant never reads this entry", () => {
        putWorkUnitSurfaceConfigCache(configEntry(), CTX_A);
        expect(peekWorkUnitSurfaceConfigCache(CTX_OTHER_ORG)).toBeNull();
    });

    it("returns fresh inside the fresh window, stale between fresh and TTL, miss past TTL", () => {
        putWorkUnitSurfaceConfigCache(configEntry(), CTX_A);
        vi.advanceTimersByTime(30_000); // < 60s fresh window
        expect(peekWorkUnitSurfaceConfigCache(CTX_A)?.fresh).toBe(true);

        vi.advanceTimersByTime(60_000); // now 90s total → past fresh, within TTL
        const stale = peekWorkUnitSurfaceConfigCache(CTX_A);
        expect(stale).not.toBeNull();
        expect(stale?.fresh).toBe(false);

        vi.advanceTimersByTime(ADMINV2_UI_SESSION_CACHE_TTL_MS); // past TTL
        expect(peekWorkUnitSurfaceConfigCache(CTX_A)).toBeNull();
    });
});

describe("work unit surface queue cache", () => {
    it("round-trips rows for a lane and misses a different lane", () => {
        putWorkUnitSurfaceQueueCache({ queueResult: queueResult(3) }, CTX_A, LANE);
        expect(peekWorkUnitSurfaceQueueCache({ context: CTX_A, lane: LANE })?.entry.queueResult.total).toBe(3);
        const otherLane: WorkUnitViewModelCacheLaneState = { ...LANE, selectedQueueKey: "attention" };
        expect(peekWorkUnitSurfaceQueueCache({ context: CTX_A, lane: otherLane })).toBeNull();
    });

    it("does not let one work unit's rows answer another work unit's read", () => {
        putWorkUnitSurfaceQueueCache({ queueResult: queueResult(3) }, CTX_A, LANE);
        putWorkUnitSurfaceQueueCache({ queueResult: queueResult(9) }, CTX_WU2, LANE);
        expect(peekWorkUnitSurfaceQueueCache({ context: CTX_A, lane: LANE })?.entry.queueResult.total).toBe(3);
        expect(peekWorkUnitSurfaceQueueCache({ context: CTX_WU2, lane: LANE })?.entry.queueResult.total).toBe(9);
    });
});

describe("work unit surface summaries cache", () => {
    it("isolates per selected site", () => {
        putWorkUnitSurfaceSummariesCache([], CTX_A, "site-a");
        expect(peekWorkUnitSurfaceSummariesCache(CTX_A, "site-a")).not.toBeNull();
        expect(peekWorkUnitSurfaceSummariesCache(CTX_A, "site-b")).toBeNull();
    });
});

describe("work unit surface right-rail cache", () => {
    const actions = [{ action_key: "create_lead" }] as unknown as ResolvedActionForClient[];

    it("round-trips resolved actions and isolates by org", () => {
        putWorkUnitSurfaceRightRailCache(actions, CTX_A);
        expect(peekWorkUnitSurfaceRightRailCache(CTX_A)?.entry.actions).toHaveLength(1);
        expect(peekWorkUnitSurfaceRightRailCache(CTX_OTHER_ORG)).toBeNull();
    });

    it("distinguishes a cached empty rail from a miss", () => {
        putWorkUnitSurfaceRightRailCache([], CTX_A);
        const read = peekWorkUnitSurfaceRightRailCache(CTX_A);
        expect(read).not.toBeNull();
        expect(read?.entry.actions).toEqual([]); // seeded empty, not "cold"
    });
});

describe("work unit surface totals cache", () => {
    it("round-trips the totals map and isolates by population fingerprint", () => {
        const totals = new Map<string, number | null>([["wu-1::view-a", 5]]);
        putWorkUnitSurfaceTotalsCache(totals, "pop-1", CTX_A);
        expect(peekWorkUnitSurfaceTotalsCache({ context: CTX_A, populationKey: "pop-1" })?.entry.totals.get("wu-1::view-a")).toBe(5);
        // A different visible-view set / site is a different population → miss.
        expect(peekWorkUnitSurfaceTotalsCache({ context: CTX_A, populationKey: "pop-2" })).toBeNull();
        // Org isolation.
        expect(peekWorkUnitSurfaceTotalsCache({ context: CTX_OTHER_ORG, populationKey: "pop-1" })).toBeNull();
    });

    it("stores a defensive copy so later mutation of the source map cannot corrupt the cache", () => {
        const totals = new Map<string, number | null>([["k", 1]]);
        putWorkUnitSurfaceTotalsCache(totals, "pop-x", CTX_A);
        totals.set("k", 999);
        expect(peekWorkUnitSurfaceTotalsCache({ context: CTX_A, populationKey: "pop-x" })?.entry.totals.get("k")).toBe(1);
    });
});

describe("invalidateWorkUnitSurfaceCachesForWorkUnit", () => {
    it("drops all surface caches for the target work unit but preserves a different work unit", () => {
        putWorkUnitSurfaceConfigCache(configEntry(), CTX_A);
        putWorkUnitSurfaceQueueCache({ queueResult: queueResult(3) }, CTX_A, LANE);
        putWorkUnitSurfaceSummariesCache([], CTX_A, "site-a");
        putWorkUnitSurfaceRightRailCache([{ action_key: "x" }] as unknown as ResolvedActionForClient[], CTX_A);
        putWorkUnitSurfaceTotalsCache(new Map([["k", 1]]), "pop-1", CTX_A);
        putWorkUnitSurfaceConfigCache(configEntry("other"), CTX_WU2);
        putWorkUnitSurfaceQueueCache({ queueResult: queueResult(9) }, CTX_WU2, LANE);
        putWorkUnitSurfaceTotalsCache(new Map([["k", 2]]), "pop-1", CTX_WU2);

        invalidateWorkUnitSurfaceCachesForWorkUnit({ context: CTX_A });

        expect(peekWorkUnitSurfaceConfigCache(CTX_A)).toBeNull();
        expect(peekWorkUnitSurfaceQueueCache({ context: CTX_A, lane: LANE })).toBeNull();
        expect(peekWorkUnitSurfaceSummariesCache(CTX_A, "site-a")).toBeNull();
        expect(peekWorkUnitSurfaceRightRailCache(CTX_A)).toBeNull();
        expect(peekWorkUnitSurfaceTotalsCache({ context: CTX_A, populationKey: "pop-1" })).toBeNull();
        // The sibling work unit is untouched.
        expect(peekWorkUnitSurfaceConfigCache(CTX_WU2)?.entry.queueRowSurfaceId).toBe("other");
        expect(peekWorkUnitSurfaceQueueCache({ context: CTX_WU2, lane: LANE })?.entry.queueResult.total).toBe(9);
        expect(peekWorkUnitSurfaceTotalsCache({ context: CTX_WU2, populationKey: "pop-1" })?.entry.totals.get("k")).toBe(2);
    });
});
