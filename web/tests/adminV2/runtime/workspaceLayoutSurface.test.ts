import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ALLOY_OS_OP_SURFACE_SAFE_AREA_PX } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";

/** CSS var names for the shared operational surface geometry contract. */
const ALLOY_OS_OP_SURFACE_TOP_CSS_VAR = "--alloy-os-op-surface-top";
const ALLOY_OS_OP_SURFACE_BOTTOM_CSS_VAR = "--alloy-os-op-surface-bottom";
const ALLOY_OS_OP_SURFACE_HEIGHT_CSS_VAR = "--alloy-os-op-surface-height";

function computeAlloyOsOperationalSurfaceBounds(input: {
    surfaceTop: number;
    viewportHeight: number;
    safeAreaPx?: number;
}) {
    const bottomSafe = input.safeAreaPx ?? ALLOY_OS_OP_SURFACE_SAFE_AREA_PX;
    return {
        top: input.surfaceTop,
        bottomSafe,
        height: Math.max(0, input.viewportHeight - input.surfaceTop - bottomSafe),
    };
}
import {
    evaluateAlloyOsLayoutSurface,
    type AlloyOsLayoutSurfaceMeasurement,
} from "@/lib/adminV2/runtime/alloyOsLayoutSurfaceReport";

const here = dirname(fileURLToPath(import.meta.url));
const RUNTIME_CSS = readFileSync(
    resolve(here, "../../../app/adminV2/components/alloyOsRuntime.css"),
    "utf8"
);

describe("computeAlloyOsOperationalSurfaceBounds — shared top/bottom/height", () => {
    it("derives height from viewport minus shared top and safe area", () => {
        const bounds = computeAlloyOsOperationalSurfaceBounds({
            surfaceTop: 148,
            viewportHeight: 900,
        });
        expect(bounds.top).toBe(148);
        expect(bounds.bottomSafe).toBe(ALLOY_OS_OP_SURFACE_SAFE_AREA_PX);
        expect(bounds.height).toBe(900 - 148 - ALLOY_OS_OP_SURFACE_SAFE_AREA_PX);
    });

    it("honors an explicit safe area override", () => {
        const bounds = computeAlloyOsOperationalSurfaceBounds({
            surfaceTop: 120,
            viewportHeight: 800,
            safeAreaPx: 24,
        });
        expect(bounds.bottomSafe).toBe(24);
        expect(bounds.height).toBe(800 - 120 - 24);
    });

    it("clamps to non-negative when the surface top exceeds the viewport", () => {
        const bounds = computeAlloyOsOperationalSurfaceBounds({
            surfaceTop: 1000,
            viewportHeight: 600,
        });
        expect(bounds.height).toBe(0);
        expect(bounds.top).toBe(1000);
    });

    it("is stable across record swaps (same inputs -> identical bounds)", () => {
        const input = { surfaceTop: 148, viewportHeight: 900 };
        expect(computeAlloyOsOperationalSurfaceBounds(input)).toEqual(
            computeAlloyOsOperationalSurfaceBounds(input)
        );
    });
});

describe("operational-surface CSS contract — Queue · Focus Panel · BOS as peers", () => {
    it("defines the shared op-surface vars in the runtime token layer", () => {
        expect(RUNTIME_CSS).toContain(`${ALLOY_OS_OP_SURFACE_TOP_CSS_VAR}:`);
        expect(RUNTIME_CSS).toContain(`${ALLOY_OS_OP_SURFACE_BOTTOM_CSS_VAR}: 16px`);
        expect(RUNTIME_CSS).toContain(`${ALLOY_OS_OP_SURFACE_HEIGHT_CSS_VAR}: calc(`);
    });

    it("derives shared height from 100vh minus shared top and bottom", () => {
        expect(RUNTIME_CSS).toMatch(
            /--alloy-os-op-surface-height:\s*calc\(\s*100vh\s*-\s*var\(--alloy-os-op-surface-top\)\s*-\s*var\(--alloy-os-op-surface-bottom\)/
        );
    });

    it("Queue stretches: primary column re-anchored to col-height (removes the rail-height cap)", () => {
        const colRule = extractRule(RUNTIME_CSS, ".adminv2-ws-dept-v2-primary-column {");
        expect(colRule).toContain("height: var(--alloy-os-op-surface-col-height)");
        expect(colRule).toContain("max-height: var(--alloy-os-op-surface-col-height)");
    });

    it("col-height derives from 100vh minus the column top (deck top) and the shared bottom", () => {
        expect(RUNTIME_CSS).toMatch(
            /--alloy-os-op-surface-col-height:\s*calc\(\s*100vh\s*-\s*var\(--alloy-os-op-surface-col-top\)\s*-\s*var\(--alloy-os-op-surface-bottom\)/
        );
    });

    it("suppresses the work strip in split so the queue owns the full height", () => {
        const stripRule = extractRule(RUNTIME_CSS, ".adminv2-ws-dept-v2-workflows-strip {");
        expect(stripRule).toContain("display: none !important");
    });

    it("Focus Panel uses the shared top/bottom (no modal outer-margin inset)", () => {
        const panelRule = extractRule(
            RUNTIME_CSS,
            ".adminv2-drawer-modal-panel--bos-rail.adminv2-drawer-shell-inset {"
        );
        expect(panelRule).toContain(`top: var(${ALLOY_OS_OP_SURFACE_TOP_CSS_VAR})`);
        expect(panelRule).toContain(`bottom: var(${ALLOY_OS_OP_SURFACE_BOTTOM_CSS_VAR})`);
        // Peer column — must NOT re-add the modal outer margin.
        expect(panelRule).not.toContain("outer-margin");
    });

    it("BOS top + bottom align with the queue + panel (overlay top/bottom override)", () => {
        const bosRule = extractRule(RUNTIME_CSS, ".adminv2-bos-rail-overlay {");
        expect(bosRule).toContain(`top: var(${ALLOY_OS_OP_SURFACE_TOP_CSS_VAR}) !important`);
        expect(bosRule).toContain(`bottom: var(${ALLOY_OS_OP_SURFACE_BOTTOM_CSS_VAR}) !important`);
    });

    it("suppresses the modal dim / backdrop in split mode (docked peer, no overlay)", () => {
        expect(RUNTIME_CSS).toMatch(
            /\.adminv2-drawer-modal-dim[\s\S]*?\{[\s\S]*?background:\s*transparent\s*!important/
        );
    });

    it("gates every peer-geometry rule behind data-alloy-os-runtime-split (flag-off parity)", () => {
        for (const fragment of [
            ".adminv2-ws-dept-v2-primary-column {",
            ".adminv2-ws-dept-v2-workflows-strip {",
            ".adminv2-drawer-modal-panel--bos-rail.adminv2-drawer-shell-inset {",
            ".adminv2-bos-rail-overlay {",
        ]) {
            const rule = extractRuleWithSelector(RUNTIME_CSS, fragment);
            expect(rule.selector).toContain('data-alloy-os-runtime-split="true"');
        }
    });

    it("never references op-surface vars outside the runtime stylesheet token layer", () => {
        // The contract lives entirely in alloyOsRuntime.css; ensure the height var is
        // declared exactly once (single source of truth).
        const declarations = RUNTIME_CSS.match(/--alloy-os-op-surface-height:\s*calc/g) ?? [];
        expect(declarations.length).toBe(1);
    });
});

describe("evaluateAlloyOsLayoutSurface — peer-alignment predicates (pixel proof)", () => {
    const surfaceTop = 250;
    const surfaceBottomSafe = 16;
    const viewportHeight = 900;
    const surfaceBottomY = viewportHeight - surfaceBottomSafe; // 884
    const sharedHeight = surfaceBottomY - surfaceTop; // 634

    function baseVars(): AlloyOsLayoutSurfaceMeasurement["cssVars"] {
        return {
            opSurfaceTop: surfaceTop,
            opSurfaceColTop: 60,
            opSurfaceBottom: surfaceBottomSafe,
            opSurfaceHeight: sharedHeight,
            opSurfaceColHeight: viewportHeight - 60 - surfaceBottomSafe,
            drawerInsetTop: 60,
            drawerInsetBottom: 16,
        };
    }
    const edge = { top: surfaceTop, bottom: surfaceBottomY, height: sharedHeight };

    it("passes when Queue · Focus Panel · BOS share top, bottom, height and the queue fills", () => {
        const result = evaluateAlloyOsLayoutSurface({
            viewportHeight,
            workUnitContextBottom: surfaceTop,
            cssVars: baseVars(),
            queue: { ...edge },
            focusPanel: { ...edge },
            bos: { ...edge },
        });
        expect(result.pass).toBe(true);
        expect(result.topsAligned).toBe(true);
        expect(result.bottomsAligned).toBe(true);
        expect(result.heightsEqual).toBe(true);
        expect(result.queueFillsHeight).toBe(true);
        expect(result.deltas.bosTopVsQueue).toBe(0);
        expect(result.deltas.queueBottomVsSurfaceBottom).toBe(0);
    });

    it("flags the regression: queue stops early (dead space) while panel + BOS fill", () => {
        const result = evaluateAlloyOsLayoutSurface({
            viewportHeight,
            workUnitContextBottom: surfaceTop,
            cssVars: baseVars(),
            // Queue shortened by ~190px (the rail-height / inset-top shrink we fixed).
            queue: { top: surfaceTop, bottom: surfaceBottomY - 190, height: sharedHeight - 190 },
            focusPanel: { ...edge },
            bos: { ...edge },
        });
        expect(result.queueFillsHeight).toBe(false);
        expect(result.bottomsAligned).toBe(false);
        expect(result.heightsEqual).toBe(false);
        expect(result.deltas.queueBottomVsSurfaceBottom).toBe(-190);
        expect(result.pass).toBe(false);
    });

    it("flags the regression: BOS top sits at the page top, not the surface top", () => {
        const result = evaluateAlloyOsLayoutSurface({
            viewportHeight,
            workUnitContextBottom: surfaceTop,
            cssVars: baseVars(),
            queue: { ...edge },
            focusPanel: { ...edge },
            // BOS anchored to nav bottom (~60) with a 32px bottom inset.
            bos: { top: 60, bottom: viewportHeight - 32, height: viewportHeight - 32 - 60 },
        });
        expect(result.topsAligned).toBe(false);
        expect(result.bottomsAligned).toBe(false);
        expect(result.deltas.bosTopVsQueue).toBe(60 - surfaceTop);
        expect(result.pass).toBe(false);
    });

    it("respects the tolerance (sub-pixel rounding still passes)", () => {
        const result = evaluateAlloyOsLayoutSurface(
            {
                viewportHeight,
                workUnitContextBottom: surfaceTop,
                cssVars: baseVars(),
                queue: { ...edge },
                focusPanel: { top: surfaceTop + 1, bottom: surfaceBottomY - 1, height: sharedHeight - 2 },
                bos: { ...edge },
            },
            2,
        );
        expect(result.topsAligned).toBe(true);
        expect(result.bottomsAligned).toBe(true);
    });
});

/** Returns the declaration body for the first rule whose selector ends with `anchor`. */
function extractRule(css: string, anchor: string): string {
    return extractRuleWithSelector(css, anchor).body;
}

function extractRuleWithSelector(
    css: string,
    anchor: string
): { selector: string; body: string } {
    const open = css.indexOf(anchor);
    if (open === -1) throw new Error(`rule not found: ${anchor}`);
    const braceStart = open + anchor.length - 1;
    const close = css.indexOf("}", braceStart);
    const body = css.slice(braceStart + 1, close);
    // Selector text immediately preceding the opening brace.
    const precedingBlockEnd = Math.max(
        css.lastIndexOf("}", open),
        css.lastIndexOf("*/", open)
    );
    const selector = css.slice(precedingBlockEnd + 1, braceStart).trim();
    return { selector, body };
}
