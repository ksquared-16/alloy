/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const COMPONENT = "components/workspace/AlloySelect.tsx";
const STYLES = "components/workspace/alloySelect.css";
const RUNTIME_CSS = "app/adminV2/components/alloyOsRuntime.css";

/**
 * ALLOYSELECT — presentation contract.
 *
 * Two defects motivated these assertions, both found by opening the control in a browser
 * rather than by reading it:
 *
 * 1. PORTABILITY. Every `.alloy-select__*` rule lived in `alloyOsRuntime.css`, which is
 *    imported only by the operator runtime shell. The configuration plane never loads it,
 *    so an AlloySelect in Settings rendered a styled trigger above a completely unstyled
 *    popup — no positioning, no surface, no elevation. That is what made call sites reach
 *    for a raw `<select>` or a local wrapper instead of the primitive.
 *
 * 2. BROWSER CHROME. The component moves real DOM focus onto the active option so screen
 *    readers follow the keyboard. The browser therefore painted its own focus ring — a
 *    hard blue rectangle — inside the one control that exists to keep OS chrome off the
 *    screen. `--active` had no rule anywhere in the repo, so the blue ring was the ONLY
 *    indication of keyboard position.
 *
 * Verified in the browser after the fix: the open menu computes background
 * rgb(255,255,255), option colour rgb(0,162,131) in Poppins, selected and keyboard-active
 * background rgba(0,162,131,0.1), and no focus outline.
 */
describe("AlloySelect presentation contract", () => {
    it("carries its own stylesheet, so it presents correctly wherever it is imported", () => {
        expect(read(COMPONENT)).toContain('import "./alloySelect.css"');
    });

    it("owns the base rules rather than borrowing them from the operator runtime shell", () => {
        const styles = read(STYLES);
        for (const rule of [
            ".alloy-select__list",
            ".alloy-select__trigger",
            ".alloy-select__option",
            ".alloy-select__value",
            ".alloy-select__chevron",
        ]) {
            expect(styles).toContain(rule);
        }
    });

    it("leaves only surface-scoped overrides in the runtime shell stylesheet", () => {
        // Any unscoped `.alloy-select` rule here means the base moved back and portability
        // silently regressed for every surface outside the runtime shell.
        const unscoped = read(RUNTIME_CSS)
            .split("\n")
            .filter((line) => /^\s*\.alloy-select/.test(line));
        expect(unscoped).toEqual([]);
    });

    it("marks keyboard position itself instead of leaving the browser focus ring", () => {
        const styles = read(STYLES);
        expect(styles).toMatch(/\.alloy-select__option--active\s*\{[^}]*background/);
        expect(styles).toMatch(/\.alloy-select__option:focus[^{]*\{[^}]*outline:\s*none/);
    });

    it("keeps the site-filter override in step with the keyboard marker", () => {
        // This override outranks the primitive's own rule. When it was written without
        // `--active`, arrowing the site filter showed no Alloy highlight at all.
        expect(read(RUNTIME_CSS)).toContain(
            "[data-adminv2-site-filter] .alloy-select__option--active",
        );
    });

    it("uses Bend Pine for selection, never a system colour", () => {
        const styles = read(STYLES);
        expect(styles).toMatch(/\.alloy-select__option--selected\s*\{[^}]*rgba\(0,\s*162,\s*131/);
        // System colour keywords resolve to whatever the OS decides — which is how the
        // browser blue got on screen in the first place.
        const declarations = styles.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(declarations).not.toMatch(/\b(Highlight|HighlightText|AccentColor|SelectedItem)\b/);
    });
});
