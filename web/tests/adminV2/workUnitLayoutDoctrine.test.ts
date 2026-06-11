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
    it("documents queue-first layout with telemetry in command rail", () => {
        const doc = readFileSync(join(webRoot, "../docs/system/work-unit-layout-doctrine.md"), "utf8");
        expect(doc).toContain("Canonical V3");
        expect(doc).toContain("Zone 2 — Queue Workspace (primary)");
        expect(doc).toContain("Zone 3 — Command Rail (Actions → Telemetry → BOS)");
        expect(doc).toContain("presentation=\"work_unit_rail\"");
        expect(doc).toContain("position: sticky");
        expect(doc).not.toContain("Zone 3 — Workflow Telemetry Summary Banner");
    });

    it("targets visible row counts for queue workspace height without banner reserve", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toContain("--ws-wu-queue-visible-rows-target: 7");
        expect(css).toContain("--ws-wu-queue-records-scroll-height-cap: 680px");
        expect(css).not.toContain("--ws-wu-queue-intelligence-banner-reserve");
        expect(css).not.toContain("--ws-wu-queue-viewport-height-ratio");
        expect(css).not.toContain("--ws-wu-queue-intelligence-peek-reserve");
    });

    it("keeps queue records in an independently scrolling shell", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        const scrollShellRule = css.match(
            /\[data-ws-surface="work_unit"\]\.adminv2-ws-work-unit\.adminv2-ws-wu-v2 \.adminv2-ws-wu-queue-list-shell\s*\{[^}]+\}/,
        )?.[0];
        expect(scrollShellRule).toBeDefined();
        expect(scrollShellRule).toContain("max-height: var(--ws-wu-queue-records-scroll-max-height)");
        expect(scrollShellRule).toContain("overflow-y: auto");
    });

    it("uses collapsible telemetry card in work-unit command rail", () => {
        const block = read("app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx");
        expect(block).toContain('presentation?: "full" | "work_unit_summary" | "work_unit_rail"');
        expect(block).toContain("adminv2-ws-automation-telemetry__rail-header");
        expect(block).toContain('data-ws-automation-telemetry-expanded');

        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain('presentation="work_unit_rail"');
        expect(page).toContain("commandRailTelemetrySlot");
    });

    it("mounts telemetry in command rail shell between actions and BOS", () => {
        const railShell = read("app/adminV2/components/workspace/WorkspaceCommandRailShell.tsx");
        expect(railShell).toContain("data-command-rail-telemetry");
        expect(railShell).toContain("adminv2-ws-command-rail-telemetry");
        expect(railShell).toContain("adminv2-ws-command-rail-bos-host");

        const layout = read("components/admin/workspace/WorkspaceShellLayout.tsx");
        expect(layout).toContain("commandRailTelemetrySlot");

        const shell = read("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(shell).toContain("commandRailTelemetrySlot");
        expect(shell).not.toContain("primaryFooterSlot");
        expect(shell).not.toContain('data-workspace-zone="operational-intelligence"');
    });

    it("styles rail telemetry with internal scroll and preserves BOS host min-height", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toContain(".adminv2-ws-automation-telemetry--work-unit-rail");
        expect(css).toContain(".adminv2-ws-automation-telemetry__rail-details");
        expect(css).toMatch(/adminv2-ws-command-rail-bos-host[\s\S]*min-height:\s*14rem/);
    });

    it("pins BOS command rail while primary column scrolls", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).toMatch(/\[data-adminv2-workspace-command-column\][\s\S]*?position:\s*sticky/);
    });

    it("routes all work-unit pages through WorkUnitWorkspace shell", () => {
        const deptWuPage = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(deptWuPage).toContain("<WorkUnitWorkspace");
        const slugHost = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        expect(slugHost).toContain("AdminV2OpportunityWorkUnitPage");
    });
});
