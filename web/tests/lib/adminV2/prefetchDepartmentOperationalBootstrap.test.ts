import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildDepartmentOperationalBootstrapUrl,
    prefetchDepartmentOperationalBootstrap,
} from "@/lib/adminV2/navigation/prefetchDepartmentOperationalBootstrap";

describe("prefetchDepartmentOperationalBootstrap", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("builds operational-bootstrap URL aligned with dept page", () => {
        const url = buildDepartmentOperationalBootstrapUrl("dept-abc", {
            selectedSiteId: "site-1",
            rightRailWorkUnitId: "wu-pipeline",
        });
        expect(url).toContain("/api/admin/departments/dept-abc/operational-bootstrap");
        expect(url).toContain("include_previews=false");
        expect(url).toContain("count_mode=exact");
        expect(url).toContain("summary_mode=priority");
        expect(url).toContain("priority_budget=5");
        expect(url).toContain("right_rail_work_unit_id=wu-pipeline");
        expect(url).toContain("workspace_site_id=site-1");
    });

    it("prefetch uses deduped fetch and throws on non-ok response", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ department: { id: "dept-abc" } }), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        await prefetchDepartmentOperationalBootstrap("dept-abc");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [calledUrl] = fetchMock.mock.calls[0] as [string];
        expect(calledUrl).toContain("/api/admin/departments/dept-abc/operational-bootstrap");
    });

    it("prefetch rejects when response is not ok", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ error: "fail" }), { status: 500 }))
        );

        await expect(prefetchDepartmentOperationalBootstrap("dept-abc")).rejects.toThrow(/prefetch failed/i);
    });
});
