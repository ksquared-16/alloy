import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dedupeAdminFetch = vi.fn(() => Promise.resolve(new Response("{}")));
const dedupeAdminFetchWithTtl = vi.fn(() => Promise.resolve(new Response("{}")));
const scheduleDeferredCommunicationsDrawerPrefetch = vi.fn();
const fetchOpportunityDrawerOperationalBootstrap = vi.fn(() => Promise.resolve({ entity: { id: "opp-abc" } }));
const prefetchOpportunityDrawerPrimary = vi.fn();
const prefetchOpportunityDrawerFull = vi.fn();
const warmQueueRowOpportunityVm = vi.fn();

vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate", () => ({
    opportunityDrawerHardCutoverEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm", () => ({
    warmQueueRowOpportunityVm,
    warmVisibleQueueRowOpportunityVms: vi.fn(),
}));

vi.mock("@/lib/workspace/workspaceAdminFetchDedupe", () => ({
    dedupeAdminFetch,
    dedupeAdminFetchWithTtl,
}));

vi.mock("@/lib/admin/communications/communicationsDrawerPrefetch", () => ({
    scheduleDeferredCommunicationsDrawerPrefetch,
}));

vi.mock("@/lib/admin/opportunityDrawerBootstrapClient", () => ({
    adminV2DrawerBootstrapEnabled: () => true,
    fetchOpportunityDrawerOperationalBootstrap,
}));

vi.mock("@/lib/admin/opportunityDrawerPrimaryPrefetch", () => ({
    prefetchOpportunityDrawerPrimary,
}));

vi.mock("@/lib/admin/opportunityDrawerFullPrefetch", () => ({
    prefetchOpportunityDrawerFull,
}));

describe("prefetchOpportunityDrawerOnRowIntent", () => {
    beforeEach(async () => {
        vi.stubGlobal("window", {} as Window & typeof globalThis);
        const { opportunityDrawerHardCutoverEnabled } = await import(
            "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate"
        );
        vi.mocked(opportunityDrawerHardCutoverEnabled).mockReturnValue(false);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        dedupeAdminFetch.mockClear();
        dedupeAdminFetchWithTtl.mockClear();
        scheduleDeferredCommunicationsDrawerPrefetch.mockClear();
        fetchOpportunityDrawerOperationalBootstrap.mockClear();
        prefetchOpportunityDrawerPrimary.mockClear();
        prefetchOpportunityDrawerFull.mockClear();
        warmQueueRowOpportunityVm.mockClear();
    });

    it("prefetches bootstrap + drawer_primary on hover without full hydrate", async () => {
        const { prefetchOpportunityDrawerOnRowIntent } = await import(
            "@/lib/admin/opportunityDrawerIntentPrefetch"
        );
        prefetchOpportunityDrawerOnRowIntent("opp-abc");
        expect(scheduleDeferredCommunicationsDrawerPrefetch).not.toHaveBeenCalled();
        expect(fetchOpportunityDrawerOperationalBootstrap).toHaveBeenCalledWith(
            "opp-abc",
            null,
            expect.anything()
        );
        expect(prefetchOpportunityDrawerPrimary).toHaveBeenCalledWith(
            "opp-abc",
            expect.anything(),
            null,
            null
        );
        expect(prefetchOpportunityDrawerFull).not.toHaveBeenCalled();
    });

    it("prefetchOpportunityDrawerFullOnRowIntent warms surface=full on pointer-down", async () => {
        const { prefetchOpportunityDrawerFullOnRowIntent } = await import(
            "@/lib/admin/opportunityDrawerIntentPrefetch"
        );
        prefetchOpportunityDrawerFullOnRowIntent("opp-abc");
        expect(prefetchOpportunityDrawerFull).toHaveBeenCalledWith("opp-abc", expect.anything());
    });

    it("uses VM warm path when opportunity drawer hard cutover is enabled", async () => {
        const { opportunityDrawerHardCutoverEnabled } = await import(
            "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate"
        );
        vi.mocked(opportunityDrawerHardCutoverEnabled).mockReturnValue(true);
        const { prefetchOpportunityDrawerOnRowIntent } = await import(
            "@/lib/admin/opportunityDrawerIntentPrefetch"
        );
        prefetchOpportunityDrawerOnRowIntent("opp-abc", {
            work_unit_id: "wu-1",
            department_id: "dept-1",
        });
        expect(warmQueueRowOpportunityVm).toHaveBeenCalledWith(
            "opp-abc",
            { work_unit_id: "wu-1", department_id: "dept-1" },
            "queue_row_intent"
        );
        expect(fetchOpportunityDrawerOperationalBootstrap).not.toHaveBeenCalled();
        expect(prefetchOpportunityDrawerPrimary).not.toHaveBeenCalled();
    });

    it("passes workspace context through to bootstrap prefetch", async () => {
        const { prefetchOpportunityDrawerOnRowIntent } = await import(
            "@/lib/admin/opportunityDrawerIntentPrefetch"
        );
        prefetchOpportunityDrawerOnRowIntent("opp-abc", {
            work_unit_id: "wu-1",
            department_id: "dept-1",
        });
        expect(fetchOpportunityDrawerOperationalBootstrap).toHaveBeenCalledWith(
            "opp-abc",
            { work_unit_id: "wu-1", department_id: "dept-1" },
            expect.anything()
        );
    });
});
