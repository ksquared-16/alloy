import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    clearOpportunityDrawerVmLoadInFlightForTests,
    loadOpportunityDrawerViaViewModel,
} from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import {
    clearPersonDrawerVmLoadInFlightForTests,
    loadPersonDrawerViaViewModel,
} from "@/lib/adminV2/viewModel/drawer/person/loadPersonDrawerViaViewModel";
import {
    clearChildDrawerVmLoadInFlightForTests,
    loadChildDrawerViaViewModel,
} from "@/lib/adminV2/viewModel/drawer/child/loadChildDrawerViaViewModel";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { clearDrawerViewModelSessionCacheForTests } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { prefetchViewPersonOnPointerDown } from "@/lib/admin/drawer/openViewPersonFromOpportunity";

vi.mock("@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient", () => ({
    fetchOpportunityDrawerViewModelClient: vi.fn(),
}));
vi.mock("@/lib/adminV2/viewModel/drawer/person/fetchPersonDrawerViewModelClient", () => ({
    fetchPersonDrawerViewModelClient: vi.fn(),
}));
vi.mock("@/lib/adminV2/viewModel/drawer/child/fetchChildDrawerViewModelClient", () => ({
    fetchChildDrawerViewModelClient: vi.fn(),
}));
vi.mock("@/lib/admin/prefetchPersonDrawerSnapshot", () => ({
    prefetchPersonDrawerSnapshot: vi.fn(),
    isPersonDrawerSnapshotWarm: vi.fn(() => false),
}));

import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";
import { fetchPersonDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/person/fetchPersonDrawerViewModelClient";
import { fetchChildDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/child/fetchChildDrawerViewModelClient";
import { prefetchPersonDrawerSnapshot } from "@/lib/admin/prefetchPersonDrawerSnapshot";

import { minimalSettledChildDrawerViewModel } from "./fixtures/minimalSettledChildDrawerViewModel";
import { minimalSettledOpportunityDrawerViewModel } from "./fixtures/minimalSettledOpportunityDrawerViewModel";
import { minimalSettledPersonDrawerViewModel } from "./fixtures/minimalSettledPersonDrawerViewModel";

const workspaceContext = { department_id: "dept-1", work_unit_id: "wu-1" };
const cacheContext = { departmentId: "dept-1", workUnitId: "wu-1" };

describe("linked drawer VM warm paths", () => {
    beforeEach(() => {
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockReset();
        vi.mocked(fetchPersonDrawerViewModelClient).mockReset();
        vi.mocked(fetchChildDrawerViewModelClient).mockReset();
        vi.mocked(prefetchPersonDrawerSnapshot).mockReset();
        clearDrawerViewModelSessionCacheForTests();
        clearOpportunityDrawerVmLoadInFlightForTests();
        clearPersonDrawerVmLoadInFlightForTests();
        clearChildDrawerVmLoadInFlightForTests();
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        delete process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH;
        delete process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH;
    });

    afterEach(() => {
        clearDrawerViewModelSessionCacheForTests();
        clearOpportunityDrawerVmLoadInFlightForTests();
        clearPersonDrawerVmLoadInFlightForTests();
        clearChildDrawerVmLoadInFlightForTests();
    });

    it("person linked prefetch → click swap reads same VM cache", async () => {
        const vm = minimalSettledPersonDrawerViewModel({ entity: { type: "person", id: "person-1" } });
        vi.mocked(fetchPersonDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });

        await prepareDrawerViewModelDeduped({
            entityType: "persons",
            entityId: "person-1",
            context: cacheContext,
            openSource: "opportunity_primary_contact",
            opportunityWorkspaceContext: workspaceContext,
            linkedPerfPhase: "prefetch",
        });

        expect(fetchPersonDrawerViewModelClient).toHaveBeenCalledTimes(1);

        const swap = await loadPersonDrawerViaViewModel("person-1", {
            openSource: "opportunity_primary_contact",
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });

        expect(swap.ok).toBe(true);
        if (swap.ok) {
            expect(swap.open_path).toBe("cache_hit");
        }
        expect(fetchPersonDrawerViewModelClient).toHaveBeenCalledTimes(1);
    });

    it("child linked prefetch → click swap reads same VM cache", async () => {
        const vm = minimalSettledChildDrawerViewModel({ entity: { type: "person", id: "child-1" } });
        vi.mocked(fetchChildDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });

        await prepareDrawerViewModelDeduped({
            entityType: "persons",
            entityId: "child-1",
            context: cacheContext,
            openSource: "opportunity_inquiry_child",
            presentationEmphasis: "child_lifecycle",
            opportunityWorkspaceContext: workspaceContext,
            linkedPerfPhase: "prefetch",
        });

        expect(fetchChildDrawerViewModelClient).toHaveBeenCalledTimes(1);

        const swap = await loadChildDrawerViaViewModel("child-1", {
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });

        expect(swap.ok).toBe(true);
        if (swap.ok) {
            expect(swap.open_path).toBe("cache_hit");
        }
        expect(fetchChildDrawerViewModelClient).toHaveBeenCalledTimes(1);
    });

    it("opportunity back-to-lead restore uses prefetched VM cache", async () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            entity: { type: "opportunity", id: "opp-1" },
        });
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });

        await prepareDrawerViewModelDeduped({
            entityType: "opportunities",
            entityId: "opp-1",
            context: cacheContext,
            opportunityWorkspaceContext: workspaceContext,
            linkedPerfPhase: "prefetch",
        });

        expect(fetchOpportunityDrawerViewModelClient).toHaveBeenCalledTimes(1);

        const restore = await loadOpportunityDrawerViaViewModel("opp-1", workspaceContext, {
            cacheContext,
        });

        expect(restore.ok).toBe(true);
        if (restore.ok) {
            expect(restore.open_path).toBe("cache_hit");
        }
        expect(fetchOpportunityDrawerViewModelClient).toHaveBeenCalledTimes(1);
    });

    it("joins inflight linked prefetch when click arrives before prefetch completes", async () => {
        const vm = minimalSettledPersonDrawerViewModel({ entity: { type: "person", id: "person-1" } });
        let resolveFetch!: (value: { ok: true; viewModel: ReturnType<typeof minimalSettledPersonDrawerViewModel> }) => void;
        const fetchPromise = new Promise<{ ok: true; viewModel: ReturnType<typeof minimalSettledPersonDrawerViewModel> }>(
            (resolve) => {
                resolveFetch = resolve;
            }
        );
        vi.mocked(fetchPersonDrawerViewModelClient).mockReturnValue(fetchPromise as never);

        const prefetch = prepareDrawerViewModelDeduped({
            entityType: "persons",
            entityId: "person-1",
            context: cacheContext,
            openSource: "opportunity_primary_contact",
            opportunityWorkspaceContext: workspaceContext,
            linkedPerfPhase: "prefetch",
        });
        const swap = loadPersonDrawerViaViewModel("person-1", {
            openSource: "opportunity_primary_contact",
            cacheContext,
            workspaceContext,
            linkedPerfPhase: "swap",
        });

        resolveFetch({ ok: true, viewModel: vm });
        const [prefetchResult, swapResult] = await Promise.all([prefetch, swap]);

        expect(fetchPersonDrawerViewModelClient).toHaveBeenCalledTimes(1);
        expect(prefetchResult?.entityId).toBe("person-1");
        expect(swapResult.ok).toBe(true);
        if (swapResult.ok) {
            expect(swapResult.open_path).toBe("inflight_join");
        }
    });

    it("skips legacy snapshot hover warm when VM cutover is primary", () => {
        prefetchViewPersonOnPointerDown("person-1", {
            openSource: "opportunity_primary_contact",
            opportunityWorkspaceContext: workspaceContext,
        });

        expect(prefetchPersonDrawerSnapshot).not.toHaveBeenCalled();
    });
});
