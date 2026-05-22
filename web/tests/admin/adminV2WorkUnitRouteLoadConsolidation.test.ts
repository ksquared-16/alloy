import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildWorkUnitOperationalBootstrapClientUrl,
    clearWorkUnitBootstrapSessionForEntity,
    fetchWorkUnitOperationalBootstrapSession,
    resetWorkUnitBootstrapClientSession,
    workUnitBootstrapSessionKey,
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

    it("builds defer_bundle critical bootstrap URL", () => {
        const url = buildWorkUnitOperationalBootstrapClientUrl({
            departmentId: "dept-1",
            workUnitId: "wu-1",
            selectedSiteId: "site-9",
            focusQueue: "pipeline_total",
        });
        expect(url).toContain("defer_bundle=true");
        expect(url).toContain("department_id=dept-1");
        expect(url).toContain("workspace_site_id=site-9");
    });

    it("coalesces duplicate bootstrap session keys", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ work_unit: { id: "wu-1", department_id: "dept-1" } }), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        const params = {
            departmentId: "dept-1",
            workUnitId: "wu-1",
            selectedSiteId: null as string | null,
        };
        const key = workUnitBootstrapSessionKey(params);
        await fetchWorkUnitOperationalBootstrapSession(params);
        const second = await fetchWorkUnitOperationalBootstrapSession(params);
        expect(second.duplicateSuppressed).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(key).toContain("dept-1|wu-1");
    });

    it("clears session keys per work unit entity", () => {
        const params = {
            departmentId: "dept-1",
            workUnitId: "wu-1",
            selectedSiteId: null as string | null,
        };
        const key = workUnitBootstrapSessionKey(params);
        clearWorkUnitBootstrapSessionForEntity("dept-1", "wu-1");
        expect(key).toBeTruthy();
    });
});

describe("work-unit route load consolidation", () => {
    it("gates bootstrap on site selection ready", () => {
        expect(pageSource).toContain("siteSelectionReady");
        expect(pageSource).toContain("fetchWorkUnitOperationalBootstrapSession");
    });

    it("does not refetch bootstrap from queue pill handler", () => {
        const handler = pageSource.match(
            /const handleQueueTabChange = useCallback\([\s\S]*?\[fetchQueueItems, setSelectedQueueKeyTraced, workUnitId\]/
        )?.[0];
        expect(handler).toBeTruthy();
        expect(handler).not.toContain("operational-bootstrap");
        expect(handler).not.toContain("fetchWorkUnitOperationalBootstrapSession");
    });

    it("stabilizes bootstrap effect deps (no fetchQueueItems in bootstrap effect)", () => {
        expect(pageSource).toContain(
            "[departmentId, workUnitId, selectedSiteId, siteSelectionReady, orgId, principalUserId, accessScopeFingerprint, loadWuKpiPlacements]"
        );
        expect(pageSource).toContain("fetchQueueItemsRef");
        expect(pageSource).toContain("requestWorkUnitDeferredSupplementRef");
    });

    it("marks primary lane ready before deferred bundle", () => {
        expect(pageSource).toContain("work_unit_primary_lane_ready");
        expect(pageSource).toContain("deferBundle: true");
    });

    it("defers shell sidecars until primary paint", () => {
        expect(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../lib/workspace/adminV2DeferBackgroundWork.ts"), "utf8")).toContain(
            "scheduleAdminV2SidecarWork"
        );
        expect(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../lib/perf/alloyPerfGlobal.ts"), "utf8")).toContain(
            "isAdminV2WuPrimaryPaintPending"
        );
    });
});

describe("operational-bootstrap defer_bundle route", () => {
    it("skips KPI and right-rail when defer_bundle=true", () => {
        const routeSrc = readFileSync(
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../app/api/admin/work-units/[id]/operational-bootstrap/route.ts"
            ),
            "utf8"
        );
        expect(routeSrc).toContain('defer_bundle');
        expect(routeSrc).toContain("deferBundle");
    });
});
