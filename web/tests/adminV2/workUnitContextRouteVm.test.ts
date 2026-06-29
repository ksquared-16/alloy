import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Work-Unit context/banner ownership → Route VM", () => {
    it("the Work Unit Route VM owns departmentName + workUnitName", () => {
        const ctx = read("contexts/WorkUnitSlugRouteContext.tsx");
        expect(ctx).toMatch(/departmentName:\s*string\s*\|\s*null/);
        expect(ctx).toContain("workUnitName: string");
    });

    it("both resolution paths populate departmentName (server seed + client fallback)", () => {
        // Server seed: resolved from the loader's department query.
        const server = read("lib/admin/loadWorkUnitSlugRouteServer.ts");
        expect(server).toMatch(/departmentName:\s*\n?\s*departments\.find/);
        // Client fallback payload → cache entry.
        const warm = read("lib/admin/operatorWorkUnitEntryWarm.ts");
        expect(warm).toContain("department_name");
        expect(warm).toContain("departmentName: json.department_name ?? null");
        // by-slug API exposes department_name for the client fallback.
        const api = read("app/api/admin/work-units/by-slug/[workUnitSlug]/route.ts");
        expect(api).toContain("department_name:");
    });

    it("compat page derives context from the Route VM (workUnit/dept are only the dept-nested fallback)", () => {
        const page = read(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        );
        expect(page).toContain('slugRoute?.departmentName?.trim() || dept?.name?.trim() || "Department"');
        expect(page).toContain("slugRoute?.workUnitName?.trim() || workUnit?.name?.trim()");
    });

    it("the switching-artifact local title derivation is deleted", () => {
        const page = read(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        );
        // routeWorkUnitDisplayName state + its session-cache warm-start effect existed only to show a
        // switched-to title before its work unit fetched (in-page switching). With navigation it is gone.
        expect(page).not.toContain("routeWorkUnitDisplayName");
        expect(page).not.toContain("setRouteWorkUnitDisplayName");
        expect(page).not.toContain("readWorkUnitShellDisplayTitleFromSessionCache");
        expect(page).not.toContain("resolveWorkUnitShellDisplayTitle");
    });
});
