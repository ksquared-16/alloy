import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildCanonicalWorkUnitOperationalBootstrapUrl,
    fetchWorkUnitOperationalBootstrapSession,
    resetWorkUnitBootstrapClientSession,
    workUnitBootstrapOwnershipKey,
} from "@/lib/adminV2/workUnitBootstrapClientSession";

const pagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
);
const pageSource = readFileSync(pagePath, "utf8");

describe("workUnitBootstrapClientSession", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        resetWorkUnitBootstrapClientSession();
    });

    it("builds canonical bootstrap URL with focus_queue when route queue set", () => {
        const url = buildCanonicalWorkUnitOperationalBootstrapUrl({
            departmentId: "dept-1",
            workUnitId: "wu-1",
            selectedSiteId: "site-9",
            focusQueue: "tour_scheduled",
        });
        expect(url).toContain("defer_bundle=true"); // bootstrap defers primary lane; runtime owns the fetch
        expect(url).toContain("focus_queue=tour_scheduled");
        expect(url).toContain("workspace_site_id=site-9");
    });

    it("coalesces duplicate page loads to one network call", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ work_unit: { id: "wu-1", department_id: "dept-1" } }), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        const params = { departmentId: "dept-1", workUnitId: "wu-1", selectedSiteId: null as string | null };
        await fetchWorkUnitOperationalBootstrapSession(params, "page");
        const second = await fetchWorkUnitOperationalBootstrapSession(params, "page");
        expect(second.bootstrapOwner).toBe("reuse");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(workUnitBootstrapOwnershipKey(params)).toBe("dept-1|wu-1|||");
    });
});

describe("work-unit route load consolidation", () => {
    it("gates bootstrap on site selection ready and page owner", () => {
        expect(pageSource).toContain("siteSelectionReady");
        expect(pageSource).toContain('fetchWorkUnitOperationalBootstrapSession');
        expect(pageSource).toContain('"page"');
        expect(pageSource).toContain("bootstrap_owner");
    });

    it("does not refetch bootstrap from queue pill handler", () => {
        const handler = pageSource.match(
            /const handleQueueTabChange = useCallback\([\s\S]*?\[fetchQueueItems, setSelectedQueueKeyTraced, workUnitId\]/
        )?.[0];
        expect(handler).toBeTruthy();
        expect(handler).not.toContain("operational-bootstrap");
    });

    it("clears primary surface gate on primary lane or shell ready", () => {
        expect(pageSource).toContain("work_unit_primary_lane_ready");
        expect(pageSource).toContain("setAdminV2PrimarySurfacePending");
    });
});
