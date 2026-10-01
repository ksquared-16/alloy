/**
 * P0-7.6 — STABLE GEOMETRY: a configured cell is always present, filled or reserved.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
 *
 * A previous measurement counted `article.alloy-os-ucard` and reported that only four of six
 * configured cards existed at FIRST_AUTHORITATIVE_FRAME, which looked like missing geometry and set
 * off a repair. It was a selector artifact: a RESERVED cell renders as `div.alloy-os-ucard`, so
 * counting only `article` counts FILLED cards and silently drops the reserved ones.
 *
 * Measured on deployed 31fb4b0c at the moment the panel appears: 6 cells, 4 filled, 2 reserved, and
 * the six keys are exactly the configured set. The geometry was complete the whole time; two cards
 * were holding their place with UNKNOWN content, which is the doctrine working, not failing.
 *
 * So this pins both halves — the invariant, and the shape that made it easy to misread.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const GRID = read("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
const code = GRID.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("a configured cell is never removed", () => {
    it("the grid returns a reserved cell rather than nothing when a card is not mountable", () => {
        /*
         * The branch that decides a cell's content must END in a rendered cell. If it can return
         * null/undefined for a configured key, configured geometry can disappear mid-surface, which
         * is the stable-geometry violation the whole contract exists to prevent.
         */
        const start = code.indexOf("if (!mountable || !baseModel)");
        expect(start).toBeGreaterThan(-1);
        // Up to the next `return` that is not the reserved cell — the branch must not be able to
        // fall through to nothing. Sized generously because the branch carries real reasoning.
        const branch = code.slice(start, start + 1200);
        expect(branch).toContain("<ReservedFocusPanelCell");
        // An absent readiness key must default to reserved, not to "drop the cell".
        expect(code).toContain('cardReadiness.get(typeKey) ?? "reserved"');
    });

    /*
     * The window is "inside this component", and a character count is only a proxy for it. The cell
     * grew a key, a readiness, a subject and a settled reason — each with the reasoning that earns
     * it — and a 1,200-character window silently stopped reaching the JSX, so two guards failed
     * without anything they guard having changed. Bounded at the component that follows instead, so
     * the window tracks the component rather than its length.
     */
    const RESERVED_CELL = (() => {
        const from = GRID.indexOf("function ReservedFocusPanelCell");
        const rest = GRID.slice(from);
        const next = rest.indexOf("\ntype Props");
        return next > 0 ? rest.slice(0, next) : rest;
    })();

    it("a reserved cell carries the same card class as a filled one, so geometry counts include it", () => {
        /*
         * This is the property the bad measurement tripped over. A reserved cell is
         * `div.alloy-os-ucard`; a filled card is `article.alloy-os-ucard`. Anything counting
         * configured GEOMETRY must select on the class, never on the tag.
         */
        expect(RESERVED_CELL).toContain('className="alloy-os-ucard"');
        expect(RESERVED_CELL).toContain("data-focus-panel-cell-reserved");
        // The window must actually be the component, not the rest of the file.
        expect(RESERVED_CELL.length).toBeLessThan(GRID.length / 2);
    });

    it("a reserved cell states the card's identity, so the frame reads as complete", () => {
        // It is not a blank rectangle: the cell names which card it belongs to while its detail
        // settles. That is what makes six cells an honest frame rather than four plus two gaps.
        expect(RESERVED_CELL).toContain("cardTitle(typeKey)");
    });
});
