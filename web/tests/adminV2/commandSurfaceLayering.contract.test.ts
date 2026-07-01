import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    ADMINV2_COMMAND_SURFACE_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";

const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const drawerOutsideClickPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../lib/adminV2/drawerOutsideClick.ts"
);

describe("AdminV2 command surface layering (Gate A blocker)", () => {
    it("command surface z-index is above portaled drawer panel", () => {
        expect(ADMINV2_COMMAND_SURFACE_Z).toBeGreaterThan(ADMINV2_DRAWER_PANEL_Z);
    });

    it("AICommandSurfaceShell portals a fixed global footer above drawers", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).toContain("createPortal");
        expect(src).toContain("document.body");
        expect(src).toContain("ADMINV2_COMMAND_SURFACE_Z");
        expect(src).toContain('data-adminv2-command-surface-layer="global"');
        expect(src).toContain("fixed inset-x-0 bottom-2");
        expect(src).toContain("pointer-events-auto");
        expect(src).toContain("OperationalActiveRecordChip");
    });

    it("drawer outside-click ignores command surface so rail stays usable", () => {
        const src = readFileSync(drawerOutsideClickPath, "utf8");
        expect(src).toContain("[data-adminv2-ai-command-surface]");
    });
});
