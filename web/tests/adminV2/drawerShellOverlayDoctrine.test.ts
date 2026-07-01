import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("Drawer shell pine workspace atmosphere", () => {
    it("uses full-bleed workspace atmosphere through BOS rail column", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toMatch(/\.adminv2-drawer-workspace-backdrop-band[\s\S]*?right: 0 !important/);
        const drawer = read("components/admin/Drawer.tsx");
        expect(drawer).toContain("right: 0");
        expect(drawer).not.toContain("DRAWER_BACKDROP_RIGHT_CSS_VAR");
    });

    it("defines locked premium pine-forward atmosphere with opaque base", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toContain("--adminv2-drawer-shell-overlay-background:");
        expect(css).toContain("--adminv2-drawer-shell-overlay-base:");
        expect(css).toContain("--adminv2-bos-rail-shell-wash:");
        expect(css).toContain("locked premium pine gradient");
        expect(css).toContain("--adminv2-drawer-shell-overlay-opacity: 0.7");
        expect(css).toContain("radial-gradient(");
        expect(css).toContain("rgba(0, 162, 131, 0.14)");
        expect(css).toContain("rgba(39, 63, 82, 0.032)");
        expect(css).toMatch(
            /\.adminv2-drawer-workspace-backdrop-band[\s\S]*?background: var\(--adminv2-drawer-shell-overlay-background\)/
        );
        expect(css).not.toContain('data-adminv2-workspace-atmosphere="minimal"');
        expect(css).not.toContain("rgba(39, 63, 82, 0.54)");
    });

    it("applies overlay wash to workspace drawer backdrop bands globally", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toContain(
            ".adminv2-drawer-workspace-backdrop-band.adminv2-drawer-modal-dim"
        );
        expect(css).toMatch(
            /\.adminv2-drawer-workspace-backdrop-band\.adminv2-drawer-modal-dim[\s\S]*?var\(--adminv2-drawer-shell-overlay-background\)/
        );
        expect(css).toMatch(
            /\.adminv2-drawer-workspace-loading-overlay[\s\S]*?var\(--adminv2-drawer-shell-overlay-background\)/
        );
    });

    it("applies subtle wash to BOS rail overlay shell without removing white dock surfaces", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toMatch(
            /\.adminv2-bos-rail-overlay[\s\S]*?var\(--adminv2-bos-rail-shell-wash/
        );
        expect(css).toMatch(
            /\.adminv2-bos-rail-overlay \.adminv2-ws-command-rail-bos-dock[\s\S]*?background-color: #ffffff/
        );
    });

    it("documents workspace atmosphere in platform doctrine", () => {
        const drawerDoc = readFileSync(resolve(webRoot, "../docs/system/drawer-operating-model-v1.md"), "utf8");
        expect(drawerDoc).toContain("workspace-atmosphere-doctrine.md");
        expect(drawerDoc).toContain("80% Bend Pine");

        const atmosphereDoc = readFileSync(resolve(webRoot, "../docs/system/workspace-atmosphere-doctrine.md"), "utf8");
        expect(atmosphereDoc).toContain("illuminated");
        expect(atmosphereDoc).toContain("Not modal dim");
    });

    it("uses transparent persistent command rail when drawer atmosphere is active", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toMatch(
            /\[data-adminv2-bos-rail-overlay-drawer="true"\] \[data-adminv2-persistent-command-rail="true"\][\s\S]*?background: transparent/
        );
    });

    it("Inbox and entity drawers reuse workspace backdrop band classes", () => {
        const inboxShell = read("app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx");
        expect(inboxShell).toContain("adminv2-drawer-workspace-backdrop-band");
        const drawer = read("components/admin/Drawer.tsx");
        expect(drawer).toContain("adminv2-drawer-workspace-backdrop-band");
    });
});
