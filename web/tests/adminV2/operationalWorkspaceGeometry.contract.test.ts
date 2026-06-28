import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

/**
 * Operational Workspace Geometry is a platform-level layout contract: any surface that marks
 * itself as an Operational Workspace inherits the full operational band (sidebar → BOS rail),
 * never capped or centered, and is excluded from drawer / Focus Panel / split geometry.
 */
describe("Operational Workspace Geometry — platform contract", () => {
    it("the operational CSS rule derives width from the measured band without fixed cap or centering", () => {
        const css = read("app/adminV2/adminV2.css");
        const rule =
            css.match(
                /\.operational-workspace-surface\[data-operational-workspace="true"\][\s\S]*?\{[\s\S]*?\}/,
            )?.[0] ?? "";
        expect(rule).toContain("--operational-workspace-left");
        expect(rule).toContain("--operational-workspace-width");
        // Width + max-width are derived from the measured band (scaled by the fill ratio), not a fixed px cap.
        expect(rule).toContain("--operational-workspace-fill");
        expect(rule).toMatch(/max-width:\s*calc\([\s\S]*?--operational-workspace-width/);
        expect(rule).toContain("transform: none !important");
        // Never width-capped at a fixed pixel value.
        expect(rule).not.toMatch(/max-width:\s*1280px/);
        expect(rule).not.toMatch(/max-width:\s*80rem/);
    });

    it("entity drawer + Focus Panel geometry rules exclude operational workspaces", () => {
        const adminCss = read("app/adminV2/adminV2.css");
        const splitCss = read("app/adminV2/components/alloyOsRuntime.css");

        // Drawer computed-rect rule (centered/capped entity drawers) must not match operational.
        expect(adminCss).toMatch(
            /\.adminv2-drawer-modal-panel--bos-rail:not\(\[data-operational-workspace="true"\]\)\s*\{[\s\S]*?--adminv2-drawer-computed-left/,
        );
        // Split Focus-Panel peer-dock must not match operational.
        expect(splitCss).toContain(
            '.adminv2-drawer-modal-panel--bos-rail.adminv2-drawer-shell-inset:not([data-operational-workspace="true"])',
        );
    });

    it("the geometry module classifies by workspace type (marker), never by feature name", () => {
        const geom = read("lib/bos/operationalWorkspaceGeometry.ts");
        expect(geom).toContain("computeOperationalWorkspaceBounds");
        expect(geom).toContain('OPERATIONAL_WORKSPACE_ATTR = "data-operational-workspace"');
        // Classification is driven by the marker attribute, not feature-specific branches.
        expect(geom).toContain("OPERATIONAL_WORKSPACE_OPEN_SELECTOR");

        // Strip comments; the executable geometry logic must not branch on feature names.
        const code = geom
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");
        for (const feature of ["Communications", "Processing", "CreateLead", "Inbox", "Analytics", "MyTasks"]) {
            expect(code).not.toContain(feature);
        }
    });

    it("operational shells consume the shared abstraction (not the drawer/action geometry paths)", () => {
        const inbox = read("app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx");
        const createLead = read("components/admin/actions/ActionWorkspaceBosShell.tsx");

        for (const shell of [inbox, createLead]) {
            expect(shell).toContain("useOperationalWorkspaceGeometry");
            expect(shell).toContain("OPERATIONAL_WORKSPACE_SURFACE_CLASS");
            expect(shell).toContain("OPERATIONAL_WORKSPACE_ATTR");
            expect(shell).toContain("OPERATIONAL_WORKSPACE_LEFT_CSS_VAR");
            expect(shell).toContain("OPERATIONAL_WORKSPACE_WIDTH_CSS_VAR");
        }

        // The shells must no longer drive centered drawer / action geometry themselves.
        expect(inbox).not.toContain("measureAndApplyDrawerWorkspaceGeometry");
        expect(createLead).not.toContain("measureAndApplyActionWorkspaceGeometry");
    });

    it("entity drawers do NOT adopt the operational marker (drawer geometry unchanged)", () => {
        const drawer = read("components/admin/Drawer.tsx");
        expect(drawer).not.toContain("operational-workspace-surface");
        expect(drawer).not.toContain("data-operational-workspace");
    });
});
