import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Workspace V3 final polish freeze", () => {
    it("uses compact organization pulse band instead of dashboard command banner box", () => {
        const pulse = read("components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx");
        expect(pulse).toContain('data-workspace-org-pulse-band="true"');
        expect(pulse).toContain("Command Center");
        expect(pulse).toContain("Organization Pulse");
        expect(pulse).toContain('OipHealthStrip health={health} compact');
        expect(pulse).not.toContain("Workspace Health");
        expect(pulse).not.toContain("WS_COMMAND_BANNER_CLASS");
        expect(pulse).toContain("WorkspaceOperationalPulseStrip");
    });

    it("operational pulse renders as compact horizontal strip", () => {
        const strip = read("components/admin/workspace/layout/WorkspaceOperationalPulseStrip.tsx");
        expect(strip).toContain('data-workspace-operational-pulse-strip="true"');
        expect(strip).toContain('data-workspace-pulse-metric="true"');
        expect(strip).not.toContain('layout="command"');
        expect(strip).not.toContain("OipKpiObjectCard");
    });

    it("removes visible business processes heading from workspace root grid", () => {
        const shell = read("components/admin/workspace/WorkspaceRootShell.tsx");
        expect(shell).toContain('className="sr-only"');
        expect(shell).toContain("OPERATOR_BUSINESS_PROCESSES_LABEL");
        expect(shell).not.toMatch(/sectionKicker[\s\S]*OPERATOR_BUSINESS_PROCESSES_LABEL/);
    });

    it("sidebar removes visible business processes and work view group labels", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).not.toContain("adminv2-sidebar-section-label");
        expect(sidebar).not.toContain("Business Processes");
        expect(sidebar).not.toContain("WORK_VIEW_PILL_SECTION_LABEL");
        expect(sidebar).not.toContain("adminv2-sidebar-queue-group-label");
    });

    it("sidebar keeps processing aligned with primary navigation items", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toMatch(
            /{analyticsLink}[\s\S]*{processingLink}[\s\S]*{lifecycleNavExpanded}/,
        );
        expect(sidebar).toContain("SidebarProcessingNavItem");
        expect(sidebar).not.toContain("dispatchAdminV2OpenProcessingModal");
    });

    it("workspace root separates operational pulse from operational surfaces", () => {
        const shell = read("components/admin/workspace/WorkspaceRootShell.tsx");
        expect(shell).toContain("operationalSurfacesFromPulse");
    });

    it("operational surface work lines compose from configured work views", () => {
        const landing = read("lib/admin/enrollmentOperationalSurfaceLanding.ts");
        expect(landing).toContain("buildWorkLinesFromConfiguredWorkViews");
        expect(landing).toContain("resolveProcessWorkViews");
        expect(landing).not.toContain("ENROLLMENT_TODAYS_WORK_TEMPLATES");
    });

    it("preserves enrollment operational surface launcher without touching runtime shells", () => {
        const grid = read("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(grid).toContain("EnrollmentOperationalSurfaceTile");
        expect(grid).toContain('data-operational-surface-tile="enrollment"');

        const frozen = [
            "app/adminV2/components/workspace/blocks/QueueBlock.tsx",
            "components/admin/focusPanel/UniversalCard.tsx",
            "app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
        ];
        for (const path of frozen) {
            expect(read(path).length).toBeGreaterThan(0);
        }
    });
});
