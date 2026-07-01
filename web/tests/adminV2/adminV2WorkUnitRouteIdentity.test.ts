import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("AdminV2 work-unit route identity", () => {
    it("route shell title uses route-owned work unit id, not stale state", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("routeWorkUnitDisplayName");
        expect(page).toMatch(/workUnit\?\.id === workUnitId/);
        expect(page).toMatch(/setWorkUnit\(\(prev\) => \(prev\?\.id === workUnitId \? prev : null\)\)/);
        expect(page).toMatch(/wu\.id !== workUnitId/);
    });

    it("WU layout cache seed does not depend on selectedSiteId", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        const layoutEffect = page.match(
            /setWorkUnit\(\(prev\) => \(prev\?\.id === workUnitId[\s\S]*?\], \[[\s\S]*?\]\);/
        );
        expect(layoutEffect?.[0] ?? "").not.toContain("selectedSiteId");
    });
});
