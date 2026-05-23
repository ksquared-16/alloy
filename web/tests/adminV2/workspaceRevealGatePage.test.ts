import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("workspace above-fold reveal gate (page)", () => {
    it("page holds WorkspacePageLoadingGate until above_fold_ready", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("workspaceRevealGate");
        expect(page).toContain("workspaceAboveFoldPageReady");
        expect(page).toContain("WorkspacePageLoadingGate");
        expect(page).toMatch(/!workspaceAboveFoldPageReady[\s\S]*WorkspacePageLoadingGate/);
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
