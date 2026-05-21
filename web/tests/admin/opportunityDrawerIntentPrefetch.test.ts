import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dedupeAdminFetch = vi.fn(() => Promise.resolve(new Response("{}")));
const dedupeAdminFetchWithTtl = vi.fn(() => Promise.resolve(new Response("{}")));
const scheduleDeferredCommunicationsDrawerPrefetch = vi.fn();

vi.mock("@/lib/workspace/workspaceAdminFetchDedupe", () => ({
    dedupeAdminFetch,
    dedupeAdminFetchWithTtl,
}));

vi.mock("@/lib/admin/communications/communicationsDrawerPrefetch", () => ({
    scheduleDeferredCommunicationsDrawerPrefetch,
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
    });

    it("prefetches drawer-operational-bootstrap on intent without comms", async () => {
        const { prefetchOpportunityDrawerOnRowIntent } = await import(
            "@/lib/admin/opportunityDrawerIntentPrefetch"
        );
        prefetchOpportunityDrawerOnRowIntent("opp-abc");
        expect(scheduleDeferredCommunicationsDrawerPrefetch).not.toHaveBeenCalled();
        expect(dedupeAdminFetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/admin\/opportunities\/opp-abc\/drawer-operational-bootstrap$/),
            expect.anything()
        );
        expect(dedupeAdminFetchWithTtl).not.toHaveBeenCalled();
    });

    it("prefetches bootstrap with workspace scope query params", async () => {
        const { buildOpportunityDrawerBootstrapCanonicalUrl } = await import(
            "@/lib/admin/opportunityDrawerBootstrapClient"
        );
        const url = buildOpportunityDrawerBootstrapCanonicalUrl("opp-abc", {
            work_unit_id: "wu-1",
            department_id: "dept-1",
        });
        expect(url).toMatch(/drawer-operational-bootstrap\?.*work_unit_id=wu-1/);
        expect(url).toMatch(/department_id=dept-1/);
        expect(url).not.toMatch(/hint_oper_trust/);
    });
});
