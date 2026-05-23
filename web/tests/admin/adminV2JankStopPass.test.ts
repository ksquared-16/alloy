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

    it("uses ownership key without focus or defer variance", () => {
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
        expect(a).toBe("d1|w1|s1");
        expect(a).toBe(b);
    });

    it("canonical URL omits focus_queue and includes primary rows for reveal", () => {
        const url = buildCanonicalWorkUnitOperationalBootstrapUrl({
            departmentId: "d1",
            workUnitId: "w1",
            selectedSiteId: null,
        });
        expect(url).toContain("defer_bundle=false");
        expect(url).not.toContain("focus_queue");
        expect(url).not.toContain("attention_bucket");
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
        expect(prefetch.bootstrapOwner).toBe("suppressed");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("jank-stop wiring", () => {
    it("dept page disables WU bootstrap prefetch", () => {
        const dept = readFileSync(join(root, "../../app/adminV2/workspace/dept/[departmentId]/page.tsx"), "utf8");
        expect(dept).toContain("WU bootstrap prefetch disabled");
        expect(dept).not.toContain("void prefetchWorkUnitOperationalBootstrap");
    });

    it("sidecars use hard primary gate without idle fallback", () => {
        const defer = readFileSync(join(root, "../../lib/workspace/adminV2DeferBackgroundWork.ts"), "utf8");
        expect(defer).toContain("runWhenAdminV2PrimarySurfaceReady");
        expect(defer).toContain("isAdminV2SidecarNetworkBlocked");
        const tasks = readFileSync(join(root, "../../app/adminV2/components/OperationalTasksNavBadge.tsx"), "utf8");
        expect(tasks).toContain("runWhenAdminV2PrimarySurfaceReady");
        expect(tasks).not.toContain("fallbackMs: 1200");
    });

    it("drawer shares tour bookings with inquiry block", () => {
        const drawer = readFileSync(join(root, "../../components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("sharedActiveBookings");
        expect(drawer).toContain("sharedActiveBookings");
    });
});
