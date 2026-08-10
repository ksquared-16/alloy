import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prefetchLinkedPersonsFromOpportunityRecord } from "@/lib/admin/drawer/prefetchLinkedPersonsFromOpportunityRecord";
import {
    invalidateOperatorLifecycleLandingCache,
    loadOperatorLifecycleLandingCards,
    peekOperatorLifecycleLandingCards,
} from "@/lib/admin/loadOperatorLifecycleLandingClient";
import { prefetchVisibleWorkUnitDrawerPrimary } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import {
    clearWorkUnitSlugRouteCacheForTests,
    peekWorkUnitSlugRouteCache,
    putWorkUnitSlugRouteCache,
} from "@/lib/admin/workUnitSlugRouteCache";
import { platformSurfacePerfEnabled } from "@/lib/perf/platformSurfacePerfTrace";

vi.mock("@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation", () => ({
    prepareDrawerViewModelDeduped: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/admin/prefetchPersonDrawerSnapshot", () => ({
    prefetchPersonDrawerSnapshot: vi.fn(),
}));
vi.mock("@/lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm", () => ({
    warmVisibleQueueRowOpportunityVms: vi.fn(),
    warmQueueRowOpportunityVm: vi.fn(),
}));

import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { prefetchPersonDrawerSnapshot } from "@/lib/admin/prefetchPersonDrawerSnapshot";
import { warmVisibleQueueRowOpportunityVms } from "@/lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const PRIMARY = "11111111-1111-4111-8111-111111111111";

describe("platform surface perf stabilization pass 1", () => {
    beforeEach(() => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        delete process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH;
        delete process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH;
        vi.mocked(prepareDrawerViewModelDeduped).mockReset();
        vi.mocked(prefetchPersonDrawerSnapshot).mockReset();
        vi.mocked(warmVisibleQueueRowOpportunityVms).mockReset();
        clearWorkUnitSlugRouteCacheForTests();
        invalidateOperatorLifecycleLandingCache();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        invalidateOperatorLifecycleLandingCache();
        clearWorkUnitSlugRouteCacheForTests();
    });

    it("platform perf trace is enabled under Vitest", () => {
        expect(platformSurfacePerfEnabled()).toBe(true);
    });

    it("does not call legacy person snapshot prefetch on /workspace when VM cutover is on", () => {
        vi.stubGlobal("window", { location: { pathname: "/workspace/work-unit/new-leads" } });

        prefetchLinkedPersonsFromOpportunityRecord(
            { primary_person_id: PRIMARY },
            { source: "opportunity_drawer_idle" },
        );

        expect(prefetchPersonDrawerSnapshot).not.toHaveBeenCalled();
        expect(prepareDrawerViewModelDeduped).toHaveBeenCalled();
    });

    it("still uses legacy snapshot prefetch off canonical hosts", () => {
        vi.stubGlobal("window", { location: { pathname: "/legacy-admin/opportunities" } });

        prefetchLinkedPersonsFromOpportunityRecord(
            { primary_person_id: PRIMARY },
            { source: "opportunity_drawer_idle" },
        );

        expect(prefetchPersonDrawerSnapshot).toHaveBeenCalledWith(
            PRIMARY,
            expect.objectContaining({ source: "opportunity_drawer_idle" }),
        );
        expect(prepareDrawerViewModelDeduped).not.toHaveBeenCalled();
    });

    it("prefetchVisibleWorkUnitDrawerPrimary warms VM once per visible row set (no duplicate legacy+VM)", () => {
        prefetchVisibleWorkUnitDrawerPrimary(["opp-1", "opp-2"], {
            work_unit_id: "wu-1",
            department_id: "dept-1",
        });

        expect(warmVisibleQueueRowOpportunityVms).toHaveBeenCalledTimes(1);
        expect(warmVisibleQueueRowOpportunityVms).toHaveBeenCalledWith(
            ["opp-1", "opp-2"],
            { work_unit_id: "wu-1", department_id: "dept-1" },
        );
    });

    it("work-unit slug resolution is session-cached across drawer URL changes", () => {
        putWorkUnitSlugRouteCache("new-leads", {
            routeSlug: "new-leads",
            departmentId: "dept-1",
            departmentName: null,
            workUnitId: "wu-1",
            workUnitKey: "new_leads",
            workUnitName: "New Leads",
            initialQueueKey: "inbox",
            initialWorkViewId: null,
        });

        expect(peekWorkUnitSlugRouteCache("new-leads")?.workUnitId).toBe("wu-1");
        expect(peekWorkUnitSlugRouteCache("new-leads")?.departmentId).toBe("dept-1");
    });

    it("WorkUnitSlugRouteHost keeps slug fetch scoped to workUnitSlug (drawer recordId does not remount)", () => {
        const host = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        expect(host).toContain("peekWorkUnitSlugRouteCache");
        expect(host).toMatch(/\}, \[workUnitSlug\]\);/);
        expect(host).not.toMatch(/fetchQueueItems/);
        expect(host).toContain("routeRecordIdFromPath");
    });

    it("work-unit page does not refetch queue when drawer opens or closes", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        const primaryLaneEffectDeps = page.match(
            /void fetchQueueItems\(sel\.workUnitId, sel\.queueKey, null\);\s*\}, \[([^\]]*)\]\);/,
        )?.[1];
        expect(primaryLaneEffectDeps).toBeDefined();
        expect(primaryLaneEffectDeps).not.toMatch(/\bdrawer\b/);

        // fetchQueueItems now lives in the canonical useWorkUnitQueueRuntime hook (the primary-lane
        // effect that calls it stays in the page — asserted above).
        const hook = read("lib/adminV2/runtime/queue/useWorkUnitQueueRuntime.ts");
        // Row-action callbacks are now accessed via lateDepsRef, so the fetchQueueItems dep array is
        // just the scope/lane scalars — still no `drawer`.
        const fetchQueueItemsDepsBlock = hook.match(
            /\},\s*\n\s*\[\s*\n\s*laneUnmappedOnly,\s*\n\s*viewScopeFingerprint,\s*\n\s*selectedSiteId,\s*\n\s*\]/,
        );
        expect(fetchQueueItemsDepsBlock).not.toBeNull();
        expect(hook).not.toMatch(
            /const fetchQueueItems = useCallback[\s\S]*?\], \[([\s\S]*?\bdrawer\b[\s\S]*?)\]\s*\)/,
        );
    });

    it("Sidebar initializes lifecycle catalog from session cache without loading flash", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("peekOperatorLifecycleLandingCards");
        expect(sidebar).toMatch(/useState\([\s\S]*peekOperatorLifecycleLandingCards/);
    });

    it("loadOperatorLifecycleLandingCards returns cached cards without refetching catalog", async () => {
        const { resetWorkspaceAdminFetchDedupeForTests } = await import(
            "@/lib/workspace/workspaceAdminFetchDedupe"
        );
        resetWorkspaceAdminFetchDedupeForTests();
        invalidateOperatorLifecycleLandingCache();

        const fetchMock = vi.fn().mockImplementation(async () =>
            new Response(JSON.stringify({ items: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await loadOperatorLifecycleLandingCards({ includeRollups: false });
        const firstCallCount = fetchMock.mock.calls.length;
        expect(firstCallCount).toBe(3);
        expect(peekOperatorLifecycleLandingCards()).not.toBeNull();

        await loadOperatorLifecycleLandingCards({ includeRollups: false });
        expect(fetchMock.mock.calls.length).toBe(firstCallCount);
    });
});
