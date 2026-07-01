import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

describe("AdminV2 shell routes use route gate + caches", () => {
    it("global list routes use loadAdminRouteGate (not double getAdminContext)", () => {
        for (const path of [
            "app/api/admin/departments/route.ts",
            "app/api/admin/work-units/route.ts",
            "app/api/admin/entity-labels/route.ts",
            "app/api/admin/workspace/site-filter/route.ts",
        ]) {
            const src = read(path);
            expect(src, path).toContain("loadAdminRouteGate");
            const getBlock = src.split(/\nexport async function (POST|PUT|DELETE)/)[0] ?? src;
            expect(getBlock, path).toContain("loadAdminRouteGate");
            expect(getBlock, path).not.toMatch(/getAdminContextCached\s*\(/);
            expect(getBlock, path).not.toMatch(/getAdminAccessContextCached\s*\(/);
        }
    });

    it("entity-labels GET uses org cache; mutations invalidate", () => {
        const src = read("app/api/admin/entity-labels/route.ts");
        expect(src).toContain("resolveEntityLabelsForOrgCached");
        expect(src).toContain("invalidateEntityLabelsOrgCache");
        expect(src).toMatch(/PUT[\s\S]*getAdminContextCached/);
        expect(src).toMatch(/DELETE[\s\S]*getAdminContextCached/);
    });

    it("queue rows still use loadAdminRouteGate", () => {
        expect(read("app/api/admin/queues/[workUnitId]/[queueKey]/route.ts")).toContain("loadAdminRouteGate");
    });

    it("shell context cache is wired in access bundle loader", () => {
        expect(read("lib/admin/getAdminAccessContext.ts")).toContain("readAdminShellContextCache");
        expect(read("lib/admin/getAdminAccessContext.ts")).toContain("writeAdminShellContextCache");
    });
});
