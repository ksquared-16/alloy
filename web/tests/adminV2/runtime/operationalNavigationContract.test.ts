/**
 * Canonical Route Contract — static assertions.
 *
 * Verifies that no production code constructs legacy dept-scoped Work Unit URLs
 * or legacy /admin/settings/... / /adminV2/settings/... URLs. All internal
 * navigation must use the three canonical routes:
 *   /workspace       →  Workspace root
 *   /work-unit/[slug]  →  Work Unit surface
 *   /settings/...    →  Settings
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

// ---------------------------------------------------------------------------
// Canonical Route Cleanup — dept-scoped WU URL is NOT the live renderer
// ---------------------------------------------------------------------------

describe("Canonical route cleanup: /work-unit/[slug] is sole WU renderer", () => {
    it("WorkUnitSlugRouteHost renders AdminV2OpportunityWorkUnitPage — canonical renderer", () => {
        const src = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        expect(src).toContain("AdminV2OpportunityWorkUnitPage");
        expect(src).toContain("<AdminV2OpportunityWorkUnitPage");
    });

    it("next.config.ts redirects /admin/workspace/dept/:deptId/work-unit/:wuId away from the live surface", () => {
        const config = read("next.config.ts");
        expect(config).toContain("/admin/workspace/dept/:deptId/work-unit/:wuId");
        expect(config).toContain('destination: "/workspace"');
    });

    it("next.config.ts redirects /adminV2/workspace/dept/:deptId/work-unit/:wuId away from the live surface", () => {
        const config = read("next.config.ts");
        expect(config).toContain("/adminV2/workspace/dept/:deptId/work-unit/:wuId");
    });

    it("LifecycleStageWorkspace uses operatorWorkUnitHrefFromKey — no legacy dept URL", () => {
        const src = read(
            "components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx"
        );
        expect(src).toContain("operatorWorkUnitHrefFromKey");
        expect(src).not.toContain("/adminV2/workspace/dept/");
    });

    it("LifecycleStagePerspectivesEditor passes workUnitKey to buildOperationalViewPreviewRuntimeHref", () => {
        const src = read(
            "components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx"
        );
        expect(src).toContain("workUnitKey");
    });

    it("buildOperationalViewPreviewRuntimeHref uses canonical slug URL when workUnitKey is present", () => {
        const src = read(
            "lib/adminV2/runtime/perspective/mergeOperationalViewMetadata.ts"
        );
        expect(src).toContain("operatorWorkUnitHrefFromKey");
        expect(src).toContain("workUnitKey");
        expect(src).not.toContain("/adminV2/workspace/dept/");
    });

    it("resolveWorkUnitWorkspaceHref accepts workUnitKey and uses canonical slug URL", () => {
        const src = read("lib/forms/intakeRuntimeOrchestrationPresentation.ts");
        expect(src).toContain("operatorWorkUnitHrefFromKey");
        expect(src).toContain("workUnitKey");
        expect(src).not.toContain("/adminV2/workspace/dept/");
    });

    it("canonical WU slug layout delegates to WorkUnitSlugRouteHost — no direct WU render", () => {
        const layout = read("app/adminV2/workspace/work-unit/[workUnitSlug]/layout.tsx");
        expect(layout).toContain("WorkUnitSlugRouteHost");
    });

    it("canonical WU slug page returns null — layout owns the render", () => {
        const page = read("app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx");
        expect(page).toContain("null");
        expect(page).not.toContain("AdminV2OpportunityWorkUnitPage");
    });
});

// ---------------------------------------------------------------------------
// No legacy workspace URL constants in production builders
// ---------------------------------------------------------------------------

describe("Workspace URL constants use canonical /workspace path", () => {
    it("drillResolver uses /workspace as default base path — not /adminV2/workspace", () => {
        const src = read("lib/analytics/runtime/drillResolver.ts");
        expect(src).not.toContain('DEFAULT_WORKSPACE_BASE_PATH = "/adminV2/workspace"');
    });

    it("operationalSurface uses /workspace as landing href — not /adminV2/workspace", () => {
        const src = read("lib/analytics/runtime/operationalSurface.ts");
        expect(src).not.toContain('WORKSPACE_LANDING_HREF = "/adminV2/workspace"');
    });

    it("lifecycleRuntimeIdentity workspaceDeptHref does not build /adminV2/workspace/dept/ URL", () => {
        const src = read("lib/lifecycle/lifecycleRuntimeIdentity.ts");
        expect(src).not.toContain("`/adminV2/workspace/dept/");
    });
});

// ---------------------------------------------------------------------------
// No legacy settings URLs in production link builders
// ---------------------------------------------------------------------------

describe("Settings links use canonical /settings/... path", () => {
    it("stageStatusRollup uses /settings/statuses not /admin/settings/statuses", () => {
        const src = read("lib/lifecycle/stageStatusRollup.ts");
        expect(src).toContain("/settings/statuses");
        expect(src).not.toContain("/admin/settings/statuses");
    });

    it("bosExecutionReceipt does not link to /admin/settings/layouts", () => {
        const src = read("lib/adminV2/bos/bosExecutionReceipt.ts");
        expect(src).not.toContain("/admin/settings/layouts");
    });

    it("configLayoutAssistEntityResolve uses /settings/config-proposals — not legacy paths", () => {
        const src = read("lib/agent/configLayoutAssist/configLayoutAssistEntityResolve.ts");
        expect(src).toContain("/settings/config-proposals");
        expect(src).not.toContain("/admin/settings/config-proposals");
        expect(src).not.toContain("/adminV2/settings/config-proposals");
    });

    it("layoutSectionOperatorUi uses /settings/actions not legacy paths", () => {
        const src = read("lib/adminV2/layouts/layoutSectionOperatorUi.ts");
        expect(src).not.toContain("/admin/settings/actions");
        expect(src).not.toContain("/adminV2/settings/actions");
    });

    it("layoutIntegrityPresentation uses /settings/ paths for all fix links", () => {
        const src = read("lib/config/layoutIntegrityPresentation.ts");
        expect(src).not.toContain("/admin/settings/");
        expect(src).not.toContain("/adminV2/settings/");
    });

    it("enrollmentPlacementDoctrine uses /settings/locations not legacy path", () => {
        const src = read("lib/fields/enrollmentPlacementDoctrine.ts");
        expect(src).toContain("/settings/locations");
        expect(src).not.toContain("/admin/settings/locations");
    });

    it("OpportunityDrawerLayoutRuntimeBodyStatus uses /settings/surfaces not /adminV2/settings/layouts", () => {
        const src = read("components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyStatus.tsx");
        expect(src).toContain("/settings/surfaces");
        expect(src).not.toContain("/adminV2/settings/layouts");
    });

    it("LifecycleHubClient uses /settings/ paths for manage hrefs — not /admin/settings/", () => {
        const src = read("components/adminV2/settings/LifecycleHubClient.tsx");
        expect(src).not.toContain('manageHref: "/admin/settings/');
    });

    it("LifecycleStatusesCard default prop uses /settings/statuses", () => {
        const src = read("components/adminV2/settings/lifecycle/LifecycleStatusesCard.tsx");
        expect(src).toContain("/settings/statuses");
        expect(src).not.toContain("/admin/settings/statuses");
    });

    it("WU page uses /settings/work-units not /admin/settings/work-units", () => {
        const src = read(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
        );
        expect(src).not.toContain("/admin/settings/work-units");
    });

    it("AnalyticsWorkspacePanel navigates to /settings/calculations not /admin/settings/analytics", () => {
        const src = read("app/adminV2/analytics/AnalyticsWorkspacePanel.tsx");
        expect(src).toContain("/settings/calculations");
        expect(src).not.toContain("/admin/settings/analytics");
    });
});
