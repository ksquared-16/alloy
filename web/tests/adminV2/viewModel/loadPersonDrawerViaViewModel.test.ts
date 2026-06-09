import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPersonDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import {
    clearPersonDrawerVmLoadInFlightForTests,
    loadPersonDrawerViaViewModel,
} from "@/lib/adminV2/viewModel/drawer/person/loadPersonDrawerViaViewModel";
import {
    clearDrawerViewModelSessionCacheForTests,
    putDrawerViewModelCacheEntry,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";

vi.mock("@/lib/adminV2/viewModel/drawer/person/fetchPersonDrawerViewModelClient", () => ({
    fetchPersonDrawerViewModelClient: vi.fn(),
}));

import { fetchPersonDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/person/fetchPersonDrawerViewModelClient";

import { minimalSettledPersonDrawerViewModel } from "./fixtures/minimalSettledPersonDrawerViewModel";

const workspaceContext = { department_id: "dept-1", work_unit_id: "wu-1" };
const cacheContext = { departmentId: "dept-1", workUnitId: "wu-1" };

describe("loadPersonDrawerViaViewModel", () => {
    const prevKill = process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH;

    beforeEach(() => {
        vi.mocked(fetchPersonDrawerViewModelClient).mockReset();
        clearDrawerViewModelSessionCacheForTests();
        clearPersonDrawerVmLoadInFlightForTests();
        delete process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH;
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH = prevKill;
        clearDrawerViewModelSessionCacheForTests();
        clearPersonDrawerVmLoadInFlightForTests();
    });

    it("uses VM session cache on warm linked swap without refetching", async () => {
        const vm = minimalSettledPersonDrawerViewModel({ entity: { type: "person", id: "person-1" } });
        const preload = buildPersonDrawerOpenPreloadFromViewModel(vm);
        putDrawerViewModelCacheEntry(
            {
                entityType: "persons",
                entityId: "person-1",
                surface: "person:parent",
                preload,
                generation: vm.generation,
                cachedAt: Date.now(),
            },
            cacheContext
        );

        const result = await loadPersonDrawerViaViewModel("person-1", {
            openSource: "opportunity_primary_contact",
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.open_path).toBe("cache_hit");
            expect(result.compose_ms).toBe(0);
            expect(result.preload).toBe(preload);
        }
        expect(fetchPersonDrawerViewModelClient).not.toHaveBeenCalled();
    });

    it("joins inflight cold fetch instead of duplicate network requests", async () => {
        const vm = minimalSettledPersonDrawerViewModel({ entity: { type: "person", id: "person-1" } });
        let resolveFetch!: (value: { ok: true; viewModel: PersonDrawerViewModel }) => void;
        const fetchPromise = new Promise<{ ok: true; viewModel: PersonDrawerViewModel }>((resolve) => {
            resolveFetch = resolve;
        });
        vi.mocked(fetchPersonDrawerViewModelClient).mockReturnValue(fetchPromise as never);

        const first = loadPersonDrawerViaViewModel("person-1", {
            openSource: "opportunity_primary_contact",
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });
        const second = loadPersonDrawerViaViewModel("person-1", {
            openSource: "opportunity_primary_contact",
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });

        resolveFetch({ ok: true, viewModel: vm });
        const [r1, r2] = await Promise.all([first, second]);

        expect(fetchPersonDrawerViewModelClient).toHaveBeenCalledTimes(1);
        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);
        if (r1.ok && r2.ok) {
            expect(r1.open_path).toBe("cold_fetch");
            expect(r2.open_path).toBe("inflight_join");
        }
    });

    it("emits linked_swap perf phases for cache hit and cold fetch", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const vm = minimalSettledPersonDrawerViewModel({ entity: { type: "person", id: "person-1" } });
        vi.mocked(fetchPersonDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });

        await loadPersonDrawerViaViewModel("person-1", {
            openSource: "opportunity_primary_contact",
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });
        expect(
            warn.mock.calls.some(
                (call) =>
                    String(call[0]).includes("[perf:drawer]") &&
                    (call[1] as { phase?: string })?.phase === "linked_swap_cold_fetch"
            )
        ).toBe(true);

        warn.mockClear();
        await loadPersonDrawerViaViewModel("person-1", {
            openSource: "opportunity_primary_contact",
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });
        expect(
            warn.mock.calls.some(
                (call) =>
                    String(call[0]).includes("[perf:drawer]") &&
                    (call[1] as { phase?: string })?.phase === "linked_swap_cache_hit"
            )
        ).toBe(true);

        warn.mockRestore();
    });
});
