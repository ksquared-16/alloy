/**
 * Trust Closure — prefetch consumes the canonical cache. Warming a Work Unit writes the SAME session
 * cache entries (config + summaries + rows) the runtime seeds from, under the SAME org/dept/wu/user/
 * scope key. So a subsequent navigation reads the prewarm (no cold waterfall) and — because the
 * seeded rows are fresh — the runtime's queue fresh-skip means no duplicate rows request. (Sprint §7.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    warmWorkUnitSurfaceSession,
    clearWorkUnitSurfaceWarmInflightForTests,
} from "@/lib/presentation/runtime/warmWorkUnitSurfaceSession";
import { computeWorkUnitSurfaceInitialSeed } from "@/lib/presentation/runtime/workUnitSurfaceSeed";
import {
    peekWorkUnitSurfaceConfigCache,
    clearWorkUnitViewModelSessionCacheForTests,
    type WorkUnitViewModelCacheContext,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import { resetWorkspaceAdminFetchDedupeForTests } from "@/lib/workspace/workspaceAdminFetchDedupe";
import type { WorkUnitSlugRouteCacheEntry } from "@/lib/admin/workUnitSlugRouteCache";
import type { WorkUnitSlugRouteValue } from "@/contexts/WorkUnitSlugRouteContext";

const CTX: WorkUnitViewModelCacheContext = {
    orgId: "org-1",
    departmentId: "dept-1",
    workUnitId: "wu-1",
    userId: "user-1",
    scopeFingerprint: "scope:1",
};

const ENTRY = {
    routeSlug: "wu-a",
    departmentId: "dept-1",
    departmentName: "Dept",
    workUnitId: "wu-1",
    workUnitKey: "wu-a",
    workUnitName: "WU A",
    initialQueueKey: "all",
    initialWorkViewId: null,
} as WorkUnitSlugRouteCacheEntry;

const SLUG = {
    ...ENTRY,
    routeRecordId: null,
} as unknown as WorkUnitSlugRouteValue;

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

/** Route each admin URL to a canned payload; count how many times the rows endpoint is hit. */
function installFetchMock(opts: { failCore?: boolean } = {}) {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/api/admin/departments/")) {
            return opts.failCore ? new Response("nope", { status: 500 }) : jsonResponse({ metadata: null });
        }
        if (url.includes("/api/admin/work-units/wu-1/queues")) return jsonResponse({ queues: [] });
        if (/\/api\/admin\/work-units\/wu-1(\?|$)/.test(url)) {
            return opts.failCore ? new Response("nope", { status: 500 }) : jsonResponse({ queue_definition: null });
        }
        if (url.includes("/api/admin/work-units?department_id=")) return jsonResponse({ items: [] });
        if (url.includes("/api/admin/queue-row-layout/")) return jsonResponse(null);
        if (url.includes("/api/admin/queues/wu-1/all")) return jsonResponse({ queue: { key: "all" }, items: [], total: 4, limit: 20, offset: 0 });
        return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return { calls };
}

beforeEach(() => {
    clearWorkUnitViewModelSessionCacheForTests();
    resetWorkspaceAdminFetchDedupeForTests();
    clearWorkUnitSurfaceWarmInflightForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearWorkUnitViewModelSessionCacheForTests();
    resetWorkspaceAdminFetchDedupeForTests();
    clearWorkUnitSurfaceWarmInflightForTests();
});

describe("prefetch → navigation cache consumption", () => {
    it("writes config + rows to the cache, and navigation seeds them synchronously (fresh)", async () => {
        installFetchMock();
        await warmWorkUnitSurfaceSession({ entry: ENTRY, selectedSiteId: null, cacheContext: CTX });

        const seed = computeWorkUnitSurfaceInitialSeed({ cacheContext: CTX, slugRoute: SLUG, selectedSiteId: null });
        expect(seed.config).not.toBeNull();
        expect(seed.configFresh).toBe(true);
        expect(seed.queueResult?.total).toBe(4);
        expect(seed.queueFresh).toBe(true); // → runtime skips the initial rows revalidate (no duplicate)
    });

    it("a repeated warm while one is in flight does not double-fetch the config", async () => {
        const { calls } = installFetchMock();
        await Promise.all([
            warmWorkUnitSurfaceSession({ entry: ENTRY, selectedSiteId: null, cacheContext: CTX }),
            warmWorkUnitSurfaceSession({ entry: ENTRY, selectedSiteId: null, cacheContext: CTX }),
        ]);
        const deptCalls = calls.filter((u) => u.includes("/api/admin/departments/")).length;
        expect(deptCalls).toBe(1); // in-flight guard + dedupeAdminFetch coalesce
    });

    it("a fresh cache short-circuits a later warm (no refetch)", async () => {
        const first = installFetchMock();
        await warmWorkUnitSurfaceSession({ entry: ENTRY, selectedSiteId: null, cacheContext: CTX });
        const firstCount = first.calls.length;
        // Second warm shortly after: config is fresh → returns immediately without fetching.
        await warmWorkUnitSurfaceSession({ entry: ENTRY, selectedSiteId: null, cacheContext: CTX });
        expect(first.calls.length).toBe(firstCount);
    });

    it("a failed prewarm leaves the cold path untouched (nothing cached)", async () => {
        installFetchMock({ failCore: true });
        await warmWorkUnitSurfaceSession({ entry: ENTRY, selectedSiteId: null, cacheContext: CTX });
        expect(peekWorkUnitSurfaceConfigCache(CTX)).toBeNull();
        const seed = computeWorkUnitSurfaceInitialSeed({ cacheContext: CTX, slugRoute: SLUG, selectedSiteId: null });
        expect(seed.config).toBeNull();
        expect(seed.queueResult).toBeNull();
    });

    it("a prewarm under one org is not readable by another org", async () => {
        installFetchMock();
        await warmWorkUnitSurfaceSession({ entry: ENTRY, selectedSiteId: null, cacheContext: CTX });
        const seed = computeWorkUnitSurfaceInitialSeed({
            cacheContext: { ...CTX, orgId: "org-2" },
            slugRoute: SLUG,
            selectedSiteId: null,
        });
        expect(seed.config).toBeNull();
    });
});
