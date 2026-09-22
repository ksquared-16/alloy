/**
 * REPAIR SLICE 9A — the solved band height must reach the VISIBLE CARD.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * `focusPanelRowHeightSolver.test.ts` passes, and has passed throughout, while the product was wrong:
 * measured on deployed staging, both wrappers carried the solved 325px, Financials' visible card was
 * 325px, and the Business Process card was **232px** — 93px of white space inside the Enrollment cell.
 * The solver was never the defect. **Testing a solver cannot certify the downstream application of its
 * result**, which is the same certification hole this programme has now hit at three different layers.
 *
 * So this test asserts the CSS CONTRACT OF THE RUNTIME PATH — the chain a card actually sits in:
 *
 *   [data-fp-grid-area]              solved height, assigned inline by the solver
 *     .alloy-os-fp-card-intrinsic    min-height: 100%  (the measured node)
 *       .alloy-os-focus-panel-grid__cell
 *         <card root>                ← this is what the operator sees
 *
 * The measured chain, from the deployed build, is recorded in `p09a-chain.json`.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"), "utf8");
const GRID = readFileSync(join(process.cwd(), "components/admin/focusPanel/FocusPanelCardGrid.tsx"), "utf8");

/** The declarations of one selector, as written. */
function ruleFor(selector: string): string {
    const i = CSS.indexOf(`\n${selector} {`);
    if (i < 0) return "";
    return CSS.slice(i, CSS.indexOf("}", i));
}

/**
 * Which `align-items` actually WINS for the solved-grid cell.
 *
 * Both competing selectors are two classes — specificity (0,2,0) — so the cascade is decided by
 * SOURCE ORDER. The previous version of this suite asserted only that the stretch declaration
 * EXISTED, and it did exist, matched the element, and lost: deployed acceptance measured computed
 * `align-items: flex-start` with the Business Process card at 232px inside its solved 325px wrapper.
 * A declaration is not an outcome. This resolves the order the browser would.
 */
function winningAlignItemsForSolvedGridCell(): { value: string | null; winner: string | null } {
    const competitors = [
        ".alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell",
        ".alloy-os-focus-panel-grid--composed .alloy-os-focus-panel-grid__cell",
    ];
    // Both match the solved-grid cell and both are (0,2,0); last one in the file wins.
    let winner: string | null = null;
    let value: string | null = null;
    for (const sel of competitors) {
        const rule = ruleFor(sel);
        const m = /align-items:\s*([a-z-]+)/.exec(rule);
        if (!m) continue;
        if (CSS.indexOf(`\n${sel} {`) >= (winner ? CSS.indexOf(`\n${winner} {`) : -1)) {
            winner = sel;
            value = m[1];
        }
    }
    return { value, winner };
}

describe("the solved height reaches the visible card", () => {
    it("THE GATE: stretch WINS the cascade for the solved-grid cell", () => {
        // Not "is the declaration present" — which was true while the product was broken — but
        // "which declaration does the browser apply".
        const { value, winner } = winningAlignItemsForSolvedGridCell();
        expect(winner).toBe(".alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell");
        expect(value).toBe("stretch");
    });

    it("the solved-grid rule is ordered AFTER the composed rule it must override", () => {
        const solved = CSS.indexOf("\n.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell {");
        const composed = CSS.indexOf("\n.alloy-os-focus-panel-grid--composed .alloy-os-focus-panel-grid__cell {");
        expect(solved).toBeGreaterThan(-1);
        expect(composed).toBeGreaterThan(-1);
        expect(solved).toBeGreaterThan(composed);
    });

    it("both selectors carry the same specificity, which is WHY order decides", () => {
        // Two class selectors each. Recorded so a future reader does not "fix" this by reordering
        // back and assuming specificity will save them.
        const classCount = (sel: string) => (sel.match(/\.[a-z-]+/g) ?? []).length;
        expect(classCount(".alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell")).toBe(2);
        expect(classCount(".alloy-os-focus-panel-grid--composed .alloy-os-focus-panel-grid__cell")).toBe(2);
    });

    it("THE GATE IT WAS MISSING: nothing later in the sheet takes the stretch back", () => {
        /*
         * The rule above existed and did not apply. `.alloy-os-focus-panel-grid--composed
         * .alloy-os-focus-panel-grid__cell` sets `align-items: flex-start` at the SAME specificity
         * and was written later, so the cascade handed the decision to file order and the card sat
         * at its natural height inside a cell that already carried the band — measured: cell 285,
         * card 262, computed flex-start.
         *
         * Asserting the rule's text could never catch that, which is this file's own lesson applied
         * to itself. So the order is asserted too: the solved-grid contract must have the last word.
         */
        const gate = ".alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell";
        const lanes = ".alloy-os-focus-panel-grid--composed .alloy-os-focus-panel-grid__cell";
        const lastGate = CSS.lastIndexOf(`\n${gate} {`);
        const lastLanes = CSS.lastIndexOf(`\n${lanes} {`);
        expect(lastGate, "the stretch contract is declared").toBeGreaterThan(-1);
        expect(lastLanes, "the lanes rule is declared").toBeGreaterThan(-1);
        expect(lastGate, "and it is declared after the equal-specificity rule that contradicts it")
            .toBeGreaterThan(lastLanes);
    });

    it("the wrapper still carries the solved height, and the intrinsic node still resolves against it", () => {
        expect(ruleFor(".alloy-os-fp-card-intrinsic")).toMatch(/min-height:\s*100%/);
        expect(GRID).toContain("height: `${boxOf.height}px`");
    });

    it("the cell itself still takes the band's room", () => {
        expect(ruleFor(".alloy-os-fp-card-intrinsic > *")).toMatch(/flex:\s*1 1 auto/);
    });
});

describe("no height is named, so any solved H propagates", () => {
    it("the repair names no pixel value — 325 or otherwise", () => {
        const rule = ruleFor(".alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell");
        expect(rule).not.toMatch(/\d+px/);
        expect(rule).not.toContain("325");
    });

    it("the chain carries height by inheritance only: inline solved height -> 100% -> stretch", () => {
        // Three links, none of them a constant. An arbitrary H assigned by the solver reaches the card
        // by the same path that 325 did.
        expect(GRID).toContain("height: `${boxOf.height}px`");          // 1. solver -> wrapper
        expect(ruleFor(".alloy-os-fp-card-intrinsic")).toMatch(/min-height:\s*100%/); // 2. wrapper -> intrinsic
        expect(ruleFor(".alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell"))
            .toMatch(/align-items:\s*stretch/);                          // 3. cell -> card
    });

    it("THE EQUALISING SOLVER IS GONE, AND MAY NOT COME BACK", () => {
        /*
         * This used to assert that the band solver was "untouched — it was never the defect".
         * That was true of the propagation repair and is no longer the contract: cross-column
         * height equalisation was retired outright (card-format doctrine §6), because a card in
         * columns 1-3 was being drawn at the height of a card in columns 9-12.
         *
         * A deleted module cannot be asserted about, so what is locked here is its ABSENCE —
         * including the import graph, so it cannot be quietly reintroduced beside the engine.
         */
        for (const gone of ["focusPanelRowHeights.ts", "focusPanelVisualBands.ts"]) {
            expect(
                existsSync(join(process.cwd(), "lib/adminV2/runtime/focusPanel/composition", gone)),
                `${gone} was retired; reintroducing it re-opens cross-column equalisation`,
            ).toBe(false);
        }
        const stack = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/useColumnAwareStack.ts"), "utf8");
        // The placement authority must hand the engine MEASUREMENTS, never a substituted height.
        expect(stack).toMatch(/resolveColumnAwareLayout\(\{\s*layout,\s*heights:\s*intrinsic/);
        expect(stack).not.toMatch(/import .*solveRowHeights/);
    });
});

describe("the lanes / stack compositions keep their natural height", () => {
    it("the composed-cell rule still says flex-start — that is correct for interlocking lanes", () => {
        expect(ruleFor(".alloy-os-focus-panel-grid--composed .alloy-os-focus-panel-grid__cell"))
            .toMatch(/align-items:\s*flex-start/);
    });

    it("the repair is scoped to a node ONLY the solved-grid branch renders", () => {
        // `.alloy-os-fp-card-intrinsic` is created once, in the grid branch. The lanes branch renders
        // `.alloy-os-fp-lane`, the stack `.alloy-os-fp-canvas--stack` — neither creates the intrinsic
        // node, so neither can be reached by the stretch above.
        expect((GRID.match(/alloy-os-fp-card-intrinsic/g) ?? []).length).toBe(1);
        expect(GRID).toContain("alloy-os-fp-canvas--lanes");
        expect(GRID).toContain("alloy-os-fp-lane alloy-os-fp-published-lane");
    });

    it("no standalone or design-lab usage can be reached — the lab never renders the intrinsic node", () => {
        const lab = readFileSync(join(process.cwd(), "app/dev/operational-card-lab/cardLab.css"), "utf8");
        expect(lab).not.toContain("alloy-os-fp-card-intrinsic");
    });
});

describe("the card's own content is unchanged", () => {
    it("no card component was modified to obtain the fill", () => {
        const bp = readFileSync(join(process.cwd(), "components/operationalCards/ProcessCard.tsx"), "utf8");
        expect(bp).not.toMatch(/h-full|height:\s*["']100%|minHeight/);
    });

    it("the fill is a box contract, not a content contract — nothing forces content to stretch", () => {
        const rule = ruleFor(".alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell");
        expect(rule).not.toMatch(/justify-content|flex-direction/);
    });
});

/**
 * ── THE THIRD CONTRACT: THE PAINTED CARD CONSUMES H (P0-7.5, Slice 9D) ──
 *
 * The suite above certifies that the CELL is told to stretch. That is a different claim from the
 * band height reaching the surface the operator sees, and the difference was worth 67.23px on
 * deployed `f30e3bb0f`: cell 299px, `.alloy-os-process` 299px, painted `article.alloy-os-ucard`
 * 231.77px. Every assertion in this file was green throughout.
 *
 * The rectangle claim belongs to `playwright/geometry/paintedSurface.spec.ts`, which measures it in
 * a real engine at arbitrary heights. What is certified HERE is what that fixture cannot certify
 * about itself: that the wrapper it reproduces is real, that `UniversalCard` genuinely sits inside
 * it, and that the propagation rule is scoped to the solved grid and names no pixel value.
 */
describe("the painted card consumes the band — the last hop", () => {
    const BP = readFileSync(join(process.cwd(), "components/operationalCards/ProcessCard.tsx"), "utf8");
    const HEALTH = readFileSync(join(process.cwd(), "components/admin/focusPanel/cards/HealthSafetyCard.tsx"), "utf8");
    const CHAIN = ".alloy-os-fp-card-intrinsic *:has(.alloy-os-ucard)";
    const CHAIN_GROWTH = `${CHAIN},\n.alloy-os-fp-card-intrinsic .alloy-os-ucard`;

    it("THE PREMISE, CORRECTED: Business Process is NOT the only card that wraps its UniversalCard", () => {
        /*
         * The rule this replaces was scoped to `.alloy-os-process` on a premise written directly
         * above it: "For every other card that child IS the painted article.alloy-os-ucard". The
         * premise was false when it was written, and THIS TEST IS WHERE IT SHOULD HAVE BEEN CAUGHT —
         * the old version of it asserted only that ProcessCard wraps, while its own title claimed
         * ProcessCard was the only card that does. A claim stated in a test name and never asserted
         * is not a claim.
         *
         * Measured on deployed dced5ba79 at 1440: health_safety band 640px, painted article 141.8px.
         */
        const bpWrapper = BP.indexOf('className="alloy-os-process" data-process-card="true"');
        expect(bpWrapper, "ProcessCard wraps").toBeGreaterThan(-1);
        expect(BP.indexOf("<UniversalCard"), "…with UniversalCard inside it").toBeGreaterThan(bpWrapper);

        // Health & Safety wraps too — twice — which is the shape the per-card rule could not reach.
        const healthWrapper = HEALTH.indexOf('className="alloy-os-health"');
        expect(healthWrapper, "HealthSafetyCard also wraps").toBeGreaterThan(-1);
        expect(HEALTH.indexOf("<UniversalCard"), "…with UniversalCard inside it").toBeGreaterThan(healthWrapper);
    });

    it("THE GATE: the propagation is stated over the CHAIN, not over a named card", () => {
        // A rule naming one card can only ever fix one card; the next wrapper reopens the defect.
        const rule = ruleFor(CHAIN);
        expect(rule, "the chain propagation rule must exist").not.toBe("");
        expect(rule).toMatch(/display:\s*flex/);
        expect(rule).toMatch(/flex-direction:\s*column/);
    });

    it("THE GATE: the painted card is made to TAKE the height, at any wrapping depth", () => {
        const rule = ruleFor(CHAIN_GROWTH);
        expect(rule, "the consumption rule must exist").not.toBe("");
        // In a column flex container height is the MAIN axis, so `align-items: stretch` would do
        // nothing here — growth is what consumes the band.
        expect(rule).toMatch(/flex:\s*1\s+1\s+auto/);
    });

    it("no card name survives in the propagation rule, so no future wrapper is left out", () => {
        for (const sel of [CHAIN, CHAIN_GROWTH]) {
            const rule = ruleFor(sel);
            expect(rule).not.toMatch(/alloy-os-process|alloy-os-health|alloy-os-financials|alloy-os-billing/);
        }
        // And the per-card rule it replaced is gone rather than left to rot beside it.
        expect(CSS).not.toContain(".alloy-os-focus-panel-grid__cell > .alloy-os-process {");
    });

    it("no pixel value is named, so any solved H propagates — 299, 325 or otherwise", () => {
        for (const rule of [ruleFor(CHAIN), ruleFor(CHAIN_GROWTH)]) {
            expect(rule).not.toMatch(/\d+px/);
            expect(rule).not.toMatch(/299|325/);
        }
    });

    it("the repair is scoped to the solved grid — lanes, stack, standalone and the lab are untouched", () => {
        // EVERY selector in the chain rule is rooted at the intrinsic node, which only the
        // solved-grid branch renders. This matters more now than it did for the per-card rule:
        // `*:has(.alloy-os-ucard)` is deliberately broad, so the root is the only thing keeping it
        // off the lanes, stack, standalone and design-lab mounts, where cards keep natural height.
        for (const sel of [CHAIN, ...CHAIN_GROWTH.split(",\n")]) {
            expect(sel.trim().startsWith(".alloy-os-fp-card-intrinsic ")).toBe(true);
        }
        const bare = CSS.indexOf("\n.alloy-os-process {");
        expect(bare, "no unscoped .alloy-os-process rule may exist").toBe(-1);
        const lab = readFileSync(join(process.cwd(), "app/dev/operational-card-lab/cardLab.css"), "utf8");
        expect(lab).not.toContain("alloy-os-fp-card-intrinsic");
    });

    it("the card component was still not modified to obtain the fill", () => {
        expect(BP).not.toMatch(/h-full|height:\s*["']100%|minHeight/);
    });

    it("the cell-stretch rule is untouched by this repair, and still has a job to do", () => {
        /*
         * The solver half of this assertion went with the solver. The cell-stretch half stands:
         * the wrapper is now the card's OWN intrinsic height rather than an equalised band, so
         * the chain must still deliver that height to the painted article — the propagation is
         * what makes "painted height == intrinsic height" true rather than merely intended.
         */
        expect(winningAlignItemsForSolvedGridCell().value).toBe("stretch");
        expect(ruleFor(CHAIN)).toMatch(/display:\s*flex/);
    });

    it("a browser gate owns the rectangle, and it identifies the card by PAINT, not by selector", () => {
        // The 9C false pass measured `[data-process-card='true']` — the transparent wrapper — and
        // reported the band height. The rectangle gate must refuse to do that.
        const spec = readFileSync(
            join(process.cwd(), "playwright/geometry/paintedSurface.spec.ts"),
            "utf8",
        );
        expect(spec).toContain("isPaintedSurface");
        expect(spec).toMatch(/opaqueBackground/);
        expect(spec).toMatch(/borderTopWidth/);
        // …and it must assert the wrapper is NOT painted, which is what makes it trap the mistake.
        expect(spec).toMatch(/processWrapper\.isPaintedSurface\)\.toBe\(false\)/);
    });
});
