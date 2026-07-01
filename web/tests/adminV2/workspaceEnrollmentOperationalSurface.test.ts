import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Workspace Enrollment Operational Surface implementation guards", () => {
    it("WorkspaceRootLifecycleGrid wires enrollment-only OperationalSurfaceCover", () => {
        const grid = readSrc("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(grid).toContain("EnrollmentOperationalSurfaceTile");
        expect(grid).toContain("OperationalSurfaceCover");
        expect(grid).toContain("isEnrollmentLifecycleCard");
        expect(grid).toContain("ensureEnrollmentOperationalSurfaceCard");
        expect(grid).toContain('data-operational-surface-tile="enrollment"');
        expect(grid).toContain("LegacyProcessNavTile");
        expect(grid).toContain("Enter Enrollment →");
        expect(grid).not.toContain("isEnrollmentOperationalSurfaceProcess");
    });

    it("renders enrollment surface without requiring pre-enriched operationalStory gating", () => {
        const grid = readSrc("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(grid).toContain("if (isEnrollmentLifecycleCard(enrollmentCard))");
        expect(grid).not.toContain("&& lifecycle.operationalStory");
        expect(grid).not.toContain("todaysWork?.length ?? 0) > 0");
    });

    it("OperationalSurfaceWorkLine uses work_view navigation transition", () => {
        const line = readSrc("components/admin/workspace/OperationalSurfaceWorkLine.tsx");
        expect(line).toContain("runAdminV2NavigationTransition");
        expect(line).toContain('data-operational-surface-work-line=');
        expect(line).toContain("focus-visible:outline");
    });

    it("OperationalSurfaceCover focuses on story and Today's Work — not KPI grid", () => {
        const cover = readSrc("components/admin/workspace/OperationalSurfaceCover.tsx");
        expect(cover).toContain('data-operational-surface-todays-work="true"');
        expect(cover).not.toContain("operational-surface-kpi-strip");
    });

    it("does not modify frozen Work Unit / Queue / Focus Panel runtime files", () => {
        const shell = readSrc("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(shell).not.toContain("OperationalSurfaceCover");
        const queue = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(queue).not.toContain("OperationalSurface");
        const drawer = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(drawer).not.toContain("OperationalSurface");
    });

    it("load client invalidates stale cache missing enrollment hydration", () => {
        const client = readSrc("lib/admin/loadOperatorLifecycleLandingClient.ts");
        expect(client).toContain("enrollmentOperationalSurfaceNeedsHydration");
    });

    it("operational surface work lines compose from configured work views", () => {
        const landing = readSrc("lib/admin/enrollmentOperationalSurfaceLanding.ts");
        expect(landing).toContain("buildWorkLinesFromConfiguredWorkViews");
        expect(landing).toContain("resolveOperationalSurfaceWorkViews");
        expect(landing).not.toContain("ENROLLMENT_TODAYS_WORK_TEMPLATES");
    });
});
