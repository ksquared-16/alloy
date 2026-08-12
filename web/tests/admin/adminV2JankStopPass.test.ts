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
import { isAdminV2PrimarySurfacePending, setAdminV2PrimarySurfacePending } from "@/lib/perf/adminV2PrimarySurfaceGate";

const root = dirname(fileURLToPath(import.meta.url));

describe("adminV2PrimarySurfaceGate", () => {
    afterEach(() => {
        setAdminV2PrimarySurfacePending(false, "test_reset");
    });

    it("blocks sidecars while pending", () => {
        setAdminV2PrimarySurfacePending(true, "test");
        expect(isAdminV2PrimarySurfacePending()).toBe(true);
    });
});

describe("workUnitBootstrap ownership", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        resetWorkUnitBootstrapClientSession();
    });

    it("uses stable ownership key for same dept/wu/site/lane", () => {
        const a = workUnitBootstrapOwnershipKey({
            departmentId: "d1",
            workUnitId: "w1",
            selectedSiteId: "s1",
        });
        const b = workUnitBootstrapOwnershipKey({
            departmentId: "d1",
            workUnitId: "w1",
            selectedSiteId: "s1",
        });
        expect(a).toBe("d1|w1|s1||");
        expect(a).toBe(b);
    });

    it("canonical URL includes focus_queue when dept selection is explicit", () => {
        const url = buildCanonicalWorkUnitOperationalBootstrapUrl({
            departmentId: "d1",
            workUnitId: "w1",
            selectedSiteId: null,
            focusQueue: "enrolled",
        });
        expect(url).toContain("defer_bundle=true"); // bootstrap defers primary lane; runtime owns the fetch
        expect(url).toContain("focus_queue=enrolled");
    });

    it("ownership key separates default lane from explicit queue prefetch", () => {
        const base = { departmentId: "d1", workUnitId: "w1", selectedSiteId: "s1" as string | null };
        expect(workUnitBootstrapOwnershipKey(base)).not.toBe(
            workUnitBootstrapOwnershipKey({ ...base, focusQueue: "enrolled" })
        );
    });

    it("page owner fetches once; second page call is reuse", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ work_unit: { id: "w1", department_id: "d1" } }), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        const params = { departmentId: "d1", workUnitId: "w1", selectedSiteId: null as string | null };
        const first = await fetchWorkUnitOperationalBootstrapSession(params, "page");
        const second = await fetchWorkUnitOperationalBootstrapSession(params, "page");
        expect(first.bootstrapOwner).toBe("page");
        expect(second.bootstrapOwner).toBe("reuse");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("prefetch does not start a second network call when page completed", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ work_unit: { id: "w1", department_id: "d1" } }), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        const params = { departmentId: "d1", workUnitId: "w1", selectedSiteId: null as string | null };
        await fetchWorkUnitOperationalBootstrapSession(params, "page");
        const prefetch = await fetchWorkUnitOperationalBootstrapSession(params, "prefetch");
        expect(prefetch.bootstrapOwner).toBe("prefetch");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("jank-stop wiring", () => {

    it("sidecars use hard primary gate without idle fallback", () => {
        const defer = readFileSync(join(root, "../../lib/workspace/adminV2DeferBackgroundWork.ts"), "utf8");
        expect(defer).toContain("runWhenAdminV2PrimarySurfaceReady");
        expect(defer).toContain("isAdminV2SidecarNetworkBlocked");
        const tasks = readFileSync(join(root, "../../app/adminV2/components/OperationalTasksNavBadge.tsx"), "utf8");
        expect(tasks).toContain("runWhenAdminV2PrimarySurfaceReady");
        expect(tasks).not.toContain("fallbackMs: 1200");
    });

});
