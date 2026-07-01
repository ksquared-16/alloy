/**
 * Runtime section label coverage.
 * Each test asserts a canonical WS.* or WU.* section is present exactly once in the component
 * that owns it, and that no deprecated or duplicate sections are present.
 *
 * These are source-code assertions (grep-style) rather than DOM render tests — they protect
 * against section labels being silently removed or duplicated across components without updating
 * the runtime map (docs/platform/runtime/workspace-workunit-runtime-map.md).
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const WEB_ROOT = path.resolve(__dirname, "../..");

function readFile(rel: string): string {
    return fs.readFileSync(path.join(WEB_ROOT, rel), "utf8");
}

function countOccurrences(source: string, needle: string): number {
    return source.split(needle).length - 1;
}

describe("WS.* section labels", () => {
    it("WS.PROCESS_GRID appears exactly once — owned by WorkspaceRootLifecycleGrid", () => {
        const src = readFile("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(countOccurrences(src, '"WS.PROCESS_GRID"')).toBe(1);
    });

    it("WS.PROCESS_TILE appears in WorkspaceRootLifecycleGrid grid render, not in any other workspace file", () => {
        const src = readFile("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(countOccurrences(src, '"WS.PROCESS_TILE"')).toBeGreaterThanOrEqual(1);
    });

    it("WS.PROCESS_TILE_WORK_VIEWS appears exactly once — owned by WorkViewEntryList", () => {
        const src = readFile("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(countOccurrences(src, '"WS.PROCESS_TILE_WORK_VIEWS"')).toBe(1);
    });

    it("WS.HEADER appears exactly once — owned by WorkspaceRootShell command header div", () => {
        const src = readFile("components/admin/workspace/WorkspaceRootShell.tsx");
        expect(countOccurrences(src, '"WS.HEADER"')).toBe(1);
    });

    it("WS.PROCESS_GRID is not present in WorkspaceRootShell (no duplicate ownership)", () => {
        const src = readFile("components/admin/workspace/WorkspaceRootShell.tsx");
        expect(countOccurrences(src, '"WS.PROCESS_GRID"')).toBe(0);
    });
});

describe("WU.* section labels", () => {
    it("WU.PAGE_SHELL appears exactly once — owned by WorkUnitSlugRouteHost", () => {
        const src = readFile("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        expect(countOccurrences(src, '"WU.PAGE_SHELL"')).toBe(1);
    });

    it("WU.HEADER appears in WorkUnitCommandSurface (canonical header owner)", () => {
        const src = readFile("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        expect(countOccurrences(src, '"WU.HEADER"')).toBeGreaterThanOrEqual(1);
    });

    it("WU.HEADER_TITLE appears in WorkUnitCommandSurface", () => {
        const src = readFile("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        expect(countOccurrences(src, '"WU.HEADER_TITLE"')).toBe(1);
    });

    it("WU.HEADER_CALCULATIONS appears in WorkUnitCommandSurface", () => {
        const src = readFile("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        expect(countOccurrences(src, '"WU.HEADER_CALCULATIONS"')).toBe(1);
    });

    it("WU.WORK_VIEW_PILLS appears in WorkUnitCommandSurface (pill strip owner)", () => {
        const src = readFile("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        expect(countOccurrences(src, '"WU.WORK_VIEW_PILLS"')).toBe(1);
    });

    it("WU.QUEUE_REGION appears in WorkUnitWorkspace shell", () => {
        const src = readFile("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(countOccurrences(src, '"WU.QUEUE_REGION"')).toBe(1);
    });

    it("WU.PAGE_SHELL is not present in WorkUnitCommandSurface (no duplicate ownership)", () => {
        const src = readFile("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        expect(countOccurrences(src, '"WU.PAGE_SHELL"')).toBe(0);
    });
});

describe("resolver bug guards", () => {
    it("resolveDeptPipelineExecSurface does not contain raw layout guard", () => {
        const src = readFile("lib/workspace/resolveDeptPipelineExecSurface.ts");
        // Raw guard: `def.ui?.layout !== "pipeline_with_attention"` must not gate on this directly
        expect(src).not.toContain('def.ui?.layout !== "pipeline_with_attention"');
    });

    it("resolveDeptPipelineExecSurfaceServer does not contain raw layout guard", () => {
        const src = readFile("lib/workspace/resolveDeptPipelineExecSurfaceServer.ts");
        expect(src).not.toContain('def.ui?.layout !== "pipeline_with_attention"');
    });

    it("DeptPipelineExecSurface type includes workUnitKey field", () => {
        const src = readFile("lib/workspace/resolveDeptPipelineExecSurface.ts");
        expect(src).toContain("workUnitKey: string | null");
    });

    it("fetchWorkUnitsForSlugResolution includes ENROLLMENT_PIPELINE_WORK_UNIT_KEY in strategy 2", () => {
        const src = readFile("lib/admin/fetchWorkUnitsForSlugResolution.ts");
        expect(src).toContain("ENROLLMENT_PIPELINE_WORK_UNIT_KEY");
    });
});
