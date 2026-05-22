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

describe("Dept paired oper loading alignment", () => {
    it("legacy row skeleton keeps matched row count for throughput and attention", () => {
        expect(DEPT_PAIRED_OPER_QUEUE_SKELETON_ROW_COUNT).toBe(5);
        const src = read("components/admin/workspace/DepartmentPairedOperQueuesSkeleton.tsx");
        expect(src).toContain('variant="throughput"');
        expect(src).toContain('variant="attention"');
        expect((src.match(/count=\{rowCount\}/g) ?? []).length).toBe(2);
        expect(src).toContain("DeptPairedOperQuietReserve");
    });

    it("route cold shell uses bridge shell with oper-region loader (PR-4.6+)", () => {
        const cold = read("components/admin/workspace/DepartmentWorkspaceColdShell.tsx");
        expect(cold).toContain("DepartmentWorkspaceBridgeShell");
        expect(cold).toContain("DeptOperationalRegionLoader");
        expect(cold).toContain("WorkspaceQuietKpiReserve");
        expect(cold).not.toContain("AdminV2RouteLoadingState");
        expect(cold).not.toContain("DeptPairedOperQueuesSkeleton");
    });
});

describe("Work-unit KPI and queue picker loading", () => {
    it("defers KPI strip placeholder until queue reveal is ready", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(src).toContain("workUnitKpiMetricsPending");
        expect(src).toContain("workUnitQueueRevealReady");
        expect(src).toMatch(/kpiStripPlaceholder=\{workUnitKpiStripPlaceholder/);
    });

    it("queue tab count pending uses skeleton pulse, not spinners", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(src).toMatch(/countBadgePending[\s\S]*?skeleton-pulse/);
        expect(src).not.toMatch(/countBadgePending[\s\S]*?animate-spin/);
    });
});

describe("Opportunity drawer above-fold layout stability", () => {
    it("locks summary grid and defers secondary reveal until below-fold", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityDrawerAboveFoldLocked");
        expect(src).toContain("stabilizeOpportunityWorkflowOverviewSections");
        expect(src).toContain("opportunityDrawerBelowFoldEnrichmentReady");
        expect(src).toContain("OPPORTUNITY_DRAWER_BELOW_FOLD_SCROLL_PX");
        expect(src).toContain("overflow-anchor-none");
    });

    it("uses bootstrap shell contract for frozen overview sections (P1-2)", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityDrawerShellContract");
        expect(src).toContain("data-shell-slot");
        expect(src).toContain("data-opportunity-drawer-shell-contract");
    });
});

describe("Deferred opportunity drawer open (first-paint gate)", () => {
    it("does not mount drawer until bootstrap + primary; external overlay only", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("setOpeningOpportunity");
        expect(ctx).toContain("type: null, id: null");
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("!isOpportunityDrawerOpening");
        expect(drawer).toContain("consumeOpportunityDrawerPreload");
        const overlay = read("components/admin/OpportunityDrawerOpeningOverlay.tsx");
        expect(overlay).toContain("Opening record");
        expect(overlay).not.toContain("data-adminv2-drawer");
    });

    it("does not force a 1500ms wait before commit", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).not.toContain("1500");
        expect(lib).toContain("OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS");
    });
});

describe("Drawer opportunity header grouped loading", () => {
    it("keeps workflow header chrome in skeleton until coordinated reveal", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toMatch(
            /opportunityWorkflowHeaderChromePending[\s\S]*?!opportunityDrawerCoordinatedRevealReady/,
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

    it("uses centered drawer loading state until coordinated reveal", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("DrawerOpportunityOperationalLoadingComposition");
        expect(src).toContain("AdminV2DrawerLoadingState");
        expect(src).toContain('tone="record"');
        expect(src).toMatch(
            /opportunityDrawerPrimaryLoadingVisible[\s\S]*DrawerOpportunityOperationalLoadingComposition/,
        );
    });

    it("WU route skeleton uses dept-like queue cards and corner status chip", () => {
        const src = read("components/admin/workspace/workspaceRouteSkeletons.tsx");
        expect(src).toContain("QueueCardSkeleton");
        expect(src).toContain("WorkUnitOperLaneStatusChip");
        expect(src).toContain("adminv2-ws-dept-qsec");
        expect(src).toContain("adminv2-ws-work-unit-route-loading");
        expect(src).not.toContain("WorkUnitOperLaneSpinner");
    });

    it("WU route loading applies subtle pine accent in workspace css", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toContain("adminv2-ws-work-unit-route-loading");
        expect(css).toMatch(/border-left:[\s\S]*?var\(--d-pine\)/);
    });

    it("uses section-shaped bootstrap body and title-rail action reserves when queue preview is active", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("DrawerOpportunityQueueBootstrapBodySkeleton");
        expect(src).toContain("opportunityTitleRailActive");
        expect(src).toContain("DrawerWorkflowHeaderQuickActionsSkeleton");
        expect(src).not.toMatch(
            /opportunityWorkflowHeaderUsesQueuePreview[\s\S]*?min-h-\[2\.375rem\][\s\S]*?aria-hidden/,
        );
    });
});

describe("Dept operational panel render-state", () => {
    it("locks throughput presentation before reveal (no live pipeline vs WU swap)", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toContain("deptThroughputPresentation");
        expect(src).toContain("DeptThroughputPresentation");
        expect(src).toContain("deptOperPanelTitleLocked");
        expect(src).toMatch(/showPipelineLanes = deptThroughputPresentation === "pipeline_lanes"/);
        expect(src).toMatch(/showWuThroughputRows = deptThroughputPresentation === "wu_summaries"/);
        expect(src).not.toMatch(
            /showWuThroughputRows[\s\S]*?!deptExpectsPipelineLanes/,
        );
    });

    it("gates paired oper region only; shell/KPI/rail render under split readiness (PR-4.6+)", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toContain("deptShellReady");
        expect(src).toContain("deptTopSummaryReady");
        expect(src).toContain("deptRailReady");
        expect(src).toContain("deptOperationalRegionReady");
        expect(src).toContain("deptPipelineProbeSettled");
        expect(src).toContain("DeptOperationalRegionLoader");
        expect(src).not.toContain("deptPageOperationalReady");
        expect(src).not.toContain("AdminV2RouteLoadingState");
        expect(src).not.toContain("DeptPairedOperQuietReserve");
        expect(src).not.toContain("totalPending=");
        expect(src).toMatch(/deptShellReady \? \([\s\S]*?DepartmentWorkspaceBridgeShell/);
        expect(src).toMatch(
            /deptOperationalRegionReady \? \([\s\S]*?throughputPairedPanels[\s\S]*?DeptOperationalRegionLoader/,
        );
        expect(src).toMatch(/enrollment_pipeline/);
        expect(src).toMatch(/canUpgradeToPipeline/);
        expect(src).toMatch(/setDeptPipelineExecLoading\(true\)/);
        expect(src).toMatch(/deptThroughputWuRows\.map/);
        expect(src).toMatch(/deptAttentionBuckets !== null[\s\S]*?No Needs Attention types configured/);
    });

    it("does not soft-reveal enrollment actions rail on dept page", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toContain("deptRailReady");
        expect(src).not.toMatch(
            /railSlot[\s\S]*?adminv2-ws-soft-content-reveal[\s\S]*?ActionsBlock/,
        );
    });

    it("legacy path parallelizes summaries with dept/wu; single attention fetch after WU list (Card 5)", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toContain("summariesFetchPromise");
        expect(src).not.toMatch(/void fetchDeptAttentionPreview\(cacheNaWuId\)/);
        expect(src).toMatch(
            /legacy fan-out[\s\S]*summariesFetchPromise[\s\S]*Promise\.all\(\[[\s\S]*?deptRoute/,
        );
        expect(src).toMatch(/void fetchDeptAttentionPreview\(naWuId\)/);
        expect(src).toMatch(/if \(!deptOperationalRegionReady\) return/);
        const operReadyGate =
            src.match(/const deptOperationalRegionReady = useMemo\([\s\S]*?\]\);/)?.[0] ?? "";
        expect(operReadyGate).not.toContain("deptKpiPlacementPending");
        expect(operReadyGate).not.toContain("deptRailReady");
        expect(operReadyGate).not.toContain("enrollmentDeptRightRail");
        expect(operReadyGate).not.toContain("workflowKpis");
    });

    it("defers right-rail actions until oper region is ready", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toMatch(
            /fetchWorkspaceRightRailResolvedActions[\s\S]*?deptOperationalRegionReady/,
        );
    });
});

describe("Work-unit early action rail", () => {
    it("fetches right-rail actions in parallel with work-unit bootstrap", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(src).toContain("rightRailP");
        expect(src).toMatch(/Promise\.all\(\[wuP, deptP, rightRailP\]\)/);
        expect(src).toContain("setEnrollmentRightRailResolved");
    });
});

describe("Work-unit queue-first loading coherence", () => {
    it("uses shell-first cold shell + oper-lane loader; defers KPI/automation", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(src).toContain("workUnitQueueRevealReady");
        expect(src).toContain("WorkUnitWorkspaceColdShell");
        expect(src).not.toContain("WorkUnitRouteSkeletonBody");
        expect(src).toContain("operLaneLoading={workUnitOperLanePending}");
        expect(src).toMatch(
            /workUnitKpiStripPlaceholder = workUnitQueueRevealReady && workUnitKpiMetricsPending/,
        );
        expect(src).toMatch(/primaryFooterSlot=\{[\s\S]*?workUnitQueueRevealReady/);
        expect(src).not.toContain("wu-blocking-kpi-skeleton");
    });

    it("keeps oper lane in-region until bootstrap authority (no stale rows on nav)", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(src).toContain("workUnitOperLanePending");
        expect(src).toMatch(/workUnitPageBlockingLoad = loading && !workUnitShellReady/);
        expect(src).toMatch(/readWorkUnitPageCache[\s\S]{0,600}setLoading\(false\)/);
        expect(src).toMatch(/if \(!seededWorkUnitShellRef\.current\) \{\s*setLoading\(true\)/);
    });
});

describe("Drawer operational bootstrap (Cards 4–7)", () => {
    it("uses drawer-operational-bootstrap on AdminV2 opportunity happy path", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("fetchOpportunityDrawerOperationalBootstrap");
        expect(src).toContain("applyOpportunityBootstrap");
        expect(src).toContain("runLegacyEntityFetch");
        expect(src).toContain("adminV2DrawerBootstrapEnabled()");
    });

    it("coordinates overview reveal with drawer_primary before paint", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityDrawerCoordinatedRevealReady");
        expect(src).toContain("opportunityDrawerPrimaryLoadingVisible");
        expect(src).toContain("ADMINV2_OPPORTUNITY_DRAWER_REVEAL_COORD_MAX_MS");
        expect(src).toContain("runOpportunityPrimaryHydrate");
        expect(src).toContain("drawer_primary");
        expect(src).toContain("opportunityPrimaryHydrateApplied");
        expect(src).toMatch(
            /opportunityDrawerOverviewRevealReady = opportunityDrawerCoordinatedRevealReady/,
        );
        expect(src).toMatch(
            /opportunityRecordHydrationPending[\s\S]*runOpportunityPrimaryHydrate/,
        );
        expect(src).toMatch(
            /scheduleAdminV2BackgroundWork[\s\S]*runOpportunityBackgroundFullHydrate/,
        );
    });

    it("keeps inquiry drawer header calm until reveal (no queue/oper subtext)", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityDrawerHeaderCalmLoading");
        expect(src).toMatch(/headerSubtitleForDrawer = opportunityDrawerHeaderCalmLoading \? null/);
        expect(src).toMatch(/headerSignalsForDrawer = opportunityDrawerHeaderCalmLoading \? null/);
        expect(src).not.toMatch(
            /opportunityDrawerHeaderCalmLoading[\s\S]*opportunityDrawerPreviewSubtitle/,
        );
    });

    it("arms postDrawerVisible after primary contract without full hydrate", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityDrawerPostRevealMayOpen");
        expect(src).toContain("reportPostRevealEnrichStart");
        expect(src).toMatch(
            /Post-reveal enrich window opens after primary contract[\s\S]{0,1200}setPostDrawerVisibleKey\(key\)/
        );
        expect(src).not.toMatch(
            /opportunityDrawerPostRevealMayOpen[\s\S]{0,800}opportunityFullRecordHydrateApplied/
        );
        expect(src).toMatch(/tryScheduleOpportunityDrawerBackgroundFull/);
        expect(src).toContain("tryBeginOpportunityDrawerHydrate");
    });

    it("keeps above-fold layout stability data attributes on inquiry summary", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("data-opportunity-drawer-secondary-window-open");
        expect(src).toContain("data-opportunity-drawer-full-hydrate-ready");
        expect(src).toContain("data-opportunity-drawer-above-fold-locked");
    });

    it("composed open gates on primary contract, not surface=full", () => {
        const coord = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        const gateFn = coord.match(
            /export function opportunityDrawerComposedRevealReady\(preload[\s\S]*?\n\}/,
        )?.[0];
        expect(gateFn).toBeTruthy();
        expect(gateFn).toContain("opportunityDrawerPrimaryContractReady");
        expect(gateFn).not.toContain("fullEntity");
        expect(gateFn).not.toContain("enrichmentHeldUntilInteraction");
        expect(coord).toContain("peekOpportunityDrawerFullEntity");
        expect(coord).toMatch(/prefetchHit = bootstrapWarm && primaryWarm/);
    });

    it("gates ref option lists on edit for bootstrap opportunity drawer", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toMatch(
            /adminV2DrawerBootstrapEnabled\(\)[\s\S]*!opportunityDrawerBootstrapLegacy[\s\S]*!isEditing[\s\S]*setOppRefFieldSelectOptions/,
        );
    });

    it("shell instant geometry attribute on opportunity drawer body", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityDrawerShellInstant");
        expect(src).toContain("ADMINV2_DRAWER_SHELL_INSTANT_ATTR");
    });
});

describe("Opportunity workflow drawer tab session (Card 3)", () => {
    it("uses session visit set and keep-mounted panes with stable tab panel min-height", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityDrawerVisitedTabsRef");
        expect(src).toContain("markOpportunityDrawerTabVisited");
        expect(src).toContain("renderOpportunityWorkflowTabPane");
        expect(src).toContain("ADMINV2_DRAWER_TAB_PANEL_MIN_H");
        expect(src).toContain("data-adminv2-drawer-tab-panel-host");
        expect(src).toMatch(/style=\{adminV2DrawerTabPanelHostStyle\(\)\}/);
    });

    it("routes inquiry workflow tab strip through selectDrawerTab without drawerGateLoading lock", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toMatch(/onClick=\{\(\) => selectDrawerTab\(tab\)\}/);
        const workflowStrip = src.match(
            /opportunityInquiryWorkflowDrawer[\s\S]{0,900}selectDrawerTab/,
        )?.[0];
        expect(workflowStrip).toBeTruthy();
        expect(workflowStrip).not.toContain("disabled={drawerGateLoading}");
    });

    it("gates opportunity related/documents fetch to those tabs (not overview)", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toMatch(
            /drawer\.type !== "opportunities"[\s\S]{0,400}drawerTab === "related" \|\| drawerTab === "documents"/,
        );
        expect(src).toMatch(/if \(drawerTab !== "activity"\) return;/);
    });
});

describe("Drawer single-reveal bootstrap body", () => {
    it("holds pre-overview shell until oper reveal and defers secondary surfaces", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityDrawerOverviewRevealReady");
        expect(src).toContain("opportunityDrawerPreOverviewShell");
        expect(src).toContain("opportunityDrawerSecondaryReady");
        expect(src).toMatch(
            /opportunityDrawerPreOverviewShell[\s\S]*?DrawerOpportunityQueueBootstrapBodySkeleton/,
        );
        expect(src).toMatch(/reportDrawerPrimaryReady[\s\S]*?opportunityDrawerPrimaryCoherent/);
    });

    it("dedupes drawer bootstrap per entity open and suppresses legacy chrome fetches on happy path", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        const chrome = read("hooks/useRecordChromeConfig.ts");
        const bootstrapClient = read("lib/admin/opportunityDrawerBootstrapClient.ts");
        expect(drawer).toContain("opportunityDrawerBootstrapInflightRef");
        expect(drawer).toContain("opportunityDrawerBootstrapEntityKeyRef");
        expect(drawer).toContain("opportunityBootstrapChromeSuppressed");
        expect(drawer).toContain("AdminV2DrawerLoadingState");
        expect(drawer).toContain("fetchOpportunityDrawerOperationalBootstrap");
        expect(bootstrapClient).toContain("buildOpportunityDrawerBootstrapCanonicalUrl");
        expect(bootstrapClient).toContain("drawerBootstrapByOpportunityId");
        expect(bootstrapClient).toContain("drawerBootstrapCacheKey");
        expect(drawer).toMatch(
            /opportunityDrawerBootstrapInflightRef\.current === entityOpenKey[\s\S]*?return;/,
        );
        expect(drawer).toMatch(
            /adminV2DrawerBootstrapEnabled\(\)[\s\S]*?opportunityDrawerBootstrapLegacy[\s\S]*?setOpportunityResolvedHeaderLoading\(true\)/,
        );
        expect(drawer).toMatch(
            /adminV2DrawerBootstrapEnabled\(\)[\s\S]*!opportunityDrawerBootstrapLegacy[\s\S]*?fetchAdminWorkUnitDrawerJson/,
        );
        expect(chrome).toMatch(/bootstrapSeeded = options\?\.bootstrapSeeded === true/);
        expect(chrome).not.toMatch(/bootstrapSeeded = Boolean\(options\?\.bootstrapSeeded && options\.seededLayout\)/);
    });

    it("reveals inquiry tabs with overview and keeps preview title until primary reveal", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toMatch(
            /!opportunityDrawerOverviewRevealReady[\s\S]*?opportunityQueuePreviewSeed\?\.title/,
        );
        expect(src).toMatch(
            /opportunityDrawerOverviewRevealReady[\s\S]*?drawerTabStripKeys/,
        );
        expect(src).not.toMatch(/opportunityDrawerTabsPending && isOpportunityRecordModalTarget/);
    });

    it("does not show loading copy for packet status probe", () => {
        const src = read("components/admin/opportunity/OpportunityPacketReviewOverview.tsx");
        expect(src).not.toContain("Loading packet status");
    });

    it("reserves title-rail actions without waiting on entity row when preview is active", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toMatch(
            /opportunityTitleRailActive[\s\S]*?opportunityHeaderQuickActionsNode \?\? <DrawerWorkflowHeaderQuickActionsSkeleton/,
        );
    });

    it("blocks header actions only while record_header resolves, not until shell settled", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityHeaderActionsPending");
        expect(src).toContain("opportunityResolvedHeaderLoading");
        expect(src).not.toMatch(
            /opportunityHeaderActionsPending[\s\S]{0,220}!opportunityDrawerShellSettled/,
        );
    });
});

describe("Opportunity drawer first-paint contract", () => {
    it("defines primary contract and first-paint gates in shared module", () => {
        const mod = read("lib/admin/drawer/opportunityDrawerFirstPaintContract.ts");
        expect(mod).toContain("opportunityDrawerPrimaryContractReady");
        expect(mod).toContain("opportunityDrawerFirstPaintActive");
        expect(mod).toContain("filterOpportunityOverviewSectionsForFirstPaint");
    });

    it("inquiry summary uses drawer pipeline with bootstrap fallbacks", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("buildOpportunityDrawerPipelineState");
        expect(src).toContain("opportunityDrawerPipeline");
        expect(src).toContain("inqModel?.show_right_column");
        expect(src).toContain("drawerFullBoundValuesReady");
        expect(src).toContain("FamilyContactsPanel");
        expect(src).toContain("OpportunityInquirySummaryTaskPreview");
        expect(src).toContain('data-shell-slot-placeholder="inquiry_summary_activity"');
        const pipelineMod = read("lib/adminV2/drawerPipeline/adapters/opportunity/buildAboveFoldRenderModel.ts");
        expect(pipelineMod).toContain("resolveShowRightColumn");
        expect(pipelineMod).not.toMatch(/above_fold_locked[\s\S]{0,80}column_mode/);
        expect(src).toContain("stabilizeOpportunityWorkflowOverviewSections");
        expect(src).toMatch(/opportunityDrawerLayoutFirstPaintGates \? "true" : "false"/);
        expect(src).not.toMatch(
            /min-h-\[3\.25rem\][\s\S]{0,120}aria-hidden[\s\S]{0,120}Tour date/,
        );
    });

    it("does not show header action skeletons during first paint", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("opportunityHeaderFirstPaintSuppress");
        expect(src).toMatch(
            /opportunityHeaderFirstPaintSuppress[\s\S]{0,280}return null/,
        );
        expect(src).toContain("opportunityInquiryAwaitingFullEnrichment");
    });
});
