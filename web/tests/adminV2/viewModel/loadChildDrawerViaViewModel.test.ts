import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildChildDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import {
    clearChildDrawerVmLoadInFlightForTests,
    loadChildDrawerViaViewModel,
} from "@/lib/adminV2/viewModel/drawer/child/loadChildDrawerViaViewModel";
import {
    clearDrawerViewModelSessionCacheForTests,
    putDrawerViewModelCacheEntry,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";

vi.mock("@/lib/adminV2/viewModel/drawer/child/fetchChildDrawerViewModelClient", () => ({
    fetchChildDrawerViewModelClient: vi.fn(),
}));

import { fetchChildDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/child/fetchChildDrawerViewModelClient";

import { minimalSettledChildDrawerViewModel } from "./fixtures/minimalSettledChildDrawerViewModel";

const workspaceContext = { department_id: "dept-1", work_unit_id: "wu-1" };
const cacheContext = { departmentId: "dept-1", workUnitId: "wu-1" };

describe("loadChildDrawerViaViewModel", () => {
    const prevKill = process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH;

    beforeEach(() => {
        vi.mocked(fetchChildDrawerViewModelClient).mockReset();
        clearDrawerViewModelSessionCacheForTests();
        clearChildDrawerVmLoadInFlightForTests();
        delete process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH;
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH = prevKill;
        clearDrawerViewModelSessionCacheForTests();
        clearChildDrawerVmLoadInFlightForTests();
    });

    it("uses VM session cache on warm linked swap without refetching", async () => {
        const vm = minimalSettledChildDrawerViewModel({ entity: { type: "person", id: "child-1" } });
        const preload = buildChildDrawerOpenPreloadFromViewModel(vm);
        putDrawerViewModelCacheEntry(
            {
                entityType: "persons",
                entityId: "child-1",
                surface: "child",
                preload,
                generation: vm.generation,
                cachedAt: Date.now(),
            },
            cacheContext
        );

        const result = await loadChildDrawerViaViewModel("child-1", {
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.open_path).toBe("cache_hit");
            expect(result.preload).toBe(preload);
        }
        expect(fetchChildDrawerViewModelClient).not.toHaveBeenCalled();
    });

    it("joins inflight cold fetch instead of duplicate network requests", async () => {
        const vm = minimalSettledChildDrawerViewModel({ entity: { type: "person", id: "child-1" } });
        let resolveFetch!: (value: { ok: true; viewModel: ChildDrawerViewModel }) => void;
        const fetchPromise = new Promise<{ ok: true; viewModel: ChildDrawerViewModel }>((resolve) => {
            resolveFetch = resolve;
        });
        vi.mocked(fetchChildDrawerViewModelClient).mockReturnValue(fetchPromise as never);

        const first = loadChildDrawerViaViewModel("child-1", {
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });
        const second = loadChildDrawerViaViewModel("child-1", {
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });

        resolveFetch({ ok: true, viewModel: vm });
        const [r1, r2] = await Promise.all([first, second]);

        expect(fetchChildDrawerViewModelClient).toHaveBeenCalledTimes(1);
        if (r1.ok && r2.ok) {
            expect(r1.open_path).toBe("cold_fetch");
            expect(r2.open_path).toBe("inflight_join");
        }
    });
});
