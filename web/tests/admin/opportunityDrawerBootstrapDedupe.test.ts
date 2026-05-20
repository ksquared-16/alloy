import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dedupeAdminFetch = vi.fn();

vi.mock("@/lib/workspace/workspaceAdminFetchDedupe", () => ({
    dedupeAdminFetch,
}));

vi.mock("@/lib/workspace/workspaceDataFetch", () => ({
    workspaceDataFetchInit: () => ({}),
}));

describe("fetchOpportunityDrawerOperationalBootstrap dedupe", () => {
    beforeEach(() => {
        dedupeAdminFetch.mockReset();
        dedupeAdminFetch.mockImplementation(() =>
            Promise.resolve(
                new Response(JSON.stringify({ entity: { id: "opp-1" } }), { status: 200 })
            )
        );
    });

    afterEach(() => {
        vi.resetModules();
    });

    it("coalesces prefetch and open to one dedupeAdminFetch for the same opportunity id", async () => {
        const { fetchOpportunityDrawerOperationalBootstrap } = await import(
            "@/lib/admin/opportunityDrawerBootstrapClient"
        );

        const scoped = { department_id: "dept-1", work_unit_id: "wu-1" };
        await Promise.all([
            fetchOpportunityDrawerOperationalBootstrap("opp-1", null),
            fetchOpportunityDrawerOperationalBootstrap("opp-1", scoped),
        ]);

        expect(dedupeAdminFetch).toHaveBeenCalledTimes(1);
    });
});
