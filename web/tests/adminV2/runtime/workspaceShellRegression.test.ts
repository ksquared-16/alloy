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

    it("QueueBlock swaps to CompressedQueueRow only when split (or split intent) is active", () => {
        const block = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(block).toContain("useAlloyOsRuntimeSplitActive");
        expect(block).toContain("CompressedQueueRow");
        expect(block).toContain("resolveCompressedQueueRowDisplay");
        expect(block).toContain("data-queue-row-active");
        // `splitRenderActive` = `splitActive` OR the synchronous runtime split-intent (open
        // operational subject) — bridging the one frame before the `<html>` split attribute
        // propagates so the post-open full-width rows never flash (WU-05).
        expect(block).toMatch(/const splitRenderActive\s*=\s*\n?\s*splitActive \|\|/);
    });

    it("QueueBlock locks the row presentation to compressed during runtime operational entry (cold-entry guard)", () => {
        const block = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        // The per-row fork must render through the cold-entry-safe presentation flag, not the raw
        // split attribute — closing the stale-phase first frame where the persisted operational
        // entry phase is briefly "ready" before the controller effect resets it to "preparing".
        expect(block).toMatch(/const runtimeQueuePresentationLocked\s*=\s*ALLOY_OS_RUNTIME_ENABLED && operationalEntry != null/);
        expect(block).toMatch(
            /const compressedRowPresentation\s*=\s*\n?\s*ALLOY_OS_RUNTIME_ENABLED \|\| splitRenderActive \|\| runtimeQueuePresentationLocked/,
        );
        // The compressed-vs-legacy fork and the active-row highlight both consume the locked flag.
        expect(block).toMatch(/compressedRowPresentation && crm\s*\?/);
        expect(block).toMatch(/data-queue-row-active=\{\s*\n?\s*compressedRowPresentation &&/);
    });

    it("QueueBlock full-width legacy row presentation stays flag-off / non-compressed only", () => {
        const block = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        // The full-width expanded presentations live exclusively in the `else` branch of the
        // `compressedRowPresentation && crm` fork, so in runtime mode (flag on, provider present)
        // they are unreachable once rows render — they only paint flag-off or for non-crm lanes.
        const forkIdx = block.indexOf("compressedRowPresentation && crm ?");
        expect(forkIdx).toBeGreaterThan(-1);
        const elseIdx = block.indexOf(": <>", forkIdx);
        expect(elseIdx).toBeGreaterThan(forkIdx);
        const compressedBranch = block.slice(forkIdx, elseIdx);
        // Compressed branch renders only the compressed row — never the full-width presentations.
        expect(compressedBranch).toContain("CompressedQueueRow");
        expect(compressedBranch).not.toContain("LayoutRuntimeQueueRowView");
        expect(compressedBranch).not.toContain("CrmCompactQueuePreview");
        // Full-width presentations exist only after the else marker (the non-compressed branch).
        expect(block.indexOf("LayoutRuntimeQueueRowView", elseIdx)).toBeGreaterThan(-1);
        expect(block.indexOf("CrmCompactQueuePreview", elseIdx)).toBeGreaterThan(-1);
        // Empty / known-empty queue semantics are unchanged: the "No records" panel is still gated
        // on a settled lane (not loading, not held, zero items) and is not behind the lock.
        expect(block).toMatch(/!queue\.rowsLoading && !queue\.rowsHeld && queue\.items\.length === 0/);
    });

    it("WorkspaceRootShell no longer accepts or threads the dead workspaceRollupRefined prop", () => {
        const shell = readSrc("components/admin/workspace/WorkspaceRootShell.tsx");
        // The header now renders in final placement immediately, so the prop is dead. It must be
        // gone from the props type and every call site, but the page-level rollup state remains.
        expect(shell).not.toMatch(/workspaceRollupRefined\??:/);
        const coldShell = readSrc("components/admin/workspace/WorkspaceRootColdShell.tsx");
        expect(coldShell).not.toContain("workspaceRollupRefined");
        const page = readSrc("app/adminV2/workspace/page.tsx");
        expect(page).not.toContain("workspaceRollupRefined={workspaceRollupRefined}");
        // Page-level rollup state is still wired for the OIP/placement refinement effects.
        expect(page).toContain("const [workspaceRollupRefined, setWorkspaceRollupRefined]");
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
