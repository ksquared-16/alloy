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
import { readFileSync } from "node:fs";
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

    it("the solver itself is untouched — it was never the defect", () => {
        const solver = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/composition/focusPanelRowHeights.ts"), "utf8");
        expect(solver).toContain("if (band.areas.some((area) => !intrinsic.has(area.card))) continue;");
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
    const PROC_WRAPPER = ".alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell > .alloy-os-process";
    const PROC_CARD = `${PROC_WRAPPER} > .alloy-os-ucard`;

    it("THE PREMISE: Business Process really does wrap its UniversalCard, and is the only card that does", () => {
        // If this ever stops being true the defect is gone and so is the reason for the repair —
        // the reader should learn that here rather than from a mystery rule that matches nothing.
        const wrapperAt = BP.indexOf('className="alloy-os-process" data-process-card="true"');
        expect(wrapperAt, "ProcessCard renders the alloy-os-process wrapper").toBeGreaterThan(-1);
        expect(BP.indexOf("<UniversalCard"), "…and UniversalCard is rendered inside it").toBeGreaterThan(wrapperAt);
    });

    it("THE GATE: the wrapper is made to pass the height on, rather than left a block box", () => {
        const rule = ruleFor(PROC_WRAPPER);
        expect(rule, "the propagation rule must exist").not.toBe("");
        // A block container does not hand its height to a child; that is the whole defect.
        expect(rule).toMatch(/display:\s*flex/);
        expect(rule).toMatch(/flex-direction:\s*column/);
    });

    it("THE GATE: the painted card is made to TAKE the height, not merely be allowed to", () => {
        const rule = ruleFor(PROC_CARD);
        expect(rule, "the consumption rule must exist").not.toBe("");
        // In a column flex container height is the MAIN axis, so `align-items: stretch` would do
        // nothing here — growth is what consumes the band.
        expect(rule).toMatch(/flex:\s*1\s+1\s+auto/);
    });

    it("no pixel value is named, so any solved H propagates — 299, 325 or otherwise", () => {
        for (const rule of [ruleFor(PROC_WRAPPER), ruleFor(PROC_CARD)]) {
            expect(rule).not.toMatch(/\d+px/);
            expect(rule).not.toMatch(/299|325/);
        }
    });

    it("the repair is scoped to the solved grid — lanes, stack, standalone and the lab are untouched", () => {
        // Both new selectors are rooted at the intrinsic node, which only the solved-grid branch
        // renders. A bare `.alloy-os-process` rule would reach ProcessCard everywhere it mounts.
        for (const sel of [PROC_WRAPPER, PROC_CARD]) {
            expect(sel.startsWith(".alloy-os-fp-card-intrinsic >")).toBe(true);
        }
        const bare = CSS.indexOf("\n.alloy-os-process {");
        expect(bare, "no unscoped .alloy-os-process rule may exist").toBe(-1);
        const lab = readFileSync(join(process.cwd(), "app/dev/operational-card-lab/cardLab.css"), "utf8");
        expect(lab).not.toContain("alloy-os-fp-card-intrinsic");
    });

    it("the card component was still not modified to obtain the fill", () => {
        expect(BP).not.toMatch(/h-full|height:\s*["']100%|minHeight/);
    });

    it("the solver and the cell-stretch rule are untouched by this repair", () => {
        // Contract one and contract two keep their own owners. This slice changed neither.
        expect(winningAlignItemsForSolvedGridCell().value).toBe("stretch");
        const solver = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/composition/focusPanelRowHeights.ts"),
            "utf8",
        );
        expect(solver).not.toContain("alloy-os-process");
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
