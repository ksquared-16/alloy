import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dedupeAdminFetch = vi.fn(() => Promise.resolve(new Response("{}")));
const dedupeAdminFetchWithTtl = vi.fn(() => Promise.resolve(new Response("{}")));
const scheduleDeferredCommunicationsDrawerPrefetch = vi.fn();
const fetchOpportunityDrawerOperationalBootstrap = vi.fn(() => Promise.resolve({ entity: { id: "opp-abc" } }));
const prefetchOpportunityDrawerPrimary = vi.fn();
const prefetchOpportunityDrawerFull = vi.fn();

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
    beforeEach(() => {
        vi.stubGlobal("window", {} as Window & typeof globalThis);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        dedupeAdminFetch.mockClear();
        dedupeAdminFetchWithTtl.mockClear();
        scheduleDeferredCommunicationsDrawerPrefetch.mockClear();
        fetchOpportunityDrawerOperationalBootstrap.mockClear();
        prefetchOpportunityDrawerPrimary.mockClear();
        prefetchOpportunityDrawerFull.mockClear();
    });

    it("prefetches bootstrap + drawer_primary + full in parallel without comms", async () => {
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
        expect(prefetchOpportunityDrawerPrimary).toHaveBeenCalledWith("opp-abc", expect.anything(), null);
        expect(prefetchOpportunityDrawerFull).toHaveBeenCalledWith("opp-abc", expect.anything());
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
