import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    ADMINV2_COMMAND_SURFACE_Z,
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
    ADMINV2_SHELL_CHROME_Z,
} from "@/components/admin/Drawer";

const drawerPath = join(dirname(fileURLToPath(import.meta.url)), "../../components/admin/Drawer.tsx");
const drawerSource = readFileSync(drawerPath, "utf8");

describe("AdminV2 sidebar drawer pointer-events contract", () => {
    it("sidebar dim is visual-only and does not capture clicks", () => {
        expect(drawerSource).toContain("adminv2-drawer-sidebar-dim");
        expect(drawerSource).toMatch(
            /adminv2-drawer-sidebar-dim[\s\S]*?pointer-events-none/
        );
    });

    it("sidebar panel is right-docked with explicit width cap and pointer-events-auto", () => {
        expect(drawerSource).toContain("adminv2-drawer-sidebar-panel");
        expect(drawerSource).toMatch(
            /adminv2-drawer-sidebar-panel[\s\S]*?pointer-events-auto/
        );
        expect(drawerSource).toContain("left-auto");
        expect(drawerSource).toContain("w-[min(100vw,42rem)]");
        expect(drawerSource).toContain("adminv2-drawer-shell-inset");
        expect(drawerSource).toContain("ADMINV2_SHELL_HEADER_INSET");
        expect(drawerSource).toContain("ADMINV2_SHELL_COMMAND_INSET");
        expect(drawerSource).not.toMatch(
            /adminv2-drawer-sidebar-dim[\s\S]*?onClick=\{onClose\}/
        );
    });

    it("documents shell chrome z-index above drawer backdrop", () => {
        expect(drawerSource).toContain("ADMINV2_SHELL_CHROME_Z");
        expect(drawerSource).toContain("ADMINV2_DRAWER_BACKDROP_Z");
        expect(drawerSource).toContain("ADMINV2_DRAWER_PANEL_Z");
        expect(drawerSource).toContain("ADMINV2_COMMAND_SURFACE_Z");
    });

    it("stacking order: drawer < command surface < shell chrome", () => {
        expect(ADMINV2_DRAWER_BACKDROP_Z).toBeLessThan(ADMINV2_DRAWER_PANEL_Z);
        expect(ADMINV2_DRAWER_PANEL_Z).toBeLessThan(ADMINV2_COMMAND_SURFACE_Z);
        expect(ADMINV2_COMMAND_SURFACE_Z).toBeLessThan(ADMINV2_SHELL_CHROME_Z);
    });

    it("modal record drawer dim does not capture workspace clicks", () => {
        expect(drawerSource).toContain("adminv2-drawer-modal-dim");
        expect(drawerSource).toMatch(/adminv2-drawer-modal-dim[\s\S]*?pointer-events-none/);
        expect(drawerSource).not.toMatch(/adminv2-drawer-modal-dim[\s\S]*?onClick=\{onClose\}/);
        expect(drawerSource).toContain("adminv2-drawer-modal-panel");
        expect(drawerSource).toMatch(/adminv2-drawer-modal-panel[\s\S]*?adminv2-drawer-shell-inset/);
        expect(drawerSource).not.toMatch(/adminv2-drawer-modal-panel[\s\S]*?-translate-y-1\/2/);
    });

    it("portals drawer layers to document.body", () => {
        expect(drawerSource).toContain("createPortal");
        expect(drawerSource).toContain("document.body");
    });
});
