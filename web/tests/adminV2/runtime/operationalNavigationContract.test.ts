/**
 * Operational Navigation Contract — static assertions.
 *
 * These tests verify the navigational ownership invariants documented in
 * docs/platform/experience/operational-navigation-contract.md.
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
// Skeleton chip pre-seeding — WU page cache written from workspace bootstrap
// ---------------------------------------------------------------------------

describe("Skeleton chips: workspace bootstrap pre-seeds WU page cache", () => {
    it("writeWorkUnitPageCache is imported and called in the dept bootstrap resolution path", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        // Must import writeWorkUnitPageCache from the session cache module
        expect(src).toContain("writeWorkUnitPageCache");
        // Must call it inside the dept bootstrap resolution block
        expect(src).toContain("writeWorkUnitPageCache(orgId, principalUserId, accessScopeFingerprint");
    });

    it("pre-seeding passes queue_definition from raw bootstrap work units", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        // queue_definition must be forwarded to the cache entry
        const seedBlock = src.slice(
            src.indexOf("writeWorkUnitPageCache(orgId"),
            src.indexOf("writeWorkUnitPageCache(orgId") + 600
        );
        expect(seedBlock).toContain("queue_definition: wu.queue_definition");
    });

    it("pre-seeding skips work units with no queue_definition — no empty cache writes", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        // Must guard: skip if queue_definition is absent
        const seedBlock = src.slice(
            src.indexOf("writeWorkUnitPageCache(orgId") - 300,
            src.indexOf("writeWorkUnitPageCache(orgId") + 200
        );
        expect(seedBlock).toContain("!wu.queue_definition");
    });

    it("CachedWorkUnitPage type accepts queue_definition — cache shape is compatible", () => {
        const cacheLib = read("lib/workspace/adminV2WorkspaceSessionCache.ts");
        // The CachedWorkUnitPage workUnit shape must include queue_definition
        expect(cacheLib).toContain("queue_definition");
        expect(cacheLib).toContain("writeWorkUnitPageCache");
    });
});

// ---------------------------------------------------------------------------
// Workspace root → Work Unit: cold shell avoided for root-page navigation
// ---------------------------------------------------------------------------

describe("Workspace root bootstrap pre-seeds WU page cache", () => {
    it("writeWorkUnitPageCache is imported in workspace root page", () => {
        const src = read("app/adminV2/workspace/page.tsx");
        expect(src).toContain("writeWorkUnitPageCache");
    });

    it("workspace root pre-seeds cache after WU fetch resolves", () => {
        const src = read("app/adminV2/workspace/page.tsx");
        // Must call writeWorkUnitPageCache with orgId and queue_definition guard
        expect(src).toContain("writeWorkUnitPageCache(orgId, principalUserId, accessScopeFingerprint");
        // Must guard: skip WUs without queue_definition
        const seedBlock = src.slice(
            src.indexOf("writeWorkUnitPageCache(orgId, principalUserId, accessScopeFingerprint") - 400,
            src.indexOf("writeWorkUnitPageCache(orgId, principalUserId, accessScopeFingerprint") + 400
        );
        expect(seedBlock).toContain("!wu.queue_definition");
    });

    it("workspace root passes dept identity to WU page cache", () => {
        const src = read("app/adminV2/workspace/page.tsx");
        const seedBlock = src.slice(
            src.indexOf("writeWorkUnitPageCache(orgId, principalUserId, accessScopeFingerprint"),
            src.indexOf("writeWorkUnitPageCache(orgId, principalUserId, accessScopeFingerprint") + 600
        );
        // dept shape: { id, name, key }
        expect(seedBlock).toContain("dept.id");
        expect(seedBlock).toContain("dept.name");
        // queue_definition forwarded from WU row
        expect(seedBlock).toContain("queue_definition: wu.queue_definition");
    });
});

// ---------------------------------------------------------------------------
// Canonical Route Cleanup — dept-scoped WU URL is NOT the live renderer
// ---------------------------------------------------------------------------

describe("Canonical route cleanup: /work-unit/[slug] is sole WU renderer", () => {
    it("WorkUnitSlugRouteHost renders AdminV2OpportunityWorkUnitPage — canonical renderer", () => {
        const src = read("components/admin/workspace/WorkUnitSlugRouteHost.tsx");
        // Must import from the dept-scoped page (component lives there) and render it
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

    it("LifecycleStageWorkspace uses operatorWorkUnitHrefFromKey — canonical WU URL", () => {
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
        // Legacy fallback still uses /admin/ (redirected) not /adminV2/ directly
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
