import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS,
    shouldCloseAdminV2DrawerOnOutsideTarget,
} from "@/lib/adminV2/drawerOutsideClick";
import { DEPT_PAIRED_OPER_QUEUE_SKELETON_ROW_COUNT } from "@/components/admin/workspace/DepartmentPairedOperQueuesSkeleton";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

/** Minimal Element mock for `closest()` contract tests (node test env). */
class MockClosestNode {
    constructor(
        public attrs: Record<string, string>,
        public parent?: MockClosestNode,
    ) {}

    closest(selector: string): MockClosestNode | null {
        const m = /\[([^=\]]+)(?:="([^"]*)")?\]/.exec(selector);
        if (!m) return null;
        const [, attr, val] = m;
        let cur: MockClosestNode | undefined = this;
        while (cur) {
            if (attr in cur.attrs && (val === undefined || cur.attrs[attr] === val)) return cur;
            cur = cur.parent;
        }
        return null;
    }
}

function mockTarget(attrs: Record<string, string>, parent?: MockClosestNode): EventTarget {
    return new MockClosestNode(attrs, parent) as unknown as EventTarget;
}

describe("AdminV2 drawer outside click", () => {
    it("ignores drawer panel and command bar targets", () => {
        const drawerPanel = mockTarget({ "data-adminv2-drawer": "true" });
        const commandBar = mockTarget({ "data-adminv2-ai-command-bar": "" });
        const commandSurface = mockTarget({ "data-adminv2-ai-command-surface": "" });
        const outside = mockTarget({});

        expect(shouldCloseAdminV2DrawerOnOutsideTarget(drawerPanel)).toBe(false);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(commandBar)).toBe(false);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(commandSurface)).toBe(false);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(outside)).toBe(true);
    });

    it("ignores nested targets inside the drawer panel", () => {
        const panel = new MockClosestNode({ "data-adminv2-drawer": "true" });
        const inner = mockTarget({}, panel);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(inner)).toBe(false);
    });

    it("Drawer wires mousedown listener with cleanup", () => {
        const src = read("components/admin/Drawer.tsx");
        expect(src).toContain("shouldCloseAdminV2DrawerOnOutsideTarget");
        expect(src).toContain('document.addEventListener("mousedown", onMouseDown)');
        expect(src).toContain('document.removeEventListener("mousedown", onMouseDown)');
        expect(src).toContain("pointer-events-none");
    });

    it("exports stable ignore selectors for command bar surfaces", () => {
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain("[data-adminv2-ai-command-bar]");
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain("[data-adminv2-ai-command-surface]");
    });
});

describe("Dept paired oper queue skeleton alignment", () => {
    it("uses the same row count for throughput and attention panels", () => {
        expect(DEPT_PAIRED_OPER_QUEUE_SKELETON_ROW_COUNT).toBe(5);
        const src = read("components/admin/workspace/DepartmentPairedOperQueuesSkeleton.tsx");
        expect(src).toContain('variant="throughput"');
        expect(src).toContain('variant="attention"');
        expect((src.match(/count=\{rowCount\}/g) ?? []).length).toBe(2);
    });
});

describe("Work-unit KPI and queue picker loading", () => {
    it("uses grouped KPI strip placeholder while placement or summaries are pending", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(src).toContain("workUnitKpiMetricsPending");
        expect(src).toContain("KpiStripSkeleton");
        expect(src).toContain("kpiStripPlaceholder={workUnitKpiStripPlaceholder}");
    });

    it("queue tab count pending uses skeleton pulse, not spinners", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(src).toMatch(/countBadgePending[\s\S]*?skeleton-pulse/);
        expect(src).not.toMatch(/countBadgePending[\s\S]*?animate-spin/);
    });
});

describe("Drawer opportunity header grouped loading", () => {
    it("keeps workflow header chrome in skeleton until shell settles", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toMatch(
            /opportunityWorkflowHeaderChromePending[\s\S]*?!opportunityDrawerShellSettled/,
        );
    });

    it("uses tab strip gate skeleton while opportunity tabs are pending", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("DrawerRecordTabStripGateSkeleton");
        expect(src).toContain("opportunityDrawerTabsPending");
    });

    it("queue preview seed avoids generic Inquiry title when bootstrap", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityDrawerQueueBootstrap");
        expect(src).toMatch(/opportunityQueuePreviewSeed\?\.title/);
    });
});
