import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = join(root, "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Work Unit Layout Doctrine V2", () => {
    it("documents queue-first layout with telemetry summary banner", () => {
        const doc = readFileSync(join(webRoot, "../docs/system/work-unit-layout-doctrine.md"), "utf8");
        expect(doc).toContain("Zone 2 — Queue Workspace (primary)");
        expect(doc).toContain("Zone 3 — Workflow Telemetry Summary Banner");
        expect(doc).toContain("Zone 4 — Expanded Operational Intelligence");
        expect(doc).toContain("position: sticky");
    });

    it("targets visible row counts for queue workspace height", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toContain("--ws-wu-queue-visible-rows-target: 6");
        expect(css).toContain("--ws-wu-queue-intelligence-banner-reserve: 4.5rem");
        expect(css).toContain("--ws-wu-queue-records-scroll-height-cap: 640px");
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

    it("uses collapsible telemetry summary on work-unit pages", () => {
        const block = read("app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx");
        expect(block).toContain('presentation?: "full" | "work_unit_summary"');
        expect(block).toContain("adminv2-ws-automation-telemetry__summary-banner");
        expect(block).toContain('data-ws-automation-telemetry-expanded');

        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain('presentation="work_unit_summary"');
    });

    it("marks operational intelligence below queue in WorkUnitWorkspace", () => {
        const shell = read("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(shell).toContain('data-workspace-zone="operational-intelligence"');
        expect(shell).toContain("primaryFooterSlot");
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
