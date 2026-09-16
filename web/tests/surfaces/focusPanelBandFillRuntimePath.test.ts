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

describe("the solved height reaches the visible card", () => {
    it("THE GATE: the cell inside the intrinsic node stretches its card", () => {
        // Without this the card sits at its natural height inside a stretched cell — the deployed
        // defect exactly: wrapper 325, card 232.
        expect(ruleFor(".alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell")).toMatch(
            /align-items:\s*stretch/,
        );
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
