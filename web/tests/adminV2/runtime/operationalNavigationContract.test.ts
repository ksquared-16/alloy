/**
 * Operational Navigation Contract — static assertions.
 *
 * These tests verify the navigational ownership invariants documented in
 * docs/platform/experience/operational-navigation-contract.md.
 *
 * Also enforces the Canonical Route Cleanup sprint invariants: no production
 * code constructs legacy dept-scoped Work Unit URLs or legacy /admin/settings/...
 * / /adminV2/settings/... paths.
 *
 * Tests are purely static (file reads) — no DOM, no fetch mocks.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

// ---------------------------------------------------------------------------
// Workspace tile → Work Unit: soft nav (OS-like transition)
// ---------------------------------------------------------------------------

describe("Workspace → Work Unit: soft navigation contract", () => {
    it("DeptOperConsoleQueueRow uses router.push — no window.location.assign", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        // The tile click should use router.push, not hard nav
        expect(src).toContain("router.push(prepared)");
        // Hard nav must NOT be called from the tile click handler
        const commitSoftNavBlock = src.slice(
            src.indexOf("const commitSoftNav"),
            src.indexOf("return (") // next anchor after commitSoftNav
        );
        expect(commitSoftNavBlock).not.toContain("window.location.assign");
        expect(commitSoftNavBlock).not.toContain("adminV2CommitNavigation");
    });

    it("prewarm fires on pointer-down — before nav commits", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        // onPointerDown must fire the prewarm
        expect(src).toContain("warmWorkUnitBootstrapFromDeptOperHref(href, departmentId, selectedSiteId)");
        // The pointer-down prewarm must appear before the onClick handler
        const pointerDownIdx = src.indexOf("onPointerDown={(e)");
        const onClickIdx = src.indexOf("onClick={(e)");
        expect(pointerDownIdx).toBeGreaterThan(0);
        expect(pointerDownIdx).toBeLessThan(onClickIdx);
    });

    it("tile press-ack cleared on unmount — no stale nav-pending state after soft nav", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        // clearDeptOperNavClickAck must be called in a cleanup (unmount) effect
        expect(src).toContain("isDeptOperNavClickPending(clickedKey)");
        expect(src).toContain("clearDeptOperNavClickAck()");
        // The cleanup must be inside a useEffect return
        const effectBlock = src.slice(
            src.indexOf("isDeptOperNavClickPending(clickedKey)") - 50,
            src.indexOf("isDeptOperNavClickPending(clickedKey)") + 200
        );
        expect(effectBlock).toContain("return () =>");
    });

    it("adminV2PrepareNavHref is used for URL preparation — same site-filter logic as hard nav", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toContain("adminV2PrepareNavHref(href");
    });

    it("adminV2BeforeRouteNavigation still fires — perf marker and drawer close preserved", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toContain("adminV2BeforeRouteNavigation({ closeDrawer: adminDrawer?.closeDrawer })");
    });

    it("shellNavigation adminV2PrepareNavHref extracts URL prep without navigating", () => {
        const src = read("lib/adminV2/shellNavigation.ts");
        expect(src).toContain("export function adminV2PrepareNavHref(");
        // Must return the prepared href, not call window.location.assign
        const fnBlock = src.slice(
            src.indexOf("export function adminV2PrepareNavHref("),
            src.indexOf("export function adminV2CommitNavigation(")
        );
        expect(fnBlock).not.toContain("window.location.assign");
        expect(fnBlock).toContain("return next");
    });

    it("adminV2CommitNavigation delegates to adminV2PrepareNavHref — no duplicated logic", () => {
        const src = read("lib/adminV2/shellNavigation.ts");
        const commitFn = src.slice(
            src.indexOf("export function adminV2CommitNavigation("),
            src.indexOf("\nexport function", src.indexOf("export function adminV2CommitNavigation(") + 10) || undefined
        );
        // Hard nav now calls adminV2PrepareNavHref instead of re-doing URL prep inline
        expect(commitFn).toContain("adminV2PrepareNavHref(href");
        expect(commitFn).toContain("window.location.assign(next)");
    });
});

// ---------------------------------------------------------------------------
// Work Unit loading.tsx — transparent, workspace acts as loading state
// ---------------------------------------------------------------------------

describe("Work Unit loading.tsx — null (workspace is loading state)", () => {
    it("work-unit loading.tsx returns null — no segment-level skeleton", () => {
        const src = read(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/loading.tsx"
        );
        // The segment loading state is null — workspace page acts as the loading state during soft nav
        expect(src).toContain("return null;");
        expect(src).not.toContain("<WorkUnitWorkspaceColdShell");
        expect(src).not.toContain("skeleton");
    });
});

// ---------------------------------------------------------------------------
// Focus Panel: queue stays stable, no cold shell during open/close
// ---------------------------------------------------------------------------

describe("Work Unit → Focus Panel: in-page transition, queue always mounted", () => {
    it("openWorkUnitQueueRecord fires prewarm before openDrawer", () => {
        const page = read(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
        );
        // cancelBackgroundDrawerVmPrewarm must precede openDrawer in the function body
        const fnBlock = page.slice(
            page.indexOf("function openWorkUnitQueueRecord") ||
                page.indexOf("openWorkUnitQueueRecord"),
            page.indexOf("openWorkUnitQueueRecord") + 5000
        );
        const cancelIdx = fnBlock.indexOf("cancelBackgroundDrawerVmPrewarm");
        const openDrawerIdx = fnBlock.indexOf("openDrawer(");
        expect(cancelIdx).toBeGreaterThan(-1);
        expect(openDrawerIdx).toBeGreaterThan(cancelIdx);
    });

    it("Focus Panel open does not reload the Work Unit page — openDrawer is in-page", () => {
        const page = read(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
        );
        // openDrawer must be called, not router.push or window.location for queue row open
        expect(page).toContain("openDrawer(openParams");
        // No location.assign in the queue row open path
        const openBlock = page.slice(
            page.indexOf("openWorkUnitQueueRecord") || 0,
            page.indexOf("openWorkUnitQueueRecord") + 8000
        );
        expect(openBlock).not.toContain("window.location.assign");
    });

    it("drawer close does not remount Work Unit page — closeDrawer clears state in-place", () => {
        const drawerCtx = read("contexts/AdminDrawerContext.tsx");
        // closeDrawer must clear drawer state (not navigate)
        expect(drawerCtx).toContain("closeDrawer");
        // closeDrawer must NOT call router.push or window.location
        const closeFn = drawerCtx.slice(
            drawerCtx.indexOf("closeDrawer"),
            drawerCtx.indexOf("closeDrawer") + 1500
        );
        expect(closeFn).not.toContain("window.location.assign");
        expect(closeFn).not.toContain("router.push");
    });
});

// ---------------------------------------------------------------------------
// Settings exclusion — hard nav preserved for non-operational routes
// ---------------------------------------------------------------------------

describe("Settings routes: excluded from OS nav contract", () => {
    it("adminV2CommitNavigation still exported and used for non-workspace navigation", () => {
        const shell = read("lib/adminV2/shellNavigation.ts");
        expect(shell).toContain("export function adminV2CommitNavigation(");
        expect(shell).toContain("window.location.assign(next)");
    });

    it("adminV2SoftSidebarNavEnabled excludes non-workspace paths", () => {
        const shell = read("lib/adminV2/shellNavigation.ts");
        expect(shell).toContain("isAdminV2SoftNavEligibleHref");
        // Settings routes must not be classified as soft-nav eligible
        expect(shell).toContain("isOperatorWorkspacePath");
    });
});

// ---------------------------------------------------------------------------
// Reduced-motion — token-level, not per-component
// ---------------------------------------------------------------------------

describe("Reduced-motion: opacity crossfade only, no per-component override", () => {
    it("globals.css collapses motion choreography to opacity at prefers-reduced-motion", () => {
        const css = read("app/globals.css");
        expect(css).toContain("prefers-reduced-motion");
        // Should collapse translate/scale to 0 or remove it
        const reducedBlock = css.slice(css.indexOf("prefers-reduced-motion"));
        expect(reducedBlock).toMatch(/animation.*1ms|transition.*1ms|animation-duration.*1ms/);
    });

    it("alloyOsRuntime.css respects reduced-motion for Focus Panel transitions", () => {
        const css = read("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain("prefers-reduced-motion");
    });
});

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
