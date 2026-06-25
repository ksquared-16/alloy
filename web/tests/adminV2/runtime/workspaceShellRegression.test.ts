import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Alloy OS workspace shell regression guards", () => {
    it("Work Unit Context renders the polished Concept B bar when runtime flag is on", () => {
        const surface = readSrc("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        expect(surface).toContain("ALLOY_OS_RUNTIME_ENABLED");
        expect(surface).toContain('className="adminv2-os-context"');
        expect(surface).toContain("adminv2-os-context__kpi-strip");
        expect(surface).toContain("adminv2-os-context__perspective-rail");
        expect(surface).toContain("data-alloy-os-work-unit-context");
    });

    it("WorkUnitWorkspace publishes context-bar + queue-header hosts without rewriting queue rows", () => {
        const shell = readSrc("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(shell).toContain('data-alloy-os-context-bar=');
        expect(shell).toContain('data-alloy-os-queue-header="true"');
        expect(shell).toContain("CompressedQueueHeader");
        expect(shell).toContain("resolveCompressedQueueHeader");
        expect(shell).not.toContain("CompressedQueueRow");
    });

    it("QueueBlock swaps to CompressedQueueRow only when split is active", () => {
        const block = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(block).toContain("useAlloyOsRuntimeSplitActive");
        expect(block).toContain("CompressedQueueRow");
        expect(block).toContain("resolveCompressedQueueRowDisplay");
        expect(block).toContain("data-queue-row-active");
        expect(block).toMatch(/splitActive && crm\s*\?/);
    });

    it("Focus Panel activation stays isolated from workspace shell files", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("focusPanelActive");
        expect(runtime).toContain("OpportunityFocusPanelModeBody");
        const shell = readSrc("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(shell).not.toContain("OpportunityFocusPanel");
    });

    it("split geometry + outside-click guards remain wired", () => {
        expect(readSrc("app/adminV2/components/AdminV2ShellDrawerScope.tsx")).toContain(
            "AlloyOsRuntimeSplitController",
        );
        expect(readSrc("lib/bos/drawerWorkspaceGeometry.ts")).toContain("computeAlloyOsFocusPanelBounds");
        expect(readSrc("lib/adminV2/drawerOutsideClick.ts")).toContain(
            "ADMINV2_DRAWER_OUTSIDE_CLICK_SPLIT_IGNORE_SELECTOR",
        );
    });
});
