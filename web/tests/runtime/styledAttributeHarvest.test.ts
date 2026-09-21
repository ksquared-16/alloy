/**
 * WHICH ATTRIBUTES DOES A STYLESHEET ACTUALLY SELECT ON?
 *
 * V2.1 treats an attribute as visible state when a live stylesheet selects on it. The harvester
 * read every "[" in a selector as the start of an attribute selector, so Tailwind arbitrary
 * variants — CLASS names containing escaped brackets, e.g. `.\[name\:redacted\]` — donated their
 * inner token to the styled-attribute set.
 *
 * Measured consequence on the deployed surface: `name` was scored as visible state, WU-04's late
 * removal of `name` from an INPUT counted as authoritative, and WU-04 appeared to own ~4.4s of
 * completion. Removing that attribute on the live page produced ZERO computed-style and ZERO
 * geometry difference.
 *
 * The repair strips CSS escapes before scanning. These gates hold BOTH directions: real attribute
 * selectors must still be harvested (under-classification is as bad as over-classification), and
 * escaped class tokens must not be.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PROBE = readFileSync(join(process.cwd(), "playwright/support/visibleCompletionProbe.ts"), "utf8");

/** The harvester's own logic, mirrored exactly so the gate tests the rule and not a paraphrase. */
function harvest(selectors: string[]): Set<string> {
    const out = new Set<string>();
    for (const rawSel of selectors) {
        const sel = rawSel.replace(/\\./g, "");
        const re = /\[\s*([A-Za-z_:][-\w:.]*)/g;
        let m = re.exec(sel);
        while (m !== null) {
            out.add(m[1].toLowerCase());
            m = re.exec(sel);
        }
    }
    return out;
}

describe("the harvester reads attribute selectors, not escaped class names", () => {
    it("does NOT harvest from a Tailwind arbitrary-variant class", () => {
        // The exact selector found on the deployed sheet.
        expect(harvest([".\\[name\\:redacted\\]"]).has("name")).toBe(false);
    });

    it("does not harvest from other escaped class tokens either", () => {
        const got = harvest([".\\[data-x\\]", ".w-\\[calc\\(100\\%-2rem\\)\\]", ".\\[&>*\\]\\:mt-2"]);
        expect([...got]).toEqual([]);
    });

    it("STILL harvests genuine attribute selectors — under-classification is equally wrong", () => {
        const got = harvest([
            'input[name="q"]',
            "[data-state]",
            'button[disabled]',
            '[aria-expanded="true"]',
            "[data-schedule-ready]",
        ]);
        for (const attr of ["name", "data-state", "disabled", "aria-expanded", "data-schedule-ready"]) {
            expect(got.has(attr), attr).toBe(true);
        }
    });

    it("harvests a real attribute selector sitting beside an escaped class", () => {
        // Stripping escapes must not eat the rest of the selector.
        expect([...harvest([".\\[x\\] [data-open]"])]).toEqual(["data-open"]);
    });

    it("handles nested and compound selectors", () => {
        const got = harvest(['.card:not(.\\[hide\\]) [data-ready="1"]', 'li[role="option"][aria-selected]']);
        expect(got.has("data-ready")).toBe(true);
        expect(got.has("role")).toBe(true);
        expect(got.has("aria-selected")).toBe(true);
        expect(got.has("hide")).toBe(false);
    });
});

describe("the probe carries the repair", () => {
    it("strips escapes before scanning", () => {
        expect(PROBE).toContain('rawSel.replace(/\\\\./g, "")');
    });

    it("no attribute is special-cased to dodge the metric", () => {
        // The fix must be a parsing rule. An ignore-list naming `name` would be the wrong repair.
        const harvestBlock = PROBE.slice(PROBE.indexOf("const styledAttributes"), PROBE.indexOf("NATIVE_VISIBLE_STATE"));
        expect(harvestBlock.length).toBeGreaterThan(200);
        expect(harvestBlock).not.toMatch(/ignore|exclude|skipAttr|!==\s*["'`]name["'`]/i);
    });

    it("the native visible-state positives are untouched", () => {
        for (const attr of ["disabled", "checked", "selected", "open", "hidden", "readonly"]) {
            expect(PROBE).toContain(`"${attr}"`);
        }
    });
});
