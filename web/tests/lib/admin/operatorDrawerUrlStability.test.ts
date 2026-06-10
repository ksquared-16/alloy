import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isOperatorWorkUnitRecordIdOnlyPathChange } from "@/lib/admin/operatorWorkUnitDrawerUrlSync";
import {
    coerceAdminV2VmDrawerRoute,
    resolveVmDrawerRuntimeRoute,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute";
import { launchGlobalRecordSearchOpen } from "@/lib/adminV2/globalRecordSearchOpen";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("operator drawer URL stability", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("AdminDrawerContext skips auto-close on recordId-only slug route changes", () => {
        const src = read("contexts/AdminDrawerContext.tsx");
        expect(src).toContain("isOperatorWorkUnitRecordIdOnlyPathChange");
        expect(src).toMatch(/if \(isOperatorWorkUnitRecordIdOnlyPathChange\(/);
    });

    it("WorkUnitSlugRouteHost syncs drawer URLs without remounting on recordId changes", () => {
        const host = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        expect(host).toContain("syncOperatorWorkUnitUrlInBrowser");
        expect(host).toMatch(/\}, \[workUnitSlug\]\);/);
        expect(host).toContain("routeRecordIdFromPath");
    });

    it("recordId-only path changes are detected for canonical and rewrite aliases", () => {
        expect(
            isOperatorWorkUnitRecordIdOnlyPathChange(
                "/workspace/work-unit/new-leads",
                "/workspace/work-unit/new-leads/opp-1",
            ),
        ).toBe(true);
        expect(
            isOperatorWorkUnitRecordIdOnlyPathChange(
                "/adminV2/workspace/work-unit/new-leads/rec-1",
                "/adminV2/workspace/work-unit/new-leads",
            ),
        ).toBe(true);
        expect(
            isOperatorWorkUnitRecordIdOnlyPathChange(
                "/workspace/work-unit/new-leads",
                "/workspace/work-unit/tours",
            ),
        ).toBe(false);
    });

    it("/workspace work-unit paths route Opportunity to VM when cutover is on", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        const drawer = {
            type: "opportunities" as const,
            id: "opp-1",
        };
        const path = "/workspace/work-unit/new-leads/opp-1";
        const route = coerceAdminV2VmDrawerRoute(
            resolveVmDrawerRuntimeRoute(drawer, path),
            drawer,
            path,
        );
        expect(route).toBe("opportunity");
    });

    it("global search fallback navigates to /workspace when drawer host is absent", () => {
        vi.stubGlobal("window", {
            location: { pathname: "/login" },
            sessionStorage: { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() },
            dispatchEvent: vi.fn(),
        });
        const nav = launchGlobalRecordSearchOpen({
            open_entity_type: "opportunities",
            open_entity_id: "opp-1",
        });
        expect(nav).toBe("/workspace");
    });
});
