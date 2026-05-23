import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    readLastKnownWorkspaceSiteFilterBootstrap,
    readWorkspaceSiteFilterBootstrapCache,
    readWorkspaceSiteFilterBootstrapForShell,
    resetWorkspaceSiteFilterBootstrapCacheForTests,
    writeWorkspaceSiteFilterBootstrapCache,
    workspaceSiteFilterBootstrapScopeKey,
} from "@/lib/adminV2/workspaceSiteFilterBootstrapCache";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("AdminV2 app shell header persistence", () => {
    it("AdminV2Shell mounts WorkspaceSiteFilterProvider at workspace-v2 root (not route gate)", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("WorkspaceSiteFilterProvider");
        expect(shell).toContain('data-adminv2-app-shell="workspace-v2"');
        expect(shell).toContain('data-adminv2-shell-header-mount="persistent"');
        expect(shell).not.toMatch(/workspaceSiteFilterSubtree[\s\S]*WorkspaceSiteFilterGate/);
    });

    it("TopNavBar keeps location reserve when bootstrap is loading", () => {
        const nav = read("app/adminV2/components/TopNavBar.tsx");
        expect(nav).toContain("WorkspaceSiteFilterLocationReserve");
        expect(nav).not.toMatch(/if \(!wf\?\.bootstrap\) return null;/);
    });

    it("site filter bootstrap uses stale-while-revalidate cache", () => {
        const ctx = read("contexts/WorkspaceSiteFilterContext.tsx");
        expect(ctx).toContain("readWorkspaceSiteFilterBootstrapCache");
        expect(ctx).toContain("writeWorkspaceSiteFilterBootstrapCache");
        expect(ctx).toContain("revalidating");
    });

    it("operational tasks nav seeds counts from module cache", () => {
        const badge = read("app/adminV2/components/OperationalTasksNavBadge.tsx");
        expect(badge).toContain("readOperationalTasksNavCountsCache");
    });

    it("session-scoped site filter bootstrap cache round-trip", () => {
        resetWorkspaceSiteFilterBootstrapCacheForTests();
        const scope = { orgId: "org-1", principalUserId: "user-1", accessScopeFingerprint: "fp-1" };
        const key = workspaceSiteFilterBootstrapScopeKey(scope);
        expect(key).toContain("org-1");
        const bootstrap = {
            site_scope: "all",
            sites: [{ id: "s1", label: "Campus A" }],
            show_dropdown: true,
            single_site_label: null,
        };
        writeWorkspaceSiteFilterBootstrapCache(scope, bootstrap);
        expect(readWorkspaceSiteFilterBootstrapCache(scope)?.sites[0]?.label).toBe("Campus A");
    });

    it("last-known bootstrap survives dept→work-unit hard reload before scope registers", () => {
        resetWorkspaceSiteFilterBootstrapCacheForTests();
        const scope = { orgId: "org-1", principalUserId: "user-1", accessScopeFingerprint: "fp-1" };
        const bootstrap = {
            site_scope: "all",
            sites: [{ id: "s1", label: "Campus A" }],
            show_dropdown: true,
            single_site_label: null,
        };
        writeWorkspaceSiteFilterBootstrapCache(scope, bootstrap);
        expect(readWorkspaceSiteFilterBootstrapCache(null)).toBeNull();
        expect(readWorkspaceSiteFilterBootstrapForShell(null)?.sites[0]?.label).toBe("Campus A");
        expect(readLastKnownWorkspaceSiteFilterBootstrap()?.sites[0]?.label).toBe("Campus A");
    });

    it("dept→work-unit transition keeps sticky display bootstrap in provider", () => {
        const ctx = read("contexts/WorkspaceSiteFilterContext.tsx");
        expect(ctx).toContain("displayBootstrapRef");
        expect(ctx).toContain("site_filter_bootstrap_sticky");
        expect(ctx).toContain("readWorkspaceSiteFilterBootstrapForShell");
        expect(ctx).not.toMatch(/if \(!cached\) setBootstrap\(null\)/);
    });

    it("TopNavBar renders location from displayBootstrap not only live bootstrap", () => {
        const nav = read("app/adminV2/components/TopNavBar.tsx");
        expect(nav).toContain("displayBootstrap");
        expect(nav).toContain("WorkspaceSiteFilterLocationReserve");
    });

    it("scope bridge registers synchronously before layout effects", () => {
        const bridge = read("app/adminV2/workspace/WorkspaceSiteFilterPersistenceScopeBridge.tsx");
        expect(bridge).toContain("registerWorkspaceSiteFilterPersistenceScope(scope)");
    });
});
