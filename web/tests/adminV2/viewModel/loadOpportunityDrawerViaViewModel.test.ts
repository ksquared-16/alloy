import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { opportunityDrawerComposedRevealReady } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import {
    clearOpportunityDrawerVmLoadInFlightForTests,
    loadOpportunityDrawerViaViewModel,
} from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import {
    clearDrawerViewModelSessionCacheForTests,
    putDrawerViewModelCacheEntry,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

vi.mock("@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient", () => ({
    fetchOpportunityDrawerViewModelClient: vi.fn(),
}));

import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";

import { minimalSettledOpportunityDrawerViewModel } from "./fixtures/minimalSettledOpportunityDrawerViewModel";

function settledVm() {
    return minimalSettledOpportunityDrawerViewModel({
        generation: "gen-1",
        actions: { header: [], header_menu: [] },
        header: {
            title: "Opp",
            subtitle: null,
            status: { renderAs: "readonly_pill", label: "New" },
            oper_trust_preview: null,
        },
    });
}

const workspaceContext = {
    department_id: "dept-1",
    work_unit_id: "wu-1",
};

const cacheContext = {
    departmentId: "dept-1",
    workUnitId: "wu-1",
};

describe("loadOpportunityDrawerViaViewModel", () => {
    const prevKill = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;

    beforeEach(() => {
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockReset();
        clearDrawerViewModelSessionCacheForTests();
        clearOpportunityDrawerVmLoadInFlightForTests();
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = prevKill;
        clearDrawerViewModelSessionCacheForTests();
        clearOpportunityDrawerVmLoadInFlightForTests();
    });

    it("returns cutover_disabled when kill switch is active", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = "1";
        const result = await loadOpportunityDrawerViaViewModel("opp-1", null);
        expect(result).toEqual({ ok: false, reason: "cutover_disabled" });
        expect(fetchOpportunityDrawerViewModelClient).not.toHaveBeenCalled();
    });

    it("loads VM without NEXT_PUBLIC_ADMINV2_DRAWER_VM", async () => {
        const vm = settledVm();
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });
        const result = await loadOpportunityDrawerViaViewModel("opp-1", null);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.open_path).toBe("cold_fetch");
        }
    });

    it("returns skipped on classic 422", async () => {
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "classic_layout_deferred",
                compose_version: "1.0.0",
            },
            status: 422,
        });
        const result = await loadOpportunityDrawerViaViewModel("opp-1", null);
        expect(result).toEqual({ ok: false, reason: "skipped", skip_reason: "classic_layout_deferred" });
    });

    it("returns fetch_failed on network error status", async () => {
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({
            ok: false,
            error: "drawer_vm_fetch_500",
            status: 500,
        });
        const result = await loadOpportunityDrawerViaViewModel("opp-1", null);
        expect(result).toEqual({ ok: false, reason: "fetch_failed" });
    });

    it("returns settled preload when VM succeeds on cold fetch", async () => {
        const vm = settledVm();
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });
        const result = await loadOpportunityDrawerViaViewModel("opp-1", workspaceContext);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.preload.openPath).toBe("view_model");
            expect(result.compose_ms).toBe(40);
            expect(result.open_path).toBe("cold_fetch");
            expect(opportunityDrawerComposedRevealReady(result.preload)).toBe(true);
        }
    });

    it("uses VM session cache on warm open without refetching", async () => {
        const vm = settledVm();
        const preload = buildOpportunityDrawerOpenPreloadFromViewModel(vm);
        putDrawerViewModelCacheEntry(
            {
                entityType: "opportunities",
                entityId: "opp-1",
                surface: "opportunity",
                preload,
                generation: vm.generation,
                cachedAt: Date.now(),
            },
            cacheContext
        );

        const result = await loadOpportunityDrawerViaViewModel("opp-1", workspaceContext);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.open_path).toBe("cache_hit");
            expect(result.compose_ms).toBe(0);
            expect(result.preload).toBe(preload);
        }
        expect(fetchOpportunityDrawerViewModelClient).not.toHaveBeenCalled();
    });

    it("joins inflight cold fetch instead of starting duplicate network requests", async () => {
        const vm = settledVm();
        let resolveFetch!: (value: { ok: true; viewModel: OpportunityDrawerViewModel }) => void;
        const fetchPromise = new Promise<{ ok: true; viewModel: OpportunityDrawerViewModel }>((resolve) => {
            resolveFetch = resolve;
        });
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockReturnValue(fetchPromise as never);

        const first = loadOpportunityDrawerViaViewModel("opp-1", workspaceContext);
        const second = loadOpportunityDrawerViaViewModel("opp-1", workspaceContext);

        resolveFetch({ ok: true, viewModel: vm });
        const [r1, r2] = await Promise.all([first, second]);

        expect(fetchOpportunityDrawerViewModelClient).toHaveBeenCalledTimes(1);
        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);
        if (r1.ok && r2.ok) {
            expect(r1.open_path).toBe("cold_fetch");
            expect(r2.open_path).toBe("inflight_join");
            expect(r1.preload).toBe(r2.preload);
        }
    });

    it("emits perf drawer phases for cache hit and cold fetch", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const vm = settledVm();
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });

        await loadOpportunityDrawerViaViewModel("opp-1", workspaceContext);
        expect(
            warn.mock.calls.some(
                (call) =>
                    String(call[0]).includes("[perf:drawer]") &&
                    (call[1] as { phase?: string })?.phase === "cold_fetch"
            )
        ).toBe(true);

        warn.mockClear();
        await loadOpportunityDrawerViaViewModel("opp-1", workspaceContext);
        expect(
            warn.mock.calls.some(
                (call) =>
                    String(call[0]).includes("[perf:drawer]") &&
                    (call[1] as { phase?: string })?.phase === "cache_hit"
            )
        ).toBe(true);

        warn.mockRestore();
    });

    it("logs scope_mismatch when cache exists under a different scope key", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const vm = settledVm();
        const preload = buildOpportunityDrawerOpenPreloadFromViewModel(vm);
        putDrawerViewModelCacheEntry(
            {
                entityType: "opportunities",
                entityId: "opp-1",
                surface: "opportunity",
                preload,
                generation: vm.generation,
                cachedAt: Date.now(),
            },
            { orgId: "org-other", departmentId: "dept-1", workUnitId: "wu-1" }
        );
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });

        await loadOpportunityDrawerViaViewModel("opp-1", workspaceContext);

        expect(
            warn.mock.calls.some(
                (call) =>
                    String(call[0]).includes("[perf:drawer]") &&
                    (call[1] as { phase?: string; skipped_reason?: string })?.phase === "cache_miss" &&
                    (call[1] as { skipped_reason?: string })?.skipped_reason === "scope_mismatch"
            )
        ).toBe(true);

        warn.mockRestore();
    });
});
