import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildWorkUnitOperationalBootstrapUrl,
    parseWorkUnitNavFromDeptOperHref,
    prefetchWorkUnitOperationalBootstrap,
} from "@/lib/adminV2/navigation/prefetchWorkUnitOperationalBootstrap";
import { resetWorkUnitBootstrapClientSession } from "@/lib/adminV2/workUnitBootstrapClientSession";

describe("prefetchWorkUnitOperationalBootstrap", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        resetWorkUnitBootstrapClientSession();
    });

    it("builds operational-bootstrap URL with route focus queue when set", () => {
        const url = buildWorkUnitOperationalBootstrapUrl("wu-1", {
            departmentId: "dept-1",
            selectedSiteId: "site-9",
            focusQueue: "enrolled",
            attentionBucket: "stale_quote",
        });
        expect(url).toContain("/api/admin/work-units/wu-1/operational-bootstrap");
        expect(url).toContain("department_id=dept-1");
        expect(url).toContain("focus_queue=enrolled");
        expect(url).toContain("attention_bucket=stale_quote");
        expect(url).toContain("workspace_site_id=site-9");
        expect(url).toContain("defer_bundle=false");
    });

    it("parses dept oper href for prefetch opts", () => {
        const parsed = parseWorkUnitNavFromDeptOperHref(
            "/adminV2/workspace/dept/dept-1/work-unit/wu-2?queue=needs_attention&attention_bucket=foo"
        );
        expect(parsed).toEqual({
            departmentId: "dept-1",
            workUnitId: "wu-2",
            focusQueue: "needs_attention",
            attentionBucket: "foo",
        });
    });

    it("prefetch uses deduped fetch and throws on non-ok", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ work_unit: { id: "wu-1" } }), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        await prefetchWorkUnitOperationalBootstrap({
            departmentId: "dept-1",
            workUnitId: "wu-1",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [calledUrl] = fetchMock.mock.calls[0] as [string];
        expect(calledUrl).toContain("/api/admin/work-units/wu-1/operational-bootstrap");
    });

    it("prefetch rejects when response is not ok", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ error: "fail" }), { status: 500 }))
        );

        await expect(
            prefetchWorkUnitOperationalBootstrap({ departmentId: "dept-1", workUnitId: "wu-1" })
        ).rejects.toThrow(/prefetch failed|failed \(500\)/i);
    });
});
