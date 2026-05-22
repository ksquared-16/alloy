import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    ADMINV2_DRAWER_TAB_PANEL_MIN_H,
    adminV2DrawerTabPanelHostStyle,
    createOpportunityDrawerTabVisitSet,
    markOpportunityDrawerTabVisited,
    opportunityDrawerWorkflowTabMountEnabled,
    opportunityDrawerWorkflowTabPaneClass,
} from "@/lib/admin/drawer/opportunityDrawerTabSession";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("opportunityDrawerTabSession", () => {
    it("exports stable tab panel min-height geometry", () => {
        expect(ADMINV2_DRAWER_TAB_PANEL_MIN_H).toBe("22rem");
        expect(adminV2DrawerTabPanelHostStyle()).toEqual({ minHeight: "22rem" });
    });

    it("seeds overview as visited on new drawer session", () => {
        const visited = createOpportunityDrawerTabVisitSet();
        expect(visited.has("overview")).toBe(true);
        expect(visited.has("communications")).toBe(false);
        markOpportunityDrawerTabVisited(visited, "communications");
        expect(visited.has("communications")).toBe(true);
    });

    it("mounts only visited workflow tabs", () => {
        const visited = createOpportunityDrawerTabVisitSet();
        expect(opportunityDrawerWorkflowTabMountEnabled(true, visited, "overview")).toBe(true);
        expect(opportunityDrawerWorkflowTabMountEnabled(true, visited, "activity")).toBe(false);
        markOpportunityDrawerTabVisited(visited, "activity");
        expect(opportunityDrawerWorkflowTabMountEnabled(true, visited, "activity")).toBe(true);
    });

    it("uses hidden/block pane classes without unmounting", () => {
        expect(opportunityDrawerWorkflowTabPaneClass("overview", "overview")).toContain("block");
        expect(opportunityDrawerWorkflowTabPaneClass("overview", "communications")).toContain("hidden");
    });
});

describe("AdminEntityDrawer opportunity workflow tab session (Card 3)", () => {
    it("keeps visited panes mounted and routes tab strip through selectDrawerTab", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("createOpportunityDrawerTabVisitSet");
        expect(src).toContain("renderOpportunityWorkflowTabPane");
        expect(src).toContain("selectDrawerTab");
        expect(src).toContain("opportunityDrawerVisitedTabsRef");
        expect(src).toContain('data-adminv2-drawer-tab-panel-host');
        expect(src).toContain("ADMINV2_DRAWER_TAB_PANEL_MIN_H");
        expect(src).toMatch(/onClick=\{\(\) => selectDrawerTab\(tab\)\}/);
        expect(src).toMatch(/renderOpportunityWorkflowTabPane\([\s\S]*?"communications"/);
        expect(src).toMatch(/renderOpportunityWorkflowTabPane\([\s\S]*?"overview"/);
    });

    it("gates opportunity activity fetch to activity tab only", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toMatch(/if \(drawerTab !== "activity"\) return;/);
        expect(src).not.toMatch(
            /drawer\.type === "opportunities"[\s\S]{0,120}drawerTab === "overview"[\s\S]{0,120}fetch\(`\/api\/admin\/activity/,
        );
    });

    it("does not disable inquiry workflow tab strip on drawerGateLoading after reveal", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        const workflowStrip = src.match(
            /opportunityInquiryWorkflowDrawer[\s\S]{0,900}drawerTabStripKeys\.map/,
        )?.[0];
        expect(workflowStrip).toBeTruthy();
        expect(workflowStrip).not.toContain("drawerGateLoading");
        expect(workflowStrip).not.toContain("disabled={drawerGateLoading}");
    });
});
