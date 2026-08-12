import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    ADMIN_V2_SIDECAR_TTL_MS,
    fetchAdminV2Sidecar,
    resetAdminV2SidecarSessionForTests,
} from "@/lib/adminV2/adminV2SidecarSession";
import {
    isAdminV2SidecarNetworkBlocked,
    setAdminV2DrawerOpenPending,
    setAdminV2PrimarySurfacePending,
} from "@/lib/perf/adminV2PrimarySurfaceGate";
import { resetAdminV2JankBudgetForTests } from "@/lib/perf/adminV2JankBudget";

const root = dirname(fileURLToPath(import.meta.url));

describe("adminV2SidecarSession", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        resetAdminV2SidecarSessionForTests();
        resetAdminV2JankBudgetForTests();
        setAdminV2PrimarySurfacePending(false, "test_reset");
        setAdminV2DrawerOpenPending(false, "test_reset");
    });

    it("dedupes sidecar fetches within TTL", async () => {
        const fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ ok: true, counts: { open: 1 } }), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        await fetchAdminV2Sidecar("operational_tasks_summary");
        await fetchAdminV2Sidecar("operational_tasks_summary");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(ADMIN_V2_SIDECAR_TTL_MS).toBeGreaterThanOrEqual(60_000);
    });

    it("blocks network while primary surface pending", async () => {
        setAdminV2PrimarySurfacePending(true, "test");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const res = await fetchAdminV2Sidecar("agent_activity");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(res.status).toBe(200);
        expect(isAdminV2SidecarNetworkBlocked()).toBe(true);
    });
});

describe("production jank lock wiring", () => {
    it("sidecar defer runs once without perf-tick refire", () => {
        const defer = readFileSync(join(root, "../../lib/workspace/adminV2DeferBackgroundWork.ts"), "utf8");
        expect(defer).not.toContain("ALLOY_PERF_TICK_EVENT");
        expect(defer).toContain("let ran = false");
    });

    it("drawer open sets pending gate", () => {
        const coord = readFileSync(join(root, "../../lib/admin/opportunityDrawerOpenCoordinator.ts"), "utf8");
        expect(coord).toContain("setAdminV2DrawerOpenPending(true");
    });
});
