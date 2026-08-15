import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    hasInnerDismissibleLayer,
    INLINE_EDIT_SELECTOR,
    TRANSIENT_POPUP_SELECTOR,
} from "@/lib/adminV2/runtime/focusPanel/escapeLayerOwnership";

/**
 * Escape must be consumed by the innermost open layer.
 *
 * Browser-measured on Firefly before the fix: with an AlloySelect menu, an inline field edit and
 * the expanded Children card all open, ONE Escape produced
 *   menu 1→0, editing 2→0, cardExpanded true→false
 * because the grid's listener is capture-phase on `window` and calls `stopImmediatePropagation`.
 */

/** Minimal stand-in for the pieces of Document this predicate reads. */
const docWith = (
    match: string | null,
    active: { closest: (sel: string) => unknown } | null = null,
): Document =>
    ({
        querySelector: (sel: string) => (match !== null && sel === match ? {} : null),
        activeElement: active,
    }) as unknown as Document;

const focusedOn = (sel: string) => ({ closest: (q: string) => (q === sel ? {} : null) });

describe("the grid yields Escape to an inner layer", () => {
    it("yields while a platform menu is open", () => {
        expect(hasInnerDismissibleLayer(docWith(TRANSIENT_POPUP_SELECTOR))).toBe(true);
    });

    it("yields while a focused inline field editor is open", () => {
        expect(hasInnerDismissibleLayer(docWith(null, focusedOn(INLINE_EDIT_SELECTOR)))).toBe(true);
    });

    it("consumes Escape when only the card is open — dismissing elevation is still its job", () => {
        expect(hasInnerDismissibleLayer(docWith(null))).toBe(false);
    });

    it("does NOT yield to an unfocused inline editor, which could not act on the key", () => {
        // Escape is handled on the input's own onKeyDown; yielding to a blurred input would
        // leave the keypress doing nothing at all.
        expect(hasInnerDismissibleLayer(docWith(null, focusedOn(".something-else")))).toBe(false);
    });

    it("is safe when there is no document (SSR / teardown)", () => {
        expect(hasInnerDismissibleLayer(null)).toBe(false);
        expect(hasInnerDismissibleLayer(undefined)).toBe(false);
    });

    it("covers both platform popups and Radix menus in one owned selector", () => {
        expect(TRANSIENT_POPUP_SELECTOR).toContain('[role="listbox"]');
        expect(TRANSIENT_POPUP_SELECTOR).toContain('[role="menu"][data-state="open"]');
    });
});

describe("the grid's capture-phase handler consults the predicate before consuming", () => {
    const src = readFileSync(
        join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"),
        "utf8",
    )
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

    it("yields before preventDefault / stopImmediatePropagation, not after", () => {
        const handler = src.slice(src.indexOf('if (event.key !== "Escape") return;'));
        const yieldAt = handler.indexOf("hasInnerDismissibleLayer(document)");
        const stopAt = handler.indexOf("stopImmediatePropagation");
        expect(yieldAt).toBeGreaterThan(-1);
        expect(stopAt).toBeGreaterThan(-1);
        // Consuming first would make the yield unreachable for every inner layer.
        expect(yieldAt).toBeLessThan(stopAt);
    });

    it("still registers in the capture phase, which is what beats the drawer", () => {
        expect(src).toContain('window.addEventListener("keydown", onKey, true)');
    });
});
