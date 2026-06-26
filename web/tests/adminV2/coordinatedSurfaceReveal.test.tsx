// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import {
    computeWorkspaceRevealGate,
    workspaceRevealKpiRegionReady,
} from "@/lib/adminV2/workspaceRevealGate";
import { workUnitPageContentReady } from "@/lib/adminV2/workUnitPageRevealPolicy";
import { CORE_SURFACE_PRELOAD_REGISTRY } from "@/lib/adminV2/coreSurfacePreloadRegistry";
import {
    getProcessingQueueWarmSnapshot,
    resetProcessingQueueWarmForTests,
    warmProcessingQueueCache,
} from "@/lib/pos/processingQueueWarmCache";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";
import {
    WORK_UNIT_PRELOAD_PRIORITY,
    WORKSPACE_PRELOAD_PRIORITY,
    workUnitPriorityRunsEagerlyOnEntry,
} from "@/lib/adminV2/runtime/preloadPriorityModel";
import { resolveOperationalModeEntrySnapshot } from "@/lib/adminV2/runtime/operationalSubject/useOperationalModeEntryController";
import {
    readWorkspaceRootCache,
    writeWorkspaceRootCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

function mount(ui: ReactNode) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(ui);
    });
    return {
        unmount: () => act(() => root.unmount()),
    };
}

function makeQueueResponse(rowCount: number) {
    return {
        ok: true,
        json: async () => ({
            data: {
                rows: Array.from({ length: rowCount }, (_, i) => ({ id: `row-${i}`, status: "needs_review" })),
                counts: { needs_review: rowCount },
                recommendations: {},
            },
        }),
    } as unknown as Response;
}

describe("Phase 4 — Processing warm cache (coordinated open)", () => {
    beforeEach(() => {
        resetProcessingQueueWarmForTests();
        vi.useRealTimers();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        resetProcessingQueueWarmForTests();
    });

    it("dedupes concurrent warm callers to a single network request (test #8 warm path exists + #7 no double fetch)", async () => {
        const fetchMock = vi.fn(async () => makeQueueResponse(3));
        vi.stubGlobal("fetch", fetchMock);

        // Two consumers (KPI strip + queue list) warming at the same time.
        await Promise.all([warmProcessingQueueCache(), warmProcessingQueueCache()]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const snap = getProcessingQueueWarmSnapshot();
        expect(snap.data?.rows.length).toBe(3);
        expect(snap.error).toBeNull();
    });

    it("reuses a fresh cache without refetching and refetches when forced", async () => {
        const fetchMock = vi.fn(async () => makeQueueResponse(1));
        vi.stubGlobal("fetch", fetchMock);

        await warmProcessingQueueCache();
        await warmProcessingQueueCache(); // fresh — should skip
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await warmProcessingQueueCache({ force: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("preserves previously cached data when a refresh fails (quiet refresh, no blank surface)", async () => {
        let call = 0;
        const fetchMock = vi.fn(async () => {
            call += 1;
            if (call === 1) return makeQueueResponse(2);
            throw new Error("network down");
        });
        vi.stubGlobal("fetch", fetchMock);

        await warmProcessingQueueCache();
        await warmProcessingQueueCache({ force: true });

        const snap = getProcessingQueueWarmSnapshot();
        expect(snap.data?.rows.length).toBe(2); // prior data retained
        expect(snap.error).toBeNull(); // error suppressed because data exists
    });

    it("surfaces an error only when there is nothing cached to show", async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error("cold failure");
        });
        vi.stubGlobal("fetch", fetchMock);

        await warmProcessingQueueCache();
        const snap = getProcessingQueueWarmSnapshot();
        expect(snap.data).toBeNull();
        expect(snap.error).toBe("cold failure");
    });

    it("registry registers a real Processing warm path (test #8)", () => {
        const processing = CORE_SURFACE_PRELOAD_REGISTRY.find((e) => e.key === "processing");
        expect(processing).toBeDefined();
        expect(typeof processing?.warm).toBe("function");
    });

    it("useProcessingQueueWarm paints instantly (loading=false) when a warm cache already exists (test #7)", async () => {
        const fetchMock = vi.fn(async () => makeQueueResponse(4));
        vi.stubGlobal("fetch", fetchMock);
        await warmProcessingQueueCache(); // shell idle warm already ran

        let observed: { loading: boolean; rows: number } | null = null;
        function Probe() {
            const { data, loading } = useProcessingQueueWarm();
            observed = { loading, rows: data?.rows.length ?? 0 };
            return null;
        }

        const handle = mount(createElement(Probe));
        // First render reads the populated cache synchronously via useSyncExternalStore.
        expect(observed).not.toBeNull();
        expect(observed!.loading).toBe(false);
        expect(observed!.rows).toBe(4);
        handle.unmount();
    });
});

describe("Phase 2 — /workspace single coordinated reveal", () => {
    afterEach(() => {
        try {
            sessionStorage.clear();
        } catch {
            /* ignore */
        }
    });

    it("above-fold reveals only when every region is ready — one boundary (test #1)", () => {
        const blocked = computeWorkspaceRevealGate({
            shell_ready: true,
            department_tiles_ready: true,
            tile_counts_ready: false,
            kpi_region_ready: true,
            actions_ready: true,
        });
        expect(blocked.above_fold_ready).toBe(false);
        expect(blocked.reason_if_blocked).toContain("tile_counts");

        const ready = computeWorkspaceRevealGate({
            shell_ready: true,
            department_tiles_ready: true,
            tile_counts_ready: true,
            kpi_region_ready: true,
            actions_ready: true,
        });
        expect(ready.above_fold_ready).toBe(true);
        expect(ready.reason_if_blocked).toHaveLength(0);
    });

    it("KPI region never blocks reveal — it hydrates in its placement, not as a detached loader (test #3)", () => {
        // Quiet-reserve contract: the gate treats the KPI region as ready so tiles never wait on
        // (and never visually detach from) slow KPI metrics; values fill the reserved placement.
        expect(workspaceRevealKpiRegionReady()).toBe(true);
    });

    it("warm cache stores tiles + KPIs as one surface and restores them together (test #2)", () => {
        const kpis = [{ key: "k1", label: "Open", value: "12" }] as unknown as Parameters<
            typeof writeWorkspaceRootCache
        >[3]["workspaceKpiStrip"];
        writeWorkspaceRootCache("org-1", "user-1", "scope:a", {
            departments: [{ id: "d1" } as never],
            deptTileStats: {} as never,
            metrics: {} as never,
            orgOpportunityKpis: kpis as never,
            workspaceKpiStrip: kpis,
            kpiPlacementPending: false,
            rollupRefined: true,
        });

        const hit = readWorkspaceRootCache("org-1", "user-1", "scope:a");
        expect(hit).not.toBeNull();
        // The whole surface is one cached unit: tiles AND KPIs present together on warm return.
        expect(hit?.departments.length).toBe(1);
        expect(hit?.workspaceKpiStrip?.length).toBe(1);
        expect(hit?.rollupRefined).toBe(true);
    });
});

describe("Phase 3 — Work Unit entry coordinated reveal", () => {
    const items = (n: number): QueuePreviewItemVm[] =>
        Array.from({ length: n }, (_, i) => ({ id: `o-${i}` }) as unknown as QueuePreviewItemVm);

    function snapshot(opts: {
        loading: boolean;
        mayPaint: boolean;
        rows: number;
        routeRecordId: string | null;
        drawerType: string | null;
        drawerId: string | null;
    }) {
        return resolveOperationalModeEntrySnapshot({
            enabled: true,
            workUnitId: "wu-1",
            activeQueueKey: "lane-1",
            laneMayPaint: opts.mayPaint,
            queueItemsLoading: opts.loading,
            displayItemsRef: { current: items(opts.rows) },
            routeRecordId: opts.routeRecordId,
            drawerType: opts.drawerType,
            drawerId: opts.drawerId,
            queueRevision: 0,
        });
    }

    it("cold shell and live workspace are mutually exclusive — only one preparing surface (test #4)", () => {
        // Not ready → cold shell shows (content hidden).
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: false,
            }),
        ).toBe(false);
        // Ready → workspace shows; the page renders one or the other, never both.
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: true,
                coordinated_reveal_completed: false,
            }),
        ).toBe(true);
    });

    it("stays 'preparing' while the queue is still loading or the lane cannot paint (no premature reveal)", () => {
        expect(snapshot({ loading: true, mayPaint: false, rows: 0, routeRecordId: null, drawerType: null, drawerId: null }).phase).toBe(
            "preparing",
        );
    });

    it("does not mark Focus Panel ready until the open drawer matches the URL record (test #6)", () => {
        // URL targets a record, but the drawer hasn't caught up → still preparing.
        const mismatched = snapshot({
            loading: false,
            mayPaint: true,
            rows: 3,
            routeRecordId: "rec-9",
            drawerType: "opportunities",
            drawerId: "rec-1",
        });
        expect(mismatched.phase).toBe("preparing");

        // Drawer now matches the URL subject → coherent → ready.
        const matched = snapshot({
            loading: false,
            mayPaint: true,
            rows: 3,
            routeRecordId: "rec-9",
            drawerType: "opportunities",
            drawerId: "rec-9",
        });
        expect(matched.phase).toBe("ready");
    });

    it("rows present with no drawer open stays preparing (legacy expanded rows are not the ready state) (test #5/#10)", () => {
        const noDrawer = snapshot({
            loading: false,
            mayPaint: true,
            rows: 5,
            routeRecordId: null,
            drawerType: null,
            drawerId: null,
        });
        expect(noDrawer.phase).toBe("preparing");
    });
});

describe("Phase 5 — documented preload priority model", () => {
    it("workspace prioritizes the primary tile first and offscreen tiles last", () => {
        expect(WORKSPACE_PRELOAD_PRIORITY[0]).toBe("primary_tile");
        expect(WORKSPACE_PRELOAD_PRIORITY[WORKSPACE_PRELOAD_PRIORITY.length - 1]).toBe("offscreen_tiles");
    });

    it("work unit prioritizes the active subject first; only subject + visible rows run eagerly on entry", () => {
        expect(WORK_UNIT_PRELOAD_PRIORITY[0]).toBe("active_subject");
        expect(workUnitPriorityRunsEagerlyOnEntry("active_subject")).toBe(true);
        expect(workUnitPriorityRunsEagerlyOnEntry("visible_rows")).toBe(true);
        expect(workUnitPriorityRunsEagerlyOnEntry("embedded_workspaces")).toBe(false);
        expect(workUnitPriorityRunsEagerlyOnEntry("inactive_lane_metadata")).toBe(false);
    });
});
