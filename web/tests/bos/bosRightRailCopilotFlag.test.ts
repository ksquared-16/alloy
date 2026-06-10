import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isBosRightRailCopilotEnabledClient } from "@/lib/bos/bosRightRailCopilotFlag";

const webRoot = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("bosRightRailCopilotFlag", () => {
    it("defaults off without env", () => {
        expect(isBosRightRailCopilotEnabledClient()).toBe(false);
    });

    it("AdminV2Shell uses CommandRailBosMount without separate operations rail", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("CommandRailBosMount");
        expect(shell).not.toContain("AdminV2OperationsRail");
        expect(shell).toContain("AdminV2CommandRailBosHostFooter");
    });

    it("workspace command rail hosts BOS dock", () => {
        const railShell = read("app/adminV2/components/workspace/WorkspaceCommandRailShell.tsx");
        expect(railShell).toContain("data-adminv2-command-rail-bos-host");
        expect(read("components/admin/workspace/WorkspaceShellLayout.tsx")).toContain(
            "WorkspaceCommandRailShell"
        );
    });

    it("drawer sidebar offsets from BOS overlay width + gutter", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toContain("--adminv2-workspace-command-rail-offset");
        expect(css).toContain("--adminv2-bos-overlay-width");
        expect(css).toContain("--adminv2-bos-overlay-gutter");
        const offsetHook = read("app/adminV2/components/useWorkspaceCommandRailDrawerOffset.ts");
        expect(offsetHook).toContain("data-adminv2-bos-rail-overlay");
        expect(offsetHook).toContain("BOS_RAIL_OVERLAY_GUTTER_PX");
        const drawer = read("components/admin/Drawer.tsx");
        expect(drawer).toContain("adminv2-drawer-computed-left");
        expect(offsetHook).toContain("data-adminv2-sidebar");
        expect(offsetHook).toContain("computeDrawerWorkspaceBounds");
    });

    it("workspace root uses Actions + BOS rail pattern", () => {
        expect(read("components/admin/workspace/WorkspaceRootShell.tsx")).toContain("WorkspaceRootActionsRail");
        expect(read("app/adminV2/components/workspace/WorkspaceRootActionsRail.tsx")).toContain(
            "CommandRailCollapsibleActionsSection"
        );
    });

    it("AICommandSurfaceShell supports rail presentation in command rail mount", () => {
        const mount = read("app/adminV2/components/CommandRailBosMount.tsx");
        expect(mount).toContain("presentation=\"rail\"");
        expect(mount).toContain("createPortal");
        expect(mount).toContain("data-adminv2-bos-rail-overlay");
        expect(mount).toContain("ADMINV2_COMMAND_SURFACE_Z");
        expect(read("lib/bos/bosRailOverlayAnchor.ts")).toContain("safe-area-inset-bottom");
    });
});
