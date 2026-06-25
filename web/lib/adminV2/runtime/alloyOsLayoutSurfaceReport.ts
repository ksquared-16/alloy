/**
 * Alloy OS — System 1.5 operational-surface layout diagnostics.
 *
 * Pure measurement + evaluation for the Concept B peer-region contract: Queue · Focus Panel ·
 * BOS share one top Y and one bottom Y, each consuming the full operational-surface height. The
 * DOM collector ({@link collectAlloyOsLayoutSurfaceReport}) reads live element rects + emitted
 * CSS variables; the evaluator ({@link evaluateAlloyOsLayoutSurface}) is a pure function so the
 * peer-alignment predicates are unit-testable without a browser.
 */

export type LayoutSurfaceEdge = {
    /** Viewport-relative top Y (px). */
    top: number;
    /** Viewport-relative bottom Y (px). */
    bottom: number;
    /** bottom − top (px). */
    height: number;
};

export type AlloyOsLayoutSurfaceMeasurement = {
    /** Viewport height (px) — bottom alignment reference. */
    viewportHeight: number;
    /** Work Unit Context (control deck) bottom Y — the shared peer top. */
    workUnitContextBottom: number | null;
    /** Operational-surface anchors resolved from emitted CSS variables (px). */
    cssVars: {
        opSurfaceTop: number | null;
        opSurfaceColTop: number | null;
        opSurfaceBottom: number | null;
        opSurfaceHeight: number | null;
        opSurfaceColHeight: number | null;
        drawerInsetTop: number | null;
        drawerInsetBottom: number | null;
    };
    /** Measured peer edges (null when the region is not mounted). */
    queue: LayoutSurfaceEdge | null;
    focusPanel: LayoutSurfaceEdge | null;
    bos: LayoutSurfaceEdge | null;
};

export type AlloyOsLayoutSurfaceEvaluation = {
    /** Queue / Focus Panel / BOS share the same top Y (within tolerance). */
    topsAligned: boolean;
    /** Queue / Focus Panel / BOS share the same bottom Y (within tolerance). */
    bottomsAligned: boolean;
    /** Queue / Focus Panel / BOS share the same height (within tolerance). */
    heightsEqual: boolean;
    /** Queue bottom reaches the shared operational-surface bottom (no dead space below). */
    queueFillsHeight: boolean;
    /** All present peers satisfy tops + bottoms + heights + queue fill. */
    pass: boolean;
    /** Signed deltas vs the queue (px) for quick triage; null when a region is absent. */
    deltas: {
        panelTopVsQueue: number | null;
        bosTopVsQueue: number | null;
        panelBottomVsQueue: number | null;
        bosBottomVsQueue: number | null;
        queueBottomVsSurfaceBottom: number | null;
    };
    tolerancePx: number;
};

function within(a: number, b: number, tolerancePx: number): boolean {
    return Math.abs(a - b) <= tolerancePx;
}

/**
 * Pure peer-alignment evaluation. Regions that are absent (null) are skipped for the
 * cross-peer checks but recorded as null deltas. `queueFillsHeight` uses the surface bottom
 * (viewportHeight − opSurfaceBottom) when the bottom var is known, else the BOS/panel bottom.
 */
export function evaluateAlloyOsLayoutSurface(
    m: AlloyOsLayoutSurfaceMeasurement,
    tolerancePx = 2,
): AlloyOsLayoutSurfaceEvaluation {
    const { queue, focusPanel, bos } = m;

    const tops = [queue?.top, focusPanel?.top, bos?.top].filter(
        (v): v is number => typeof v === "number",
    );
    const bottoms = [queue?.bottom, focusPanel?.bottom, bos?.bottom].filter(
        (v): v is number => typeof v === "number",
    );
    const heights = [queue?.height, focusPanel?.height, bos?.height].filter(
        (v): v is number => typeof v === "number",
    );

    const topsAligned =
        tops.length >= 2 && tops.every((v) => within(v, tops[0], tolerancePx));
    const bottomsAligned =
        bottoms.length >= 2 && bottoms.every((v) => within(v, bottoms[0], tolerancePx));
    const heightsEqual =
        heights.length >= 2 && heights.every((v) => within(v, heights[0], tolerancePx));

    const surfaceBottom =
        m.cssVars.opSurfaceBottom != null
            ? m.viewportHeight - m.cssVars.opSurfaceBottom
            : (bos?.bottom ?? focusPanel?.bottom ?? null);

    const queueFillsHeight =
        queue != null && surfaceBottom != null
            ? within(queue.bottom, surfaceBottom, tolerancePx)
            : false;

    const deltas = {
        panelTopVsQueue:
            queue && focusPanel ? Math.round(focusPanel.top - queue.top) : null,
        bosTopVsQueue: queue && bos ? Math.round(bos.top - queue.top) : null,
        panelBottomVsQueue:
            queue && focusPanel ? Math.round(focusPanel.bottom - queue.bottom) : null,
        bosBottomVsQueue: queue && bos ? Math.round(bos.bottom - queue.bottom) : null,
        queueBottomVsSurfaceBottom:
            queue && surfaceBottom != null ? Math.round(queue.bottom - surfaceBottom) : null,
    };

    const pass = topsAligned && bottomsAligned && heightsEqual && queueFillsHeight;

    return {
        topsAligned,
        bottomsAligned,
        heightsEqual,
        queueFillsHeight,
        pass,
        deltas,
        tolerancePx,
    };
}

// ── DOM collection (browser only) ──────────────────────────────────────────────────────

const WORK_UNIT_CONTEXT_SELECTOR =
    '[data-ws-surface="work_unit"].adminv2-ws-wu-v2 .adminv2-ws-dept-v2-control-deck';
const QUEUE_SELECTOR =
    '[data-ws-surface="work_unit"].adminv2-ws-wu-v2 .adminv2-ws-dept-v2-lane-chrome--throughput-deck';
const FOCUS_PANEL_SELECTOR =
    "[data-alloy-os-focus-panel='true'], .adminv2-drawer-modal-panel--bos-rail";
const BOS_OVERLAY_SELECTOR = "[data-adminv2-bos-rail-overlay='true']";

function rectEdge(el: Element | null): LayoutSurfaceEdge | null {
    if (!el || typeof el.getBoundingClientRect !== "function") return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
    };
}

function readVarPx(name: string): number | null {
    if (typeof document === "undefined") return null;
    const root = document.documentElement;
    const inline = root.style.getPropertyValue(name).trim();
    const raw = inline || getComputedStyle(root).getPropertyValue(name).trim();
    if (!raw) return null;
    const match = raw.match(/^(-?\d+(?:\.\d+)?)px$/);
    return match ? Math.round(Number(match[1])) : null;
}

/** Reads live element rects + emitted CSS vars into a {@link AlloyOsLayoutSurfaceMeasurement}. */
export function measureAlloyOsLayoutSurface(): AlloyOsLayoutSurfaceMeasurement {
    const deck = document.querySelector(WORK_UNIT_CONTEXT_SELECTOR);
    return {
        viewportHeight: Math.round(window.innerHeight),
        workUnitContextBottom: deck ? Math.round(deck.getBoundingClientRect().bottom) : null,
        cssVars: {
            opSurfaceTop: readVarPx("--alloy-os-op-surface-top"),
            opSurfaceColTop: readVarPx("--alloy-os-op-surface-col-top"),
            opSurfaceBottom: readVarPx("--alloy-os-op-surface-bottom"),
            opSurfaceHeight: readVarPx("--alloy-os-op-surface-height"),
            opSurfaceColHeight: readVarPx("--alloy-os-op-surface-col-height"),
            drawerInsetTop: readVarPx("--adminv2-drawer-inset-top"),
            drawerInsetBottom: readVarPx("--adminv2-drawer-inset-bottom"),
        },
        queue: rectEdge(document.querySelector(QUEUE_SELECTOR)),
        focusPanel: rectEdge(document.querySelector(FOCUS_PANEL_SELECTOR)),
        bos: rectEdge(document.querySelector(BOS_OVERLAY_SELECTOR)),
    };
}

export type AlloyOsLayoutSurfaceReport = {
    capturedAt: string;
    measurement: AlloyOsLayoutSurfaceMeasurement;
    evaluation: AlloyOsLayoutSurfaceEvaluation;
};

export function collectAlloyOsLayoutSurfaceReport(
    options: { log?: boolean; tolerancePx?: number } = {},
): AlloyOsLayoutSurfaceReport {
    const measurement = measureAlloyOsLayoutSurface();
    const evaluation = evaluateAlloyOsLayoutSurface(measurement, options.tolerancePx ?? 2);
    const report: AlloyOsLayoutSurfaceReport = {
        capturedAt: new Date().toISOString(),
        measurement,
        evaluation,
    };
    if (options.log) logAlloyOsLayoutSurfaceReport(report);
    return report;
}

export function logAlloyOsLayoutSurfaceReport(report: AlloyOsLayoutSurfaceReport): void {
    const { measurement: m, evaluation: e } = report;
    /* eslint-disable no-console */
    console.group(
        `%cAlloy OS · operational surface — ${e.pass ? "PASS ✅" : "MISMATCH ❌"}`,
        `font-weight:600;color:${e.pass ? "#16a34a" : "#dc2626"}`,
    );
    console.table({
        "work unit context bottom Y": m.workUnitContextBottom,
        "op-surface top Y": m.cssVars.opSurfaceTop,
        "op-surface bottom Y (viewport − bottom)":
            m.cssVars.opSurfaceBottom != null ? m.viewportHeight - m.cssVars.opSurfaceBottom : null,
        "viewport height": m.viewportHeight,
    });
    console.table({
        queue: m.queue,
        focusPanel: m.focusPanel,
        bos: m.bos,
    });
    console.table({
        "--alloy-os-op-surface-top": m.cssVars.opSurfaceTop,
        "--alloy-os-op-surface-col-top": m.cssVars.opSurfaceColTop,
        "--alloy-os-op-surface-bottom": m.cssVars.opSurfaceBottom,
        "--alloy-os-op-surface-height": m.cssVars.opSurfaceHeight,
        "--alloy-os-op-surface-col-height": m.cssVars.opSurfaceColHeight,
        "--adminv2-drawer-inset-top": m.cssVars.drawerInsetTop,
        "--adminv2-drawer-inset-bottom": m.cssVars.drawerInsetBottom,
    });
    console.table({
        topsAligned: e.topsAligned,
        bottomsAligned: e.bottomsAligned,
        heightsEqual: e.heightsEqual,
        queueFillsHeight: e.queueFillsHeight,
        ...e.deltas,
    });
    console.groupEnd();
    /* eslint-enable no-console */
}
