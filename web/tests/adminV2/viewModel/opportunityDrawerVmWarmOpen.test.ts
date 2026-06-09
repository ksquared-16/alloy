import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadOpportunityDrawerComposedOpen } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import {
    clearDrawerViewModelSessionCacheForTests,
    putDrawerViewModelCacheEntry,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { clearOpportunityDrawerVmLoadInFlightForTests } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";

vi.mock("@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient", () => ({
    fetchOpportunityDrawerViewModelClient: vi.fn(),
}));

import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";

import { minimalSettledOpportunityDrawerViewModel } from "./fixtures/minimalSettledOpportunityDrawerViewModel";

describe("loadOpportunityDrawerComposedOpen VM warm telemetry", () => {
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

    it("reports prefetch_hit when VM session cache is warm", async () => {
        const vm = minimalSettledOpportunityDrawerViewModel({ generation: "gen-warm" });
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
            { departmentId: "dept-1", workUnitId: "wu-1" }
        );

        const { metrics } = await loadOpportunityDrawerComposedOpen("opp-1", {
            department_id: "dept-1",
            work_unit_id: "wu-1",
        });

        expect(metrics.prefetch_hit).toBe(true);
        expect(metrics.primary_warm).toBe(true);
        expect(metrics.primary_ms).toBe(0);
        expect(fetchOpportunityDrawerViewModelClient).not.toHaveBeenCalled();
    });

    it("reports cold path when VM cache misses", async () => {
        const vm = minimalSettledOpportunityDrawerViewModel({ generation: "gen-cold" });
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });

        const { metrics } = await loadOpportunityDrawerComposedOpen("opp-1", {
            department_id: "dept-1",
            work_unit_id: "wu-1",
        });

        expect(metrics.prefetch_hit).toBe(false);
        expect(metrics.primary_warm).toBe(false);
        expect(fetchOpportunityDrawerViewModelClient).toHaveBeenCalledTimes(1);
    });
});
