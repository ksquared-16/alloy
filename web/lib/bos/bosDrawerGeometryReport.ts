import {
    BOS_DRAWER_RAIL_OFFSET_CSS_VAR,
    BOS_OVERLAY_GUTTER_CSS_VAR,
    BOS_OVERLAY_WIDTH_CSS_VAR,
    BOS_RAIL_OVERLAY_GUTTER_PX,
    computeBosDrawerRailOffsetPx,
} from "@/lib/bos/bosOverlayGeometry";
import {
    DRAWER_AVAILABLE_LEFT_CSS_VAR,
    DRAWER_AVAILABLE_RIGHT_CSS_VAR,
    DRAWER_AVAILABLE_WIDTH_CSS_VAR,
    DRAWER_COMPUTED_LEFT_CSS_VAR,
    DRAWER_COMPUTED_RIGHT_CSS_VAR,
    DRAWER_COMPUTED_WIDTH_CSS_VAR,
    computeDrawerWorkspaceBounds,
    measureAndApplyDrawerWorkspaceGeometry,
    passesDrawerWorkspaceGutterRules,
    setDrawerGeometryProbeActive,
    type DrawerWorkspaceBounds,
} from "@/lib/bos/drawerWorkspaceGeometry";
import { DRAWER_OVERVIEW_DASHBOARD_MIN_WIDTH_PX } from "@/lib/layout/runtime/drawerOverviewCompositionStandard";

const DRAWER_GEOMETRY_PROBE_HOLD_MS = 500;

export type BosGeometryRect = {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
};

export type BosPaddingSnapshot = {
    paddingTop: number;
    paddingRight: number;
    paddingBottom: number;
    paddingLeft: number;
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
    width: number | null;
};

export type BosDrawerGeometryReport = {
    capturedAt: string;
    viewport: { innerWidth: number; innerHeight: number; centerX: number };
    workspace: {
        mainContent: BosGeometryRect | null;
        mainContentSelector: string | null;
        commandRailColumn: BosGeometryRect | null;
        commandRail: BosGeometryRect | null;
        availableDrawerArea: BosGeometryRect | null;
    };
    drawer: {
        open: boolean;
        presentation: "modal" | "sidebar" | "none";
        backdrop: BosGeometryRect | null;
        panel: BosGeometryRect | null;
        contentVisibleArea: BosGeometryRect | null;
        computedRightPx: number | null;
        computedLeftPx: number | null;
        computedTransform: string | null;
        computedMaxWidth: string | null;
        computedWidth: string | null;
        inlineWidth: string | null;
        inlineMaxWidth: string | null;
        inlineRight: string | null;
        cssVars: {
            bosOverlayWidth: string | null;
            bosOverlayGutter: string | null;
            workspaceCommandRailOffset: string | null;
            drawerInsetRight: string | null;
            drawerInsetTop: string | null;
            drawerInsetBottom: string | null;
        };
    };
    bos: {
        overlay: BosGeometryRect | null;
        overlayZIndex: string | null;
        host: BosGeometryRect | null;
        visiblePanel: BosGeometryRect | null;
        visiblePanelZIndex: string | null;
    };
    geometry: {
        overlapPx: number | null;
        requiredShiftPx: number | null;
        currentRightOffsetPx: number | null;
        proposedDrawerRightOffsetPx: number | null;
        passesGutterRule: boolean | null;
        expectedMaxDrawerRight: number | null;
    };
    workspaceBounds: {
        sidebarRight: number | null;
        bosOverlayLeft: number | null;
        availableLeft: number | null;
        availableRight: number | null;
        availableWidth: number | null;
        computedDrawerLeft: number | null;
        computedDrawerRight: number | null;
        computedDrawerWidth: number | null;
        actualDrawerLeft: number | null;
        actualDrawerRight: number | null;
        actualDrawerWidth: number | null;
        passesLeftRule: boolean | null;
        passesRightRule: boolean | null;
        cssVars: {
            availableLeft: string | null;
            availableRight: string | null;
            availableWidth: string | null;
            computedLeft: string | null;
            computedWidth: string | null;
            computedRight: string | null;
        };
    };
    loader: {
        found: boolean;
        selector: string | null;
        rect: BosGeometryRect | null;
        centerX: number | null;
        viewportCenterX: number;
        drawerPanelCenterX: number | null;
        drawerWorkspaceCenterX: number | null;
        alignment: "viewport" | "drawer-panel" | "drawer-workspace" | "unknown" | "none";
        deltaViewportPx: number | null;
        deltaPanelPx: number | null;
        deltaWorkspacePx: number | null;
    };
    internalLayout: {
        panelWidth: number | null;
        scrollBodyWidth: number | null;
        overviewGridWidth: number | null;
        overviewCanvasWidth: number | null;
        activeOverviewMode: "stacked" | "dashboard";
        viewportLgActive: boolean;
        containerWideEnough: boolean;
        householdColWidth: number | null;
        enrollmentColWidth: number | null;
        rightRailColWidth: number | null;
    } | null;
    internalPadding: {
        panel: BosPaddingSnapshot | null;
        scrollBody: BosPaddingSnapshot | null;
        entityDrawerScrollBody: BosPaddingSnapshot | null;
        headerTitleRow: BosPaddingSnapshot | null;
        headerTabsRow: BosPaddingSnapshot | null;
        headerLifecycleRow: BosPaddingSnapshot | null;
        overviewComposition: BosPaddingSnapshot | null;
        overviewCanvas: BosPaddingSnapshot | null;
        overviewShellGridGapPx: number | null;
        overviewRightRailGapPx: number | null;
        estimatedUsableContentWidthPx: number | null;
    } | null;
    recommendations: {
        summary: string;
        cssVarUpdates: Record<string, string>;
        measuredOverlayOffsetPx: number | null;
        note: string | null;
    };
};

const DRAWER_INSET_RIGHT_VAR = "--adminv2-drawer-inset-right";
const DRAWER_INSET_TOP_VAR = "--adminv2-drawer-inset-top";
const DRAWER_INSET_BOTTOM_VAR = "--adminv2-drawer-inset-bottom";

const LOADER_SELECTORS = [
    "[data-opportunity-drawer-opening-overlay='true']",
    "[data-opportunity-drawer-queue-nav-pending='true']",
    "[data-drawer-vm-runtime-cold-loading='true']",
    "[data-opportunity-drawer-operational-loading='true']",
    "[data-opportunity-drawer-composed-preparing='true']",
] as const;

const HIGHLIGHT_COLORS: Record<string, string> = {
    mainContent: "#3b82f6",
    commandRail: "#8b5cf6",
    availableArea: "#06b6d4",
    drawerBackdrop: "#f59e0b",
    drawerPanel: "#ef4444",
    bosOverlay: "#10b981",
    bosHost: "#84cc16",
    bosPanel: "#22c55e",
    loader: "#ec4899",
};

function roundPx(n: number): number {
    return Math.round(n);
}

export function snapshotRect(el: Element | null | undefined): BosGeometryRect | null {
    if (!el || typeof el.getBoundingClientRect !== "function") return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return {
        left: roundPx(r.left),
        right: roundPx(r.right),
        top: roundPx(r.top),
        bottom: roundPx(r.bottom),
        width: roundPx(r.width),
        height: roundPx(r.height),
        centerX: roundPx(r.left + r.width / 2),
        centerY: roundPx(r.top + r.height / 2),
    };
}

function parsePx(value: string | null | undefined): number | null {
    if (!value || value === "auto") return null;
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
    return match ? roundPx(Number(match[1])) : null;
}

function readCssVar(name: string): string | null {
    if (typeof document === "undefined") return null;
    const inline = document.documentElement.style.getPropertyValue(name).trim();
    if (inline) return inline;
    const computed = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return computed || null;
}

function pickFirstVisible(selector: string): Element | null {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
        const rect = snapshotRect(node);
        if (rect && rect.width > 0 && rect.height > 0) return node;
    }
    return null;
}

function findDrawerPanel(): { el: Element | null; presentation: "modal" | "sidebar" | "none" } {
    const modal = pickFirstVisible(".adminv2-drawer-modal-panel");
    if (modal) return { el: modal, presentation: "modal" };
    const sidebar = pickFirstVisible(".adminv2-drawer-sidebar-panel");
    if (sidebar) return { el: sidebar, presentation: "sidebar" };
    return { el: null, presentation: "none" };
}

function findDrawerBackdrop(): Element | null {
    return (
        pickFirstVisible(".adminv2-drawer-modal-dim") ??
        pickFirstVisible(".adminv2-drawer-sidebar-dim") ??
        pickFirstVisible(".adminv2-drawer-backdrop-hit")
    );
}

function findDrawerContentArea(panel: Element | null): Element | null {
    if (!panel) return null;
    return (
        panel.querySelector("[data-adminv2-record-modal-scroll]") ??
        panel.querySelector("[data-entity-drawer-scroll-body='true']") ??
        panel.querySelector("[data-adminv2-drawer-overlay-host='true']")?.parentElement ??
        panel
    );
}

const OVERVIEW_COMPOSITION_SELECTOR =
    "[data-lead-overview-composition], [data-person-overview-composition], [data-child-overview-composition]";

function countGridTemplateColumns(gridTemplateColumns: string): number {
    if (!gridTemplateColumns || gridTemplateColumns === "none") return 0;
    const repeatMatch = gridTemplateColumns.match(/^repeat\((\d+)/);
    if (repeatMatch) return Number(repeatMatch[1]);
    return gridTemplateColumns.split(/\s+/).filter(Boolean).length;
}

function inferOverviewLayoutMode(
    canvasWidth: number | null,
    gridTrackCount: number,
): "stacked" | "dashboard" {
    if (gridTrackCount >= 12) return "dashboard";
    if (
        canvasWidth != null
        && canvasWidth >= DRAWER_OVERVIEW_DASHBOARD_MIN_WIDTH_PX
        && gridTrackCount > 1
    ) {
        return "dashboard";
    }
    return "stacked";
}

function snapshotPadding(el: Element | null | undefined): BosPaddingSnapshot | null {
    if (!el || typeof getComputedStyle !== "function") return null;
    const style = getComputedStyle(el);
    const rect = snapshotRect(el);
    return {
        paddingTop: roundPx(parseFloat(style.paddingTop) || 0),
        paddingRight: roundPx(parseFloat(style.paddingRight) || 0),
        paddingBottom: roundPx(parseFloat(style.paddingBottom) || 0),
        paddingLeft: roundPx(parseFloat(style.paddingLeft) || 0),
        marginTop: roundPx(parseFloat(style.marginTop) || 0),
        marginRight: roundPx(parseFloat(style.marginRight) || 0),
        marginBottom: roundPx(parseFloat(style.marginBottom) || 0),
        marginLeft: roundPx(parseFloat(style.marginLeft) || 0),
        width: rect?.width ?? null,
    };
}

function collectInternalPaddingReport(
    drawerPanelEl: Element | null,
    modalScrollEl: Element | null,
): BosDrawerGeometryReport["internalPadding"] {
    if (!drawerPanelEl) return null;

    const overviewEl = drawerPanelEl.querySelector(OVERVIEW_COMPOSITION_SELECTOR);
    const canvasEl =
        overviewEl?.querySelector(".adminv2-drawer-overview-canvas") ?? overviewEl;
    const gridEl = overviewEl?.querySelector(".adminv2-drawer-overview-shell-grid");
    const railEl = overviewEl?.querySelector(".adminv2-drawer-overview-col-rail");
    const entityScrollEl = drawerPanelEl.querySelector("[data-entity-drawer-scroll-body='true']");
    const titleRowEl = drawerPanelEl.querySelector("[data-proof-layout-header-row='title-actions']");
    const tabsRowEl = drawerPanelEl.querySelector("[data-proof-layout-header-row='tabs']");
    const lifecycleRowEl = drawerPanelEl.querySelector("[data-proof-layout-header-row='lifecycle']");

    const panelRect = snapshotRect(drawerPanelEl);
    const scrollPadding = snapshotPadding(modalScrollEl);
    const canvasPadding = snapshotPadding(canvasEl);
    const gridGapPx =
        gridEl ? roundPx(parseFloat(getComputedStyle(gridEl).gap.split(" ")[0] || "0")) : null;
    const railGapPx =
        railEl ? roundPx(parseFloat(getComputedStyle(railEl).gap.split(" ")[0] || "0")) : null;

    const horizontalInset =
        (scrollPadding?.paddingLeft ?? 0)
        + (scrollPadding?.paddingRight ?? 0)
        + (canvasPadding?.paddingLeft ?? 0)
        + (canvasPadding?.paddingRight ?? 0);
    const estimatedUsableContentWidthPx =
        panelRect != null ? roundPx(panelRect.width - horizontalInset) : null;

    return {
        panel: snapshotPadding(drawerPanelEl),
        scrollBody: scrollPadding,
        entityDrawerScrollBody: snapshotPadding(entityScrollEl),
        headerTitleRow: snapshotPadding(titleRowEl),
        headerTabsRow: snapshotPadding(tabsRowEl),
        headerLifecycleRow: snapshotPadding(lifecycleRowEl),
        overviewComposition: snapshotPadding(overviewEl),
        overviewCanvas: canvasPadding,
        overviewShellGridGapPx: gridGapPx,
        overviewRightRailGapPx: railGapPx,
        estimatedUsableContentWidthPx,
    };
}

function collectInternalLayoutReport(
    drawerPanelEl: Element | null,
    scrollBodyEl: Element | null,
): BosDrawerGeometryReport["internalLayout"] {
    if (!drawerPanelEl) return null;

    const overviewEl = drawerPanelEl.querySelector(OVERVIEW_COMPOSITION_SELECTOR);
    if (!overviewEl) return null;

    const canvasEl =
        overviewEl.querySelector(".adminv2-drawer-overview-canvas") ?? overviewEl;
    const gridEl = overviewEl.querySelector(".adminv2-drawer-overview-shell-grid");
    const leftColEl = overviewEl.querySelector(".adminv2-drawer-overview-col-left");
    const mainColEl = overviewEl.querySelector(".adminv2-drawer-overview-col-main");
    const railColEl = overviewEl.querySelector(".adminv2-drawer-overview-col-rail");

    const panelRect = snapshotRect(drawerPanelEl);
    const scrollRect = snapshotRect(scrollBodyEl);
    const gridRect = snapshotRect(gridEl);
    const canvasRect = snapshotRect(canvasEl);

    const canvasWidth = canvasRect?.width ?? null;
    const gridTrackCount =
        gridEl ? countGridTemplateColumns(getComputedStyle(gridEl).gridTemplateColumns) : 0;
    const containerWideEnough =
        canvasWidth != null && canvasWidth >= DRAWER_OVERVIEW_DASHBOARD_MIN_WIDTH_PX;
    const viewportLgActive =
        typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

    return {
        panelWidth: panelRect?.width ?? null,
        scrollBodyWidth: scrollRect?.width ?? null,
        overviewGridWidth: gridRect?.width ?? null,
        overviewCanvasWidth: canvasWidth,
        activeOverviewMode: inferOverviewLayoutMode(canvasWidth, gridTrackCount),
        viewportLgActive,
        containerWideEnough,
        householdColWidth: snapshotRect(leftColEl)?.width ?? null,
        enrollmentColWidth: snapshotRect(mainColEl)?.width ?? null,
        rightRailColWidth: snapshotRect(railColEl)?.width ?? null,
    };
}

function findLoader(): { el: Element | null; selector: string | null } {
    for (const selector of LOADER_SELECTORS) {
        const el = pickFirstVisible(selector);
        if (el) return { el, selector };
    }
    return { el: null, selector: null };
}

export function inferLoaderAlignment(
    loaderCenterX: number | null,
    viewportCenterX: number,
    panelCenterX: number | null,
    workspaceCenterX: number | null
): BosDrawerGeometryReport["loader"]["alignment"] {
    if (loaderCenterX == null) return "none";
    const threshold = 12;
    const deltas = [
        { key: "viewport" as const, delta: Math.abs(loaderCenterX - viewportCenterX) },
        ...(panelCenterX != null ?
            [{ key: "drawer-panel" as const, delta: Math.abs(loaderCenterX - panelCenterX) }]
        :   []),
        ...(workspaceCenterX != null ?
            [{ key: "drawer-workspace" as const, delta: Math.abs(loaderCenterX - workspaceCenterX) }]
        :   []),
    ];
    const best = deltas.sort((a, b) => a.delta - b.delta)[0];
    if (!best || best.delta > threshold) return "unknown";
    return best.key;
}

export type BosDrawerGeometryReportOptions = {
    /** Draw colored outlines on measured elements for screenshot capture. */
    highlight?: boolean;
    /** Log formatted tables to console. */
    log?: boolean;
};

function applyHighlight(el: Element | null, color: string, label: string) {
    if (!el) return;
    const node = el as HTMLElement;
    node.dataset.alloyBosGeometryHighlight = label;
    node.style.outline = `2px solid ${color}`;
    node.style.outlineOffset = "-2px";
}

export function clearBosDrawerGeometryHighlights() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("[data-alloy-bos-geometry-highlight]").forEach((node) => {
        const el = node as HTMLElement;
        el.style.outline = "";
        el.style.outlineOffset = "";
        delete el.dataset.alloyBosGeometryHighlight;
    });
}

export function collectBosDrawerGeometryReport(
    options: BosDrawerGeometryReportOptions = {}
): BosDrawerGeometryReport {
    const { highlight = false, log = false } = options;
    if (highlight) clearBosDrawerGeometryHighlights();

    const viewportCenterX = roundPx(window.innerWidth / 2);
    const gutterPx =
        parsePx(readCssVar(BOS_OVERLAY_GUTTER_CSS_VAR)) ?? BOS_RAIL_OVERLAY_GUTTER_PX;

    const mainContentEl =
        pickFirstVisible(".adminv2-ws-dept-v2-primary-column") ??
        pickFirstVisible("[data-adminv2-workspace-root-shell='true']");
    const mainContentSelector =
        mainContentEl?.matches(".adminv2-ws-dept-v2-primary-column") ?
            ".adminv2-ws-dept-v2-primary-column"
        : mainContentEl ? "[data-adminv2-workspace-root-shell='true']" : null;

    const commandRailColumnEl = pickFirstVisible("[data-adminv2-workspace-command-column]");
    const commandRailEl =
        pickFirstVisible("[data-adminv2-workspace-command-rail]") ?? commandRailColumnEl;

    const bosOverlayEl = pickFirstVisible("[data-adminv2-bos-rail-overlay='true']");
    const bosHostEl = pickFirstVisible("[data-adminv2-command-rail-bos-host]");
    const bosVisiblePanelEl =
        bosOverlayEl?.querySelector("[data-adminv2-command-surface-layer='rail']") ??
        bosOverlayEl?.querySelector(".adminv2-ws-command-rail-bos-dock") ??
        bosOverlayEl;

    const mainContent = snapshotRect(mainContentEl);
    const commandRailColumn = snapshotRect(commandRailColumnEl);
    const commandRail = snapshotRect(commandRailEl);
    const bosOverlay = snapshotRect(bosOverlayEl);
    const bosHost = snapshotRect(bosHostEl);
    const bosVisiblePanel = snapshotRect(bosVisiblePanelEl);

    const sidebarEl = pickFirstVisible("[data-adminv2-sidebar='true']");
    const sidebarRect = snapshotRect(sidebarEl);

    const { el: drawerPanelEl, presentation } = findDrawerPanel();
    const drawerBackdropEl = findDrawerBackdrop();
    const drawerContentEl = findDrawerContentArea(drawerPanelEl);
    const drawerBackdrop = snapshotRect(drawerBackdropEl);
    const drawerPanel = snapshotRect(drawerPanelEl);
    const drawerContentVisibleArea = snapshotRect(drawerContentEl);
    const internalLayout = collectInternalLayoutReport(drawerPanelEl, drawerContentEl);
    const internalPadding = collectInternalPaddingReport(drawerPanelEl, drawerContentEl);

    const computedBounds = computeDrawerWorkspaceBounds({
        sidebarRight: sidebarRect?.right ?? 0,
        bosOverlayLeft: bosOverlay?.left ?? null,
        bosOverlayWidth: bosOverlay?.width ?? null,
        bosOverlayRight: bosOverlay?.right ?? null,
        viewportWidth: window.innerWidth,
        gutterPx,
    });
    const gutterRules =
        drawerPanel ?
            passesDrawerWorkspaceGutterRules(computedBounds, drawerPanel, gutterPx)
        :   { passesLeft: null, passesRight: null };

    const availableDrawerArea = {
        left: computedBounds.availableLeft,
        right: computedBounds.availableRight,
        top: 0,
        bottom: roundPx(window.innerHeight),
        width: computedBounds.availableWidth,
        height: roundPx(window.innerHeight),
        centerX: roundPx(computedBounds.availableLeft + computedBounds.availableWidth / 2),
        centerY: roundPx(window.innerHeight / 2),
    };

    const panelComputed = drawerPanelEl ? getComputedStyle(drawerPanelEl) : null;
    const panelInline = drawerPanelEl as HTMLElement | null;

    const overlayRectForOffset = bosOverlayEl?.getBoundingClientRect();
    const measuredOverlayOffsetPx =
        overlayRectForOffset ?
            computeBosDrawerRailOffsetPx(overlayRectForOffset, gutterPx)
        :   null;

    const currentRailOffsetPx = parsePx(readCssVar(BOS_DRAWER_RAIL_OFFSET_CSS_VAR));
    const computedRightPx = panelComputed ? parsePx(panelComputed.right) : null;

    const effectiveBosLeft =
        computedBounds.effectiveBosOverlayLeft ?? computedBounds.bosOverlayLeft ?? bosOverlay?.left ?? null;
    const overlapPx =
        drawerPanel && effectiveBosLeft != null ?
            roundPx(drawerPanel.right - effectiveBosLeft)
        :   null;
    const requiredShiftPx =
        overlapPx != null ? Math.max(0, overlapPx + gutterPx) : null;
    const currentRightOffsetPx = currentRailOffsetPx ?? computedRightPx;
    const proposedDrawerRightOffsetPx =
        currentRightOffsetPx != null && requiredShiftPx != null ?
            currentRightOffsetPx + requiredShiftPx
        :   null;
    const expectedMaxDrawerRight =
        effectiveBosLeft != null ? roundPx(effectiveBosLeft - gutterPx) : null;
    const passesGutterRule =
        drawerPanel && expectedMaxDrawerRight != null ?
            drawerPanel.right <= expectedMaxDrawerRight
        :   null;

    const { el: loaderEl, selector: loaderSelector } = findLoader();
    const loaderRect = snapshotRect(loaderEl);
    const loaderCenterX = loaderRect?.centerX ?? null;
    const drawerPanelCenterX = drawerPanel?.centerX ?? null;
    const drawerWorkspaceCenterX = availableDrawerArea?.centerX ?? null;
    const loaderAlignment = inferLoaderAlignment(
        loaderCenterX,
        viewportCenterX,
        drawerPanelCenterX,
        drawerWorkspaceCenterX
    );

    const cssVarUpdates: Record<string, string> = {};
    let recommendationSummary = "No drawer/BOS overlap measurement (open a drawer on a workspace route with BOS rail).";
    let recommendationNote: string | null = null;

    if (proposedDrawerRightOffsetPx != null && requiredShiftPx != null && requiredShiftPx > 0) {
        cssVarUpdates[BOS_DRAWER_RAIL_OFFSET_CSS_VAR] = `${proposedDrawerRightOffsetPx}px`;
        if (bosOverlay) {
            cssVarUpdates[BOS_OVERLAY_WIDTH_CSS_VAR] = `${bosOverlay.width}px`;
        }
        cssVarUpdates[BOS_OVERLAY_GUTTER_CSS_VAR] = `${gutterPx}px`;
        recommendationSummary = `Increase ${BOS_DRAWER_RAIL_OFFSET_CSS_VAR} by ${requiredShiftPx}px → ${proposedDrawerRightOffsetPx}px`;
    } else if (passesGutterRule) {
        recommendationSummary = "Gutter rule passes — no rail offset increase required.";
        if (currentRailOffsetPx != null) {
            cssVarUpdates[BOS_DRAWER_RAIL_OFFSET_CSS_VAR] = `${currentRailOffsetPx}px`;
        }
    }

    if (presentation === "modal" && requiredShiftPx != null && requiredShiftPx > 0) {
        recommendationNote =
            "Drawer is modal presentation — sidebar `right` inset on `.adminv2-drawer-sidebar-panel` does not apply. Modal panel uses center transform; rail offset CSS var alone may not fix overlap.";
    }

    if (measuredOverlayOffsetPx != null && currentRailOffsetPx != null && measuredOverlayOffsetPx !== currentRailOffsetPx) {
        recommendationNote = [
            recommendationNote,
            `Hook offset ${currentRailOffsetPx}px vs geometry formula ${measuredOverlayOffsetPx}px.`,
        ]
            .filter(Boolean)
            .join(" ");
    }

    if (loaderAlignment === "viewport") {
        recommendationNote = [
            recommendationNote,
            "Loader is viewport-centered — center within drawer panel or available workspace area.",
        ]
            .filter(Boolean)
            .join(" ");
    }

    const report: BosDrawerGeometryReport = {
        capturedAt: new Date().toISOString(),
        viewport: {
            innerWidth: roundPx(window.innerWidth),
            innerHeight: roundPx(window.innerHeight),
            centerX: viewportCenterX,
        },
        workspace: {
            mainContent,
            mainContentSelector,
            commandRailColumn,
            commandRail,
            availableDrawerArea,
        },
        drawer: {
            open: drawerPanelEl != null,
            presentation,
            backdrop: drawerBackdrop,
            panel: drawerPanel,
            contentVisibleArea: drawerContentVisibleArea,
            computedRightPx,
            computedLeftPx: panelComputed ? parsePx(panelComputed.left) : null,
            computedTransform: panelComputed?.transform ?? null,
            computedMaxWidth: panelComputed?.maxWidth ?? null,
            computedWidth: panelComputed?.width ?? null,
            inlineWidth: panelInline?.style.width || null,
            inlineMaxWidth: panelInline?.style.maxWidth || null,
            inlineRight: panelInline?.style.right || null,
            cssVars: {
                bosOverlayWidth: readCssVar(BOS_OVERLAY_WIDTH_CSS_VAR),
                bosOverlayGutter: readCssVar(BOS_OVERLAY_GUTTER_CSS_VAR),
                workspaceCommandRailOffset: readCssVar(BOS_DRAWER_RAIL_OFFSET_CSS_VAR),
                drawerInsetRight: readCssVar(DRAWER_INSET_RIGHT_VAR),
                drawerInsetTop: readCssVar(DRAWER_INSET_TOP_VAR),
                drawerInsetBottom: readCssVar(DRAWER_INSET_BOTTOM_VAR),
            },
        },
        bos: {
            overlay: bosOverlay,
            overlayZIndex: bosOverlayEl ? getComputedStyle(bosOverlayEl).zIndex : null,
            host: bosHost,
            visiblePanel: bosVisiblePanel,
            visiblePanelZIndex:
                bosVisiblePanelEl ? getComputedStyle(bosVisiblePanelEl).zIndex : null,
        },
        geometry: {
            overlapPx,
            requiredShiftPx,
            currentRightOffsetPx,
            proposedDrawerRightOffsetPx,
            passesGutterRule,
            expectedMaxDrawerRight,
        },
        workspaceBounds: {
            sidebarRight: sidebarRect?.right ?? null,
            bosOverlayLeft: bosOverlay?.left ?? null,
            availableLeft: computedBounds.availableLeft,
            availableRight: computedBounds.availableRight,
            availableWidth: computedBounds.availableWidth,
            computedDrawerLeft: computedBounds.computedDrawerLeft,
            computedDrawerRight: computedBounds.computedDrawerRight,
            computedDrawerWidth: computedBounds.computedDrawerWidth,
            actualDrawerLeft: drawerPanel?.left ?? null,
            actualDrawerRight: drawerPanel?.right ?? null,
            actualDrawerWidth: drawerPanel?.width ?? null,
            passesLeftRule: gutterRules.passesLeft,
            passesRightRule: gutterRules.passesRight,
            cssVars: {
                availableLeft: readCssVar(DRAWER_AVAILABLE_LEFT_CSS_VAR),
                availableRight: readCssVar(DRAWER_AVAILABLE_RIGHT_CSS_VAR),
                availableWidth: readCssVar(DRAWER_AVAILABLE_WIDTH_CSS_VAR),
                computedLeft: readCssVar(DRAWER_COMPUTED_LEFT_CSS_VAR),
                computedWidth: readCssVar(DRAWER_COMPUTED_WIDTH_CSS_VAR),
                computedRight: readCssVar(DRAWER_COMPUTED_RIGHT_CSS_VAR),
            },
        },
        loader: {
            found: loaderEl != null,
            selector: loaderSelector,
            rect: loaderRect,
            centerX: loaderCenterX,
            viewportCenterX,
            drawerPanelCenterX,
            drawerWorkspaceCenterX,
            alignment: loaderAlignment,
            deltaViewportPx:
                loaderCenterX != null ? roundPx(loaderCenterX - viewportCenterX) : null,
            deltaPanelPx:
                loaderCenterX != null && drawerPanelCenterX != null ?
                    roundPx(loaderCenterX - drawerPanelCenterX)
                :   null,
            deltaWorkspacePx:
                loaderCenterX != null && drawerWorkspaceCenterX != null ?
                    roundPx(loaderCenterX - drawerWorkspaceCenterX)
                :   null,
        },
        internalLayout,
        internalPadding,
        recommendations: {
            summary: recommendationSummary,
            cssVarUpdates,
            measuredOverlayOffsetPx,
            note: recommendationNote,
        },
    };

    if (highlight) {
        applyHighlight(mainContentEl, HIGHLIGHT_COLORS.mainContent, "mainContent");
        applyHighlight(commandRailEl, HIGHLIGHT_COLORS.commandRail, "commandRail");
        applyHighlight(drawerBackdropEl, HIGHLIGHT_COLORS.drawerBackdrop, "drawerBackdrop");
        applyHighlight(drawerPanelEl, HIGHLIGHT_COLORS.drawerPanel, "drawerPanel");
        applyHighlight(bosOverlayEl, HIGHLIGHT_COLORS.bosOverlay, "bosOverlay");
        applyHighlight(bosHostEl, HIGHLIGHT_COLORS.bosHost, "bosHost");
        applyHighlight(bosVisiblePanelEl, HIGHLIGHT_COLORS.bosPanel, "bosPanel");
        applyHighlight(loaderEl, HIGHLIGHT_COLORS.loader, "loader");
    }

    if (log) {
        logBosDrawerGeometryReport(report);
    }

    return report;
}

export function logBosDrawerGeometryReport(report: BosDrawerGeometryReport) {
    const group = "BOS + drawer geometry";
    console.group(group);
    console.log("Captured:", report.capturedAt);

    console.group("Viewport");
    console.table(report.viewport);
    console.groupEnd();

    console.group("Workspace");
    console.table({
        mainContent: report.workspace.mainContent,
        commandRailColumn: report.workspace.commandRailColumn,
        commandRail: report.workspace.commandRail,
        availableDrawerArea: report.workspace.availableDrawerArea,
    });
    console.groupEnd();

    console.group("Drawer");
    console.table({
        open: report.drawer.open,
        presentation: report.drawer.presentation,
        backdrop: report.drawer.backdrop,
        panel: report.drawer.panel,
        contentVisibleArea: report.drawer.contentVisibleArea,
        computedRightPx: report.drawer.computedRightPx,
        computedLeftPx: report.drawer.computedLeftPx,
        computedTransform: report.drawer.computedTransform,
        computedMaxWidth: report.drawer.computedMaxWidth,
        computedWidth: report.drawer.computedWidth,
        inlineWidth: report.drawer.inlineWidth,
        inlineMaxWidth: report.drawer.inlineMaxWidth,
        inlineRight: report.drawer.inlineRight,
    });
    console.table(report.drawer.cssVars);
    console.groupEnd();

    console.group("BOS");
    console.table({
        overlay: report.bos.overlay,
        overlayZIndex: report.bos.overlayZIndex,
        host: report.bos.host,
        visiblePanel: report.bos.visiblePanel,
        visiblePanelZIndex: report.bos.visiblePanelZIndex,
    });
    console.groupEnd();

    console.group("Computed geometry");
    console.table(report.geometry);
    console.groupEnd();

    console.group("Workspace bounds");
    console.table(report.workspaceBounds);
    console.groupEnd();

    console.group("Loader placement");
    console.table(report.loader);
    console.groupEnd();

    console.group("Internal overview layout");
    if (report.internalLayout) {
        console.table(report.internalLayout);
    } else {
        console.log("No drawer overview composition found in open drawer.");
    }
    console.groupEnd();

    console.group("Internal padding / gutters");
    if (report.internalPadding) {
        console.table({
            estimatedUsableContentWidthPx: report.internalPadding.estimatedUsableContentWidthPx,
            overviewShellGridGapPx: report.internalPadding.overviewShellGridGapPx,
            overviewRightRailGapPx: report.internalPadding.overviewRightRailGapPx,
        });
        console.table({
            scrollBody: report.internalPadding.scrollBody,
            overviewCanvas: report.internalPadding.overviewCanvas,
            headerTitleRow: report.internalPadding.headerTitleRow,
            headerTabsRow: report.internalPadding.headerTabsRow,
            headerLifecycleRow: report.internalPadding.headerLifecycleRow,
            entityDrawerScrollBody: report.internalPadding.entityDrawerScrollBody,
        });
    } else {
        console.log("No drawer panel open for padding audit.");
    }
    console.groupEnd();

    console.group("Recommendations");
    console.log(report.recommendations.summary);
    if (report.recommendations.note) console.warn(report.recommendations.note);
    console.table(report.recommendations.cssVarUpdates);
    console.groupEnd();

    console.groupEnd();
}

export const BOS_DRAWER_GEOMETRY_AUTO_REPORT_KEY = "alloy:bos-drawer-geometry-auto";

export type DrawerPanelAuditEntry = {
    index: number;
    selector: string;
    className: string;
    inlineStyle: string;
    dataAttributes: Record<string, string>;
    visible: boolean;
    rect: BosGeometryRect | null;
    computedPosition: string | null;
    computedLeft: string | null;
    computedRight: string | null;
    computedWidth: string | null;
    computedMaxWidth: string | null;
    computedTransform: string | null;
    computedZIndex: string | null;
    inlineWidth: string | null;
    inlineMaxWidth: string | null;
    inlineLeft: string | null;
    inlineTransform: string | null;
    hasBosRailClass: boolean;
    isDrawerTsxModalPanel: boolean;
};

export type DrawerPanelOwnershipAudit = {
    capturedAt: string;
    panelCount: number;
    visiblePanelIndex: number | null;
    panels: DrawerPanelAuditEntry[];
    htmlInlineCssVars: {
        computedLeft: string | null;
        computedWidth: string | null;
        computedRight: string | null;
        availableWidth: string | null;
        bosOverlayEffectiveWidth: string | null;
        bosOverlayWidth: string | null;
    };
    widthVarResolvesOnPanel: boolean;
    widthVarValuePx: number | null;
    computedMatchesCssVar: boolean | null;
};

/** Live-route drawer panel ownership audit — which element owns width/position. */
export function auditDrawerPanelOwnership(): DrawerPanelOwnershipAudit {
    const panels = Array.from(document.querySelectorAll(".adminv2-drawer-modal-panel"));
    const root = document.documentElement;
    const cssVarWidth = readCssVar(DRAWER_COMPUTED_WIDTH_CSS_VAR);
    const cssVarWidthPx = parsePx(cssVarWidth);

    const entries: DrawerPanelAuditEntry[] = panels.map((el, index) => {
        const node = el as HTMLElement;
        const rect = snapshotRect(el);
        const cs = getComputedStyle(el);
        const visible = rect != null && rect.width > 0 && rect.height > 0;
        const dataAttributes: Record<string, string> = {};
        for (const attr of [
            "data-adminv2-drawer",
            "data-adminv2-record-modal",
            "data-adminv2-record-modal-tone",
            "data-drawer-runtime",
        ]) {
            const v = node.getAttribute(attr);
            if (v != null) dataAttributes[attr] = v;
        }
        return {
            index,
            selector: ".adminv2-drawer-modal-panel",
            className: node.className,
            inlineStyle: node.style.cssText,
            dataAttributes,
            visible,
            rect,
            computedPosition: cs.position,
            computedLeft: cs.left,
            computedRight: cs.right,
            computedWidth: cs.width,
            computedMaxWidth: cs.maxWidth,
            computedTransform: cs.transform,
            computedZIndex: cs.zIndex,
            inlineWidth: node.style.width || null,
            inlineMaxWidth: node.style.maxWidth || null,
            inlineLeft: node.style.left || null,
            inlineTransform: node.style.transform || null,
            hasBosRailClass: node.classList.contains("adminv2-drawer-modal-panel--bos-rail"),
            isDrawerTsxModalPanel:
                node.getAttribute("data-adminv2-record-modal") === "true"
                && node.getAttribute("data-adminv2-drawer") === "true",
        };
    });

    const visiblePanelIndex = entries.findIndex((e) => e.visible);
    const visibleEntry = visiblePanelIndex >= 0 ? entries[visiblePanelIndex] : null;
    const computedWidthPx = visibleEntry ? parsePx(visibleEntry.computedWidth ?? undefined) : null;

    return {
        capturedAt: new Date().toISOString(),
        panelCount: panels.length,
        visiblePanelIndex: visiblePanelIndex >= 0 ? visiblePanelIndex : null,
        panels: entries,
        htmlInlineCssVars: {
            computedLeft: readCssVar(DRAWER_COMPUTED_LEFT_CSS_VAR),
            computedWidth: cssVarWidth,
            computedRight: readCssVar(DRAWER_COMPUTED_RIGHT_CSS_VAR),
            availableWidth: readCssVar(DRAWER_AVAILABLE_WIDTH_CSS_VAR),
            bosOverlayEffectiveWidth: readCssVar("--adminv2-bos-overlay-effective-width"),
            bosOverlayWidth: readCssVar(BOS_OVERLAY_WIDTH_CSS_VAR),
        },
        widthVarResolvesOnPanel:
            visibleEntry?.inlineWidth?.includes("var(--adminv2-drawer-computed-width)") ?? false,
        widthVarValuePx: cssVarWidthPx,
        computedMatchesCssVar:
            cssVarWidthPx != null && computedWidthPx != null ?
                Math.abs(cssVarWidthPx - computedWidthPx) <= 2
            :   null,
    };
}

export type DrawerWidthProbeResult = {
    probeWidthPx: number;
    before: BosGeometryRect | null;
    after: BosGeometryRect | null;
    beforeComputedWidth: string | null;
    afterComputedWidth: string | null;
    cssVarAfter: string | null;
    visibleWidthChanged: boolean;
    deltaWidthPx: number | null;
};

function forceDrawerPanelLayout(panel: HTMLElement | null): void {
    if (!panel) return;
    void panel.offsetWidth;
    void panel.getBoundingClientRect();
}

/**
 * Diagnostic probe — forces `--adminv2-drawer-computed-width` on `<html>` and reports whether
 * the visible `.adminv2-drawer-modal-panel` width changes. Pauses auto-measure for 500ms.
 */
export async function probeDrawerPanelWidth(probeWidthPx: number): Promise<DrawerWidthProbeResult> {
    const panel = pickFirstVisible(".adminv2-drawer-modal-panel") as HTMLElement | null;
    const before = snapshotRect(panel);
    const beforeComputedWidth = panel ? getComputedStyle(panel).width : null;

    const root = document.documentElement;
    setDrawerGeometryProbeActive(true, root);
    root.style.setProperty(DRAWER_COMPUTED_WIDTH_CSS_VAR, `${probeWidthPx}px`);
    if (before) {
        root.style.setProperty(DRAWER_COMPUTED_LEFT_CSS_VAR, `${before.left}px`);
    }

    forceDrawerPanelLayout(panel);

    await new Promise<void>((resolve) => {
        window.setTimeout(resolve, DRAWER_GEOMETRY_PROBE_HOLD_MS);
    });

    const after = snapshotRect(panel);
    const afterComputedWidth = panel ? getComputedStyle(panel).width : null;
    const cssVarAfter = readCssVar(DRAWER_COMPUTED_WIDTH_CSS_VAR);
    const afterWidthPx = after?.width ?? null;
    const beforeWidthPx = before?.width ?? null;

    return {
        probeWidthPx,
        before,
        after,
        beforeComputedWidth,
        afterComputedWidth,
        cssVarAfter,
        visibleWidthChanged:
            beforeWidthPx != null && afterWidthPx != null && beforeWidthPx !== afterWidthPx,
        deltaWidthPx:
            beforeWidthPx != null && afterWidthPx != null ? afterWidthPx - beforeWidthPx : null,
    };
}

export function restoreDrawerGeometryFromMeasurement(): DrawerWorkspaceBounds | null {
    setDrawerGeometryProbeActive(false);
    return measureAndApplyDrawerWorkspaceGeometry();
}

export function registerBosDrawerGeometryDiagnostics() {
    if (typeof window === "undefined") return;

    const report = (opts?: BosDrawerGeometryReportOptions) => {
        const result = collectBosDrawerGeometryReport({ log: true, ...opts });
        (window as Window & { __alloyBosDrawerGeometryLastReport?: BosDrawerGeometryReport }).__alloyBosDrawerGeometryLastReport =
            result;
        return result;
    };

    const w = window as Window & {
        __alloyReportBosDrawerGeometry?: typeof report;
        __alloyClearBosDrawerGeometryHighlights?: typeof clearBosDrawerGeometryHighlights;
        __alloyBosDrawerGeometryLastReport?: BosDrawerGeometryReport;
        __alloyAuditDrawerPanel?: typeof auditDrawerPanelOwnership;
        __alloyProbeDrawerWidth?: typeof probeDrawerPanelWidth;
        __alloyRestoreDrawerGeometry?: typeof restoreDrawerGeometryFromMeasurement;
    };

    w.__alloyReportBosDrawerGeometry = report;
    w.__alloyClearBosDrawerGeometryHighlights = clearBosDrawerGeometryHighlights;
    w.__alloyAuditDrawerPanel = () => {
        const audit = auditDrawerPanelOwnership();
        console.group("Drawer panel ownership audit");
        console.table(audit.htmlInlineCssVars);
        console.table(audit.panels);
        console.log("visiblePanelIndex:", audit.visiblePanelIndex);
        console.log("widthVarResolvesOnPanel:", audit.widthVarResolvesOnPanel);
        console.log("computedMatchesCssVar:", audit.computedMatchesCssVar);
        console.groupEnd();
        return audit;
    };
    w.__alloyProbeDrawerWidth = (px: number) => {
        const run = async () => {
            const result = await probeDrawerPanelWidth(px);
            console.group(`Drawer width probe @ ${px}px`);
            console.table({
                beforeWidth: result.before?.width,
                afterWidth: result.after?.width,
                deltaWidthPx: result.deltaWidthPx,
                visibleWidthChanged: result.visibleWidthChanged,
                cssVarAfter: result.cssVarAfter,
                beforeComputedWidth: result.beforeComputedWidth,
                afterComputedWidth: result.afterComputedWidth,
            });
            console.groupEnd();
            return result;
        };
        return run();
    };
    w.__alloyRestoreDrawerGeometry = () => {
        const bounds = restoreDrawerGeometryFromMeasurement();
        console.info("[alloy] Restored drawer geometry from live measurement", bounds);
        return bounds;
    };

    console.info(
        "[alloy] BOS drawer geometry diagnostics ready — __alloyReportBosDrawerGeometry(), __alloyAuditDrawerPanel(), __alloyProbeDrawerWidth(700), __alloyRestoreDrawerGeometry()"
    );
}
