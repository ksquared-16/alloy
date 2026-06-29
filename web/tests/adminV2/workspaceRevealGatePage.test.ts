import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("workspace above-fold reveal gate (page)", () => {
    it("reveals from the Route VM with no loading gate (WorkspacePageLoadingGate retired)", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        // The loading gate is deleted — the surface reveals its final structure from the Route VM +
        // Operational Shell immediately; deferred values refine in reserved slots.
        expect(page).not.toContain('import { WorkspacePageLoadingGate }');
        expect(page).not.toMatch(/return <WorkspacePageLoadingGate/);
        // Shell readiness no longer waits on the client departments fetch for the lifecycle landing.
        expect(page).toContain("operator_lifecycle_landing: true");
        // Reveal-gate computation is retained as a perf/diagnostic + prefetch signal (delete-eligible).
        expect(page).toContain("workspaceRevealGate");
    });

    it("the WorkspacePageLoadingGate component is deleted", () => {
        let exists = true;
        try {
            read("app/adminV2/components/workspace/WorkspacePageLoadingGate.tsx");
        } catch {
            exists = false;
        }
        expect(exists).toBe(false);
    });

    it("idle prefetch caps visible departments", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("prefetchVisibleDepartmentAboveFoldBundles");
    });

    it("shell does not progressively reveal department skeleton tiles after gate", () => {
        const shell = read("components/admin/workspace/WorkspaceRootShell.tsx");
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("departmentsPending={false}");
        expect(page).toContain("deptTileStatsPending={false}");
        expect(shell).toContain("kpiQuietReserveOnly");
    });
});
