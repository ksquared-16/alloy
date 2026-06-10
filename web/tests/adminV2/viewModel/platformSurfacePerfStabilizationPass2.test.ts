import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    clearWorkUnitSlugInflightForTests,
    humanizeWorkUnitRouteSlug,
    parseOperatorWorkUnitEntryHref,
    warmDefaultOperatorLifecycleEntries,
    warmOperatorWorkUnitEntryFromHref,
    warmWorkUnitSlugRoute,
} from "@/lib/admin/operatorWorkUnitEntryWarm";
import { clearWorkUnitSlugRouteCacheForTests, putWorkUnitSlugRouteCache } from "@/lib/admin/workUnitSlugRouteCache";

vi.mock("@/lib/adminV2/workUnitBootstrapClientSession", () => ({
    fetchWorkUnitOperationalBootstrapSession: vi.fn(() => Promise.resolve({ response: new Response(), ownershipKey: "k", bootstrapOwner: "prefetch" })),
}));

import { fetchWorkUnitOperationalBootstrapSession } from "@/lib/adminV2/workUnitBootstrapClientSession";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("platform surface perf stabilization pass 2", () => {
    beforeEach(() => {
        vi.stubGlobal("window", { location: { origin: "https://alloy.test" } });
        vi.stubGlobal("fetch", vi.fn());
        clearWorkUnitSlugRouteCacheForTests();
        clearWorkUnitSlugInflightForTests();
        vi.mocked(fetchWorkUnitOperationalBootstrapSession).mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        clearWorkUnitSlugRouteCacheForTests();
        clearWorkUnitSlugInflightForTests();
    });

    it("parses operator work-unit href slug from /workspace/work-unit/new-leads", () => {
        expect(parseOperatorWorkUnitEntryHref("/workspace/work-unit/new-leads").workUnitSlug).toBe("new-leads");
    });

    it("humanizes route slug for cold-shell title", () => {
        expect(humanizeWorkUnitRouteSlug("new-leads")).toBe("New Leads");
    });

    it("warmWorkUnitSlugRoute dedupes inflight slug fetches", async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                route_slug: "new-leads",
                work_unit_id: "wu-1",
                department_id: "dept-1",
                work_unit_key: "new_leads",
                work_unit_name: "New Leads",
                initial_queue_key: "inbox",
            }),
        } as Response);

        const [a, b] = await Promise.all([
            warmWorkUnitSlugRoute("new-leads", "test"),
            warmWorkUnitSlugRoute("new-leads", "test"),
        ]);

        expect(a.entry?.workUnitId).toBe("wu-1");
        expect(b.entry?.workUnitId).toBe("wu-1");
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("warmOperatorWorkUnitEntryFromHref prewarms bootstrap after slug resolve", async () => {
        putWorkUnitSlugRouteCache("new-leads", {
            routeSlug: "new-leads",
            departmentId: "dept-1",
            workUnitId: "wu-1",
            workUnitKey: "new_leads",
            workUnitName: "New Leads",
            initialQueueKey: "inbox",
        });

        warmOperatorWorkUnitEntryFromHref("/workspace/work-unit/new-leads", null, "test");

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fetchWorkUnitOperationalBootstrapSession).toHaveBeenCalledWith(
            expect.objectContaining({
                departmentId: "dept-1",
                workUnitId: "wu-1",
            }),
            "prefetch",
        );
    });

    it("warmDefaultOperatorLifecycleEntries caps idle prewarm to one href", async () => {
        putWorkUnitSlugRouteCache("new-leads", {
            routeSlug: "new-leads",
            departmentId: "dept-1",
            workUnitId: "wu-1",
            workUnitKey: "new_leads",
            workUnitName: "New Leads",
            initialQueueKey: "inbox",
        });

        warmDefaultOperatorLifecycleEntries(
            [
                { entryHref: "/workspace/work-unit/new-leads" },
                { entryHref: "/workspace/work-unit/tours" },
            ],
            null,
            1,
        );

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(fetchWorkUnitOperationalBootstrapSession).toHaveBeenCalledTimes(1);
    });

    it("WorkUnitSlugRouteHost uses cold shell during slug resolve", () => {
        const host = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        expect(host).toContain("WorkUnitWorkspaceColdShell");
        expect(host).toContain("warmWorkUnitSlugRoute");
        expect(host).not.toContain("Loading work unit…");
    });

    it("work-unit page uses cold shell instead of route loading gate while content pending", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("WorkUnitWorkspaceColdShell");
        expect(page).toMatch(/!workUnitPageContentReady[\s\S]*WorkUnitWorkspaceColdShell/);
        expect(page).not.toContain("WorkUnitPageLoadingGate");
    });

    it("lifecycle grid prewarms work-unit entry on hover", () => {
        const grid = read("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(grid).toContain("warmOperatorWorkUnitEntryFromHref");
        expect(grid).toContain("lifecycle_tile_hover");
    });

    it("workspace landing idle-prewarms default lifecycle entry", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("warmDefaultOperatorLifecycleEntries");
    });

    it("drawer operating shell applies swap-hold transition class", () => {
        const shell = read("components/admin/drawer/EntityDrawerOperatingShell.tsx");
        expect(shell).toContain("adminv2-drawer-panel--swap-hold");
        expect(shell).toContain("holdPriorPayload");
    });
});
