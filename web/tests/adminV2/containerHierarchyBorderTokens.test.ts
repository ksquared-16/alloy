import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONTAINER_BORDER_LEVEL_1_DRAWER_SHELL,
    CONTAINER_BORDER_LEVEL_2_RAIL_SHELL,
    LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";

const webRoot = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("container hierarchy border tokens", () => {
    it("defines level 1 drawer shell stronger than level 2 rail shell", () => {
        expect(LAYOUT_RUNTIME_DRAWER_OUTER_BORDER).toBe(CONTAINER_BORDER_LEVEL_1_DRAWER_SHELL);
        const drawerAlpha = Number(CONTAINER_BORDER_LEVEL_1_DRAWER_SHELL.match(/[\d.]+(?=\))/)?.[0]);
        const railAlpha = Number(CONTAINER_BORDER_LEVEL_2_RAIL_SHELL.match(/[\d.]+(?=\))/)?.[0]);
        expect(drawerAlpha).toBeGreaterThan(railAlpha);
    });

    it("adminV2.css exposes drawer and rail hierarchy CSS variables", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toContain("--adminv2-container-border-drawer:");
        expect(css).toContain("--adminv2-container-border-rail:");
        expect(css).toContain("var(--adminv2-container-border-drawer");
        expect(css).toContain("var(--adminv2-container-border-rail");
    });

    it("drawer modal shell uses level 1 border token in CSS", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toMatch(
            /\.adminv2-drawer-modal-panel--bos-rail[\s\S]*?var\(--adminv2-container-border-drawer/
        );
    });

    it("BOS rail outer overlay uses level 2 border token without strengthening starter cards", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toMatch(/\.adminv2-bos-rail-overlay[\s\S]*?var\(--adminv2-container-border-rail/);
        const starterBlock = css.match(/\.bos-rail-starter-card\s*\{[^}]*\}/)?.[0] ?? "";
        expect(starterBlock).not.toContain("var(--adminv2-container-border-rail");
    });

    it("actions rail section uses level 2 border token", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toMatch(
            /\.adminv2-ws-command-rail-actions-section[\s\S]*?var\(--adminv2-container-border-rail/
        );
    });

    it("Inbox/Tasks workspace modal shell uses drawer outer border token", () => {
        const src = read("app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx");
        expect(src).toContain("LAYOUT_RUNTIME_DRAWER_OUTER_BORDER");
    });

    it("Drawer component applies level 1 border to adminV2 modal shells", () => {
        const src = read("components/admin/Drawer.tsx");
        expect(src).toContain("LAYOUT_RUNTIME_DRAWER_OUTER_BORDER");
        expect(src).toMatch(/isV2 \? LAYOUT_RUNTIME_DRAWER_OUTER_BORDER/);
    });
});
