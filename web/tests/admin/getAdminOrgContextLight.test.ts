import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("getAdminOrgContextLight", () => {
    it("resolves portal org without permission or scope tables", () => {
        const src = read("lib/admin/getAdminOrgContextLight.ts");
        expect(src).toContain("resolveAdminPortalOrgCore");
        expect(src).toContain("getCachedAuthUserId");
        expect(src).not.toContain("loadAdminAccessBundleCached");
        expect(src).not.toContain("permissionKeys");
        expect(src).toContain("full_context_avoided: true");
    });

    it("requireAdminOrgContextLight is single gate", () => {
        const src = read("lib/admin/getAdminOrgContextLight.ts");
        expect(src).toContain("export async function requireAdminOrgContextLight");
    });
});

describe("Card 1 — converted lightweight routes", () => {
    const lightRoutes = [
        "app/api/admin/communications/unread-count/route.ts",
        "app/api/admin/operational-tasks/route.ts",
        "app/api/admin/workflows/summary/route.ts",
        "app/api/admin/workflow-runs/route.ts",
        "app/api/admin/ai/workflow-assist/capabilities/route.ts",
        "app/api/admin/agent/v1/activity/route.ts",
    ];

    it.each(lightRoutes)("%s uses requireAdminOrgContextLight only", (rel) => {
        const src = read(rel);
        expect(src).toContain("requireAdminOrgContextLight");
        expect(src).not.toMatch(/\brequireAdminOrOps\s*\(/);
        expect(src).not.toContain("getAdminContextCached");
    });

    it("config-layout-assist capabilities keeps full permission context", () => {
        const src = read("app/api/admin/ai/config-layout-assist/capabilities/route.ts");
        expect(src).toContain("loadConfigLayoutAssistAdminContext");
        expect(src).not.toContain("requireAdminOrgContextLight");
    });

    it("requireAdminOrOps delegates to light portal context", () => {
        const src = read("lib/adminAuth.ts");
        expect(src).toContain("getAdminOrgContextLightCached");
        expect(src).not.toMatch(/requireAdminOrOps[\s\S]*?getAdminAuth/);
    });

    it("cached auth session shares one resolveAuthSessionOnce", () => {
        const src = read("lib/admin/cachedAuthSession.ts");
        expect(src).toContain("resolveAuthSessionOnce");
        expect(src).toContain("getCachedAuthUserId");
        expect(src).toContain("getCachedAuthUser");
    });
});
