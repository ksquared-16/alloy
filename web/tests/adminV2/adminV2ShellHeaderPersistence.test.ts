import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    readWorkspaceSiteFilterBootstrapCache,
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
});
