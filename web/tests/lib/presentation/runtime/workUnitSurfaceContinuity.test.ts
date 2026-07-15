/**
 * Trust Closure — runtime continuity seam. Proves the central guarantee at the exact seam the
 * runtime uses: the mount-time synchronous seed (`computeWorkUnitSurfaceInitialSeed`, called from the
 * useState initializers before any effect runs) and the atomic-reveal decision
 * (`resolveWorkUnitReadiness`). These are the load-bearing functions extracted from
 * `useWorkUnitSurfaceRuntime`, so a passing test here is a statement about the real runtime, not an
 * isolated cache. (Sprint §3 + §4.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    computeWorkUnitSurfaceInitialSeed,
    queueDefinitionMatchesFetchHost,
    resolveWorkUnitReadiness,
    validatedBaseQueueKeyForUnit,
    workUnitSurfaceQueueLane,
} from "@/lib/presentation/runtime/workUnitSurfaceSeed";
import {
    putWorkUnitSurfaceConfigCache,
    putWorkUnitSurfaceQueueCache,
    putWorkUnitSurfaceSummariesCache,
    clearWorkUnitViewModelSessionCacheForTests,
    type WorkUnitViewModelCacheContext,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import { resolveActiveWorkViewRuntimeContext } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import type { QueueItemsResult } from "@/lib/queues/types";
import type { WorkUnitSlugRouteValue } from "@/contexts/WorkUnitSlugRouteContext";

const CTX_A: WorkUnitViewModelCacheContext = {
    orgId: "org-1",
    departmentId: "dept-1",
    workUnitId: "wu-1",
    userId: "user-1",
    scopeFingerprint: "scope:1",
};

const SLUG_A = {
    routeSlug: "wu-a",
    departmentId: "dept-1",
    departmentName: "Dept",
    workUnitId: "wu-1",
    workUnitKey: "wu-a",
    workUnitName: "WU A",
    initialQueueKey: "all-records",
    initialWorkViewId: null,
    routeRecordId: null,
} as unknown as WorkUnitSlugRouteValue;

function queueResult(total: number): QueueItemsResult {
    return {
        queue: { key: "all-records", label: "All", entity_type: "opportunity", priority: "standard", display: "list" },
        items: [],
        total,
        limit: 25,
        offset: 0,
    };
}

/** Simulate WU A having loaded and written its composition back to the session cache. */
function seedWorkUnitAIntoCache(total = 7): void {
    putWorkUnitSurfaceConfigCache(
        {
            deptMetadata: null,
            queueDefinition: null,
            deptWorkUnits: null,
            queueRowLayoutConfig: null,
            queueRowSurfaceId: "pipeline-queue-row",
        },
        CTX_A,
    );
    // Derive the queue lane exactly the way the runtime does at write time.
    const runtimeCtx = resolveActiveWorkViewRuntimeContext({
        departmentMetadata: null,
        workViewId: null,
        queueKey: "all-records",
        queueDefinition: null,
    });
    const fetchKey = validatedBaseQueueKeyForUnit(runtimeCtx.queueKey, null);
    putWorkUnitSurfaceQueueCache(
        { queueResult: queueResult(total) },
        CTX_A,
        workUnitSurfaceQueueLane(fetchKey, runtimeCtx.workViewId, null),
    );
    putWorkUnitSurfaceSummariesCache([], CTX_A, null);
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

describe("synchronous return-navigation seeding", () => {
    it("survives unmount and is read synchronously on remount with zero blocking refetch", () => {
        seedWorkUnitAIntoCache(7);
        // The surface unmounts (module cache is unaffected), then remounts and reads the seed — this
        // is exactly what the useState initializers do, synchronously, before any effect runs.
        const seed = computeWorkUnitSurfaceInitialSeed({
            cacheContext: CTX_A,
            slugRoute: SLUG_A,
            selectedSiteId: null,
        });
        expect(seed.config).not.toBeNull();
        expect(seed.queueResult?.total).toBe(7); // rows available with no network round-trip
        expect(seed.summaries).toEqual([]);
    });

    it("cannot reuse the prior composition across an org change", () => {
        seedWorkUnitAIntoCache(7);
        const seed = computeWorkUnitSurfaceInitialSeed({
            cacheContext: { ...CTX_A, orgId: "org-2" },
            slugRoute: SLUG_A,
            selectedSiteId: null,
        });
        expect(seed.config).toBeNull();
        expect(seed.queueResult).toBeNull();
    });

    it("cannot reuse the prior composition across a user change", () => {
        seedWorkUnitAIntoCache(7);
        const seed = computeWorkUnitSurfaceInitialSeed({
            cacheContext: { ...CTX_A, userId: "user-2" },
            slugRoute: SLUG_A,
            selectedSiteId: null,
        });
        expect(seed.config).toBeNull();
    });

    it("cold entry (no cached composition) returns the empty seed", () => {
        const seed = computeWorkUnitSurfaceInitialSeed({
            cacheContext: CTX_A,
            slugRoute: SLUG_A,
            selectedSiteId: null,
        });
        expect(seed.config).toBeNull();
        expect(seed.queueResult).toBeNull();
    });
});

describe("queue-definition ↔ work-unit host consistency (cross-host transition)", () => {
    it("blocks the rows fetch until the loaded definition belongs to the current work unit", () => {
        // Cold: no definition loaded yet → block.
        expect(queueDefinitionMatchesFetchHost(null, "wu-A")).toBe(false);
        // Settled on unit A → fetch A.
        expect(queueDefinitionMatchesFetchHost("wu-A", "wu-A")).toBe(true);

        // Cross-host transition A→B: workUnitId advances to B a render BEFORE B's def loads, while the
        // definition state still belongs to A. The fetch MUST be blocked (else a key validated against
        // A's def is fetched from B → 404 / stale key). This is the deployed lifecycle_lead-404 window.
        expect(queueDefinitionMatchesFetchHost("wu-A", "wu-B")).toBe(false);
        // Once B's definition loads and configWorkUnitId catches up → fetch B.
        expect(queueDefinitionMatchesFetchHost("wu-B", "wu-B")).toBe(true);
    });

    it("never fetches without a target work unit", () => {
        expect(queueDefinitionMatchesFetchHost("wu-A", null)).toBe(false);
        expect(queueDefinitionMatchesFetchHost(null, null)).toBe(false);
    });
});

describe("atomic-reveal readiness contract", () => {
    const base = {
        hasIdentity: true,
        configSettled: true,
        headerConfigLoaded: true,
        hasHeaderPresentation: true,
        queueSettledOnce: true,
        rightRailSettled: true,
        queueLoading: false,
        openedFromCache: false,
        selectionCommitted: true,
    };

    it("cold entry is NOT composition-ready until the primary queue has settled (one reveal)", () => {
        const r = resolveWorkUnitReadiness({ ...base, queueSettledOnce: false });
        expect(r.shellReady).toBe(true);
        expect(r.coldCompositionReady).toBe(false);
    });

    it("cold entry becomes ready when header + queue are established together", () => {
        expect(resolveWorkUnitReadiness(base).coldCompositionReady).toBe(true);
    });

    it("a seeded return is ready immediately and marks retained", () => {
        const r = resolveWorkUnitReadiness({ ...base, openedFromCache: true });
        expect(r.retainedCompositionReady).toBe(true);
        expect(r.coldCompositionReady).toBe(true);
    });

    it("background SWR revalidation (queueLoading true) does not lower composition readiness", () => {
        const r = resolveWorkUnitReadiness({ ...base, openedFromCache: true, queueLoading: true });
        expect(r.coldCompositionReady).toBe(true); // retained render is never blanked
        expect(r.interactionReady).toBe(false); // but it is not "fully interactive" mid-refresh
    });

    it("a known-empty queue that has settled is ready (no loading flash)", () => {
        // queueSettledOnce true with zero rows is still ready — empties never hold the boundary.
        expect(resolveWorkUnitReadiness(base).coldCompositionReady).toBe(true);
    });

    it("interaction readiness also requires the action rail to have settled", () => {
        expect(resolveWorkUnitReadiness({ ...base, rightRailSettled: false }).interactionReady).toBe(false);
        expect(resolveWorkUnitReadiness(base).interactionReady).toBe(true);
    });

    it("no identity → nothing is ready", () => {
        const r = resolveWorkUnitReadiness({ ...base, hasIdentity: false });
        expect(r.shellReady).toBe(false);
        expect(r.coldCompositionReady).toBe(false);
    });

    it("a populated view does NOT reveal until its subject is committed (no empty-panel flash)", () => {
        // Rows settled but the default subject has not opened yet → hold the reveal one render.
        const r = resolveWorkUnitReadiness({ ...base, selectionCommitted: false });
        expect(r.coldCompositionReady).toBe(false);
        expect(r.retainedCompositionReady).toBe(false);
    });

    it("a cached return does NOT reveal until the retained subject is committed", () => {
        const r = resolveWorkUnitReadiness({ ...base, openedFromCache: true, selectionCommitted: false });
        expect(r.retainedCompositionReady).toBe(false);
        expect(r.coldCompositionReady).toBe(false);
    });

    it("once the subject commits, the reveal proceeds (cold and cached alike)", () => {
        expect(resolveWorkUnitReadiness({ ...base, selectionCommitted: true }).coldCompositionReady).toBe(true);
        expect(
            resolveWorkUnitReadiness({ ...base, openedFromCache: true, selectionCommitted: true })
                .retainedCompositionReady,
        ).toBe(true);
    });
});
