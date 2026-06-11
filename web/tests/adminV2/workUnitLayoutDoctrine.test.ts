import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = join(root, "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Work Unit Layout Doctrine V3", () => {
    it("documents queue-first layout with telemetry as right rail utility", () => {
        const doc = readFileSync(join(webRoot, "../docs/system/work-unit-layout-doctrine.md"), "utf8");
        expect(doc).toContain("Canonical V3");
        expect(doc).toContain("Header");
        expect(doc).toContain("Queue");
        expect(doc).toContain("Right rail utilities (Actions → Telemetry → BOS)");
        expect(doc).toContain("presentation=\"work_unit_rail\"");
        expect(doc).toContain("reduce, shrink, or move BOS");
        expect(doc).toContain("Nothing appears below the queue");
        expect(doc).not.toContain("Zone 3 — Workflow Telemetry Summary Banner");
    });

    it("targets 5–7 visible queue rows with compact work-unit row stack", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toContain("--ws-wu-queue-visible-rows-target: 5");
        expect(css).toContain("--ws-wu-queue-row-min-height: 43px");
        expect(css).toContain("--ws-wu-queue-records-scroll-top-offset: 14rem");
        expect(css).not.toContain("--ws-wu-queue-intelligence-banner-reserve");
    });

    it("enables queue density experiment pass-1 with spacing-only compact tokens", () => {
        const shell = read("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        const layout = read("components/admin/workspace/WorkspaceShellLayout.tsx");
        const css = read("app/adminV2/components/workspace/workspace.css");

        expect(shell).toContain('workUnitQueueDensity="pass-1"');
        expect(layout).toContain('workUnitQueueDensity?: "pass-1"');
        expect(layout).toContain('"data-ws-wu-queue-density": workUnitQueueDensity');
        expect(css).toContain('[data-ws-wu-queue-density="pass-1"]');
        expect(css).toContain("--ws-wu-queue-row-min-height: 37px");
        expect(css).toMatch(
            /\[data-ws-wu-queue-density="pass-1"\][\s\S]*--ws-wu-queue-visible-rows-target:\s*6/,
        );
    });

    it("reclaims horizontal queue width and standardizes neutral queue icons on work-unit surfaces", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        const adminCss = read("app/adminV2/adminV2.css");
        const doc = readFileSync(join(webRoot, "../docs/system/work-unit-layout-doctrine.md"), "utf8");

        expect(css).toContain("--ws-wu-contain-padding-inline-end: 0px");
        expect(css).toContain("--ws-wu-workbench-gutter: 14px");
        expect(css).toContain("--ws-wu-queue-icon-primary-size: 16px");
        expect(css).toContain("--ws-wu-queue-icon-secondary-size: 14px");
        expect(css).toContain("Work unit queue — icon + metadata color doctrine");
        expect(adminCss).toContain(
            '.adminv2-workspace-scroll-surface:has([data-ws-surface="work_unit"].adminv2-ws-wu-v2)',
        );
        expect(doc).toContain("Horizontal layout polish");
        expect(doc).toContain("Queue record icon + color doctrine");
        expect(doc).toContain("Pine/green is **not** a default person/contact accent");
    });

    it("keeps queue records in a scroll-owned viewport that fills the rail-aligned lane", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        const scrollShellRule = css.match(
            /\[data-ws-surface="work_unit"\]\.adminv2-ws-work-unit\.adminv2-ws-wu-v2 \.adminv2-ws-wu-queue-list-shell\s*\{[^}]+\}/,
        )?.[0];
        expect(scrollShellRule).toBeDefined();
        expect(scrollShellRule).toContain("overflow-y: auto");
        expect(scrollShellRule).toContain("flex: 1 1 0");
        expect(scrollShellRule).toContain("min-height: 0");
        expect(scrollShellRule).toContain("overscroll-behavior: contain");
        expect(scrollShellRule).toContain("touch-action: pan-y");
        expect(css).toContain("height: var(--adminv2-workspace-rail-height");
        expect(css).toContain("grid-template-rows: minmax(0, 1fr)");
        expect(css).toMatch(
            /adminv2-ws-wu-queue-list-shell[\s\S]*?height:\s*0/,
        );
        expect(css).toContain(".adminv2-workspace-scroll-surface:has([data-ws-surface=\"work_unit\"]");
    });

    it("uses single-row Actions-matching telemetry trigger with activity count", () => {
        const block = read("app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx");
        expect(block).toContain("WorkUnitRailTelemetryBlock");
        expect(block).toContain("workflowTelemetryActivityCount");
        expect(block).toContain("Workflow Telemetry{activityCountLabel}");
        expect(block).toContain("adminv2-ws-command-rail-telemetry-attention-badge");
        expect(block).toContain("adminv2-ws-command-rail-telemetry-section");
        expect(block).toContain("adminv2-ws-command-rail-actions-trigger");
        expect(block).toContain("Recent Workflow Activity");
        expect(block).toContain("Workflow Diagnostics");
        expect(block).not.toContain("adminv2-ws-command-rail-telemetry-trigger-summary");
        expect(block).not.toContain("adminv2-ws-automation-telemetry__rail-stats");

        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain('presentation="work_unit_rail"');
        expect(page).toContain("onWorkflowDiagnostics={openWorkflowDiagnostics}");
    });

    it("does not render analytics dashboards in work-unit rail expand", () => {
        const block = read("app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx");
        const start = block.indexOf("function WorkUnitRailTelemetryBlock");
        const end = block.indexOf("export function AutomationWorkflowsBlock");
        const railBlock = block.slice(start, end);
        expect(railBlock).not.toContain("adminv2-ws-automation-telemetry__groups");
        expect(railBlock).not.toContain("Throughput");
        expect(railBlock).not.toContain("Reliability");
    });

    it("mounts telemetry in command rail shell between actions and BOS", () => {
        const railShell = read("app/adminV2/components/workspace/WorkspaceCommandRailShell.tsx");
        expect(railShell).toContain("data-command-rail-telemetry");
        expect(railShell).toContain("adminv2-ws-command-rail-bos-host");

        const shell = read("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(shell).toContain("commandRailTelemetrySlot");
        expect(shell).not.toContain("primaryFooterSlot");
    });

    it("preserves BOS host min-height on work-unit surfaces", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toMatch(/adminv2-ws-command-rail-bos-host[\s\S]*min-height:\s*14rem/);
    });

    it("routes all work-unit pages through WorkUnitWorkspace shell", () => {
        const deptWuPage = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(deptWuPage).toContain("<WorkUnitWorkspace");
        const slugHost = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        expect(slugHost).toContain("AdminV2OpportunityWorkUnitPage");
    });
});
