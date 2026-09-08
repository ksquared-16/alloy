/**
 * Focus Panel command-surface containment — the contract, not the symptom.
 *
 * A command launched from a Process card is hosted by the Focus Panel's depth layer: the
 * canvas dims behind a scrim and the card holding the command is raised above it. Two facts
 * make that layer fail in a way an operator reads as "the command is disabled":
 *
 *   1. The scrim is decided by "is something raised?", and the raised CELL is decided by
 *      matching a key. When the key names no rendered cell those two answers disagree — the
 *      scrim paints and nothing is raised.
 *   2. A cell that is NOT raised while the depth layer is active gets `opacity` + `filter`.
 *      Both open a stacking context, so that cell's content cannot rise above the scrim at any
 *      z-index. Measured on Send Tour Invitation: `elementFromPoint` over the middle of the
 *      composer returned the scrim, and the cell carried `pointer-events: none` — the surface
 *      was not merely dim, it was inert.
 *
 * The request was `current_work`; the surface rendered `business_process`, its declared
 * successor. These assertions are about the resolution that reconciles the two, and about the
 * sizing term that keeps a raised card inside the panel rather than inside the window.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveRaisedCellKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";

const RENDERED = [
    "business_process",
    "financials",
    "attendance",
    "children",
    "household",
    "health_safety",
] as const;

describe("resolveRaisedCellKey — the grid only raises what it renders", () => {
    it("resolves a superseded card onto the cell that actually hosts it", () => {
        // `current_work` is `supersededBy: "business_process"` in the card registry, and the
        // Process card is where its command surface is hosted. This single mapping is the
        // difference between a raised composer and one buried under its own scrim.
        expect(resolveRaisedCellKey("current_work", RENDERED)).toBe("business_process");
    });

    it("returns the key unchanged when the surface renders it directly", () => {
        expect(resolveRaisedCellKey("household", RENDERED)).toBe("household");
    });

    it("never answers with a cell the surface does not render", () => {
        // The defect: the caller's resolver ends with `return activeCard`, so an unmatched
        // request came back as a key. A renderer that trusts it activates its depth layer for
        // a cell that does not exist.
        const answer = resolveRaisedCellKey("current_work", ["financials", "household"]);
        expect(answer).toBeNull();
    });

    it("answers null for no request, so the scrim has nothing to paint for", () => {
        expect(resolveRaisedCellKey(null, RENDERED)).toBeNull();
        expect(resolveRaisedCellKey(undefined, RENDERED)).toBeNull();
        expect(resolveRaisedCellKey("current_work", [])).toBeNull();
    });
});

const GRID_SRC = readFileSync(
    join(process.cwd(), "components/admin/focusPanel/FocusPanelCardGrid.tsx"),
    "utf8",
);
const RUNTIME_CSS = readFileSync(
    join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"),
    "utf8",
);

describe("the depth layer decides scrim and elevation from ONE reconciled key", () => {
    it("reconciles the requested key against the cells the grid renders", () => {
        expect(GRID_SRC).toMatch(/resolveRaisedCellKey\(/);
        // The reconciled value must shadow the prop, so no later use can read the raw request.
        expect(GRID_SRC).toMatch(/elevatedCellKey:\s*requestedElevatedCellKey/);
    });

    it("publishes the room a raised card actually has, measured at runtime", () => {
        expect(GRID_SRC).toMatch(/--alloy-os-fp-raised-available/);
        // Measured from the panel's scroll viewport, not assumed from a viewport unit.
        expect(GRID_SRC).toMatch(/getBoundingClientRect\(\)\.top/);
    });
});

describe("a raised card is capped by the visible panel, not only by the window", () => {
    /**
     * Every rule that caps a RAISED card's height has to carry the measured term. The one that
     * decides Send Tour Invitation is the Current Work rule below: it matches the base rule's
     * specificity and comes later in the file, so a measured term on the base rule alone changed
     * nothing — the card stayed 741px tall in a 711px panel, and at 760px of window height the
     * Send button sat 178px below the visible panel.
     */
    const RAISED_CAP_RULES = [
        // base elevated card
        /max-height: min\(75vh, calc\(100dvh - 64px\), var\(--alloy-os-fp-raised-available[^)]*\)\)/,
        // the three elevated modal classes
        /max-height: min\(76vh, calc\(100dvh - 64px\), var\(--alloy-os-fp-raised-available[^)]*\)\)/,
        /max-height: min\(84vh, calc\(100dvh - 56px\), var\(--alloy-os-fp-raised-available[^)]*\)\)/,
        /max-height: min\(96vh, calc\(100dvh - 28px\), var\(--alloy-os-fp-raised-available[^)]*\)\)/,
        // the Current Work rule that actually wins for an open command surface
        /max-height: min\(86vh, calc\(100dvh - 40px\), var\(--alloy-os-fp-raised-available[^)]*\)\)/,
    ];

    it.each(RAISED_CAP_RULES.map((r, i) => [i, r] as const))(
        "raised-card cap #%i carries the measured available height",
        (_i, pattern) => {
            expect(RUNTIME_CSS).toMatch(pattern);
        },
    );

    it("keeps the scrim below the raised card in the shared depth layer", () => {
        // Semantic layers, not arbitrary numbers: scrim 55 < raised card 60, both authored here.
        expect(RUNTIME_CSS).toMatch(/\.alloy-os-fp-depth-scrim\s*\{[^}]*z-index:\s*55/);
        expect(RUNTIME_CSS).toMatch(/z-index:\s*60;\s*\n\s*pointer-events:\s*auto/);
    });
});
