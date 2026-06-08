import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    resetAdminV2NavigationTransitionForTests,
    runAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation/adminV2NavigationTransition";
import { buildDepartmentOperationalBootstrapUrl } from "@/lib/adminV2/navigation/prefetchDepartmentOperationalBootstrap";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("workspace → dept orchestrated navigation (Card 2)", () => {
    it("WorkspaceRootDepartmentGrid uses transition helper and native anchors", () => {
        const grid = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
        expect(grid).toContain("runAdminV2NavigationTransition");
        expect(grid).toContain("prefetchDepartmentOperationalBootstrap");
        expect(grid).toContain('variant: "department"');
        expect(grid).toContain("workspaceDeptClickedKey");
        expect(grid).toContain("adminV2NavigationClickedItemProps");
        expect(grid).toContain("router.push(href)");
        expect(grid).toContain('<a');
        expect(grid).not.toContain('from "next/link"');
        expect(grid).not.toContain("<Link");
        expect(grid).not.toContain("adminV2CommitNavigation");
    });

    it("AdminV2Shell mounts transition ribbon in workspace content chrome", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("AdminV2NavigationTransitionRibbon");
    });

    it("transition ribbon component is idle by default (returns null when not transitioning)", () => {
        const ribbon = read("components/admin/workspace/AdminV2NavigationTransitionRibbon.tsx");
        expect(ribbon).toContain("if (!transition.isTransitioning) return null");
        expect(ribbon).toContain("WsRouteLoadingRibbon");
    });

    it("dept → work-unit hard nav is unchanged", () => {
        const deptPage = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(deptPage).toMatch(/DeptOperConsoleQueueRow[\s\S]*?adminV2CommitNavigation\(href/);
    });

    it("bootstrap prefetch URL matches dept page operational-bootstrap path", () => {
        const deptPage = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(deptPage).toContain("/operational-bootstrap?");
        const url = buildDepartmentOperationalBootstrapUrl("dept-1");
        expect(url).toContain("/api/admin/departments/dept-1/operational-bootstrap");
        expect(url).toContain("summary_mode=priority");
    });
});

describe("workspace dept transition runtime", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetAdminV2NavigationTransitionForTests();
    });

    afterEach(() => {
        resetAdminV2NavigationTransitionForTests();
        vi.useRealTimers();
    });

    it("timeout still commits router.push", async () => {
        const commit = vi.fn();
        let resolvePrepare: (() => void) | undefined;
        const prepare = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolvePrepare = resolve;
                })
        );

        const resultP = runAdminV2NavigationTransition({
            href: "/adminV2/workspace/dept/dept-1",
            clickedKey: "dept:dept-1",
            variant: "department",
            prepare,
            commit,
            timeoutMs: 400,
        });

        await vi.advanceTimersByTimeAsync(400);
        const result = await resultP;

        expect(result).toBe("timeout");
        expect(commit).toHaveBeenCalledTimes(1);
        resolvePrepare?.();
    });

    it("prepare failure still commits by default", async () => {
        const commit = vi.fn();
        const result = await runAdminV2NavigationTransition({
            href: "/adminV2/workspace/dept/dept-1",
            clickedKey: "dept:dept-1",
            variant: "department",
            prepare: async () => {
                throw new Error("bootstrap failed");
            },
            commit,
        });

        expect(result).toBe("prepare_failed");
        expect(commit).toHaveBeenCalledTimes(1);
    });
});
