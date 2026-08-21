/**
 * The configuration runtime's focus ring, and the rule that nearly ate it.
 *
 * **What happened.** `.config-runtime-input--with-leading-icon` was added to fix a placeholder
 * rendering underneath a search icon. It was written directly beneath this line:
 *
 *     .config-runtime-select:focus,
 *
 * which is the opening line of a GROUPED selector whose body sets the focus outline. A comment
 * between a grouped selector's lines does not separate them — only the brace does — so the new
 * declaration captured `.config-runtime-select:focus` and did two silent things across every
 * configuration surface in the product:
 *
 * 1. Every focused `<select>` gained `padding-left: 2.05rem`, so its text jumped on focus.
 * 2. Every `<select>` LOST its focus outline, because the selector that used to share the outline
 *    rule now belonged to the padding rule instead.
 *
 * No test could see it. The suites that read these files assert on *class names* and on colour
 * tokens; a keyboard focus ring silently disappearing from Financials, Programs and Access is not
 * something a class-name assertion can notice, and the browser certifications drive the mouse.
 *
 * **What is asserted here** is the property, not the formatting: whatever rule carries the focus
 * outline must carry BOTH selectors, and the leading-icon padding must not be one of them. That
 * survives reformatting, reordering and renaming of everything around it.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CSS_PATH = path.join(__dirname, "..", "..", "app/adminV2/settings/configurationRuntime.css");
const css = fs.readFileSync(CSS_PATH, "utf8");

/** Strip comments so a selector *named* in prose cannot be mistaken for a selector in force. */
const executable = css.replace(/\/\*[\s\S]*?\*\//g, " ");

/** Every `selectors { body }` pair, with comments already removed. */
function rules(): { selector: string; body: string }[] {
    const out: { selector: string; body: string }[] = [];
    for (const m of executable.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        out.push({ selector: m[1]!.trim().replace(/\s+/g, " "), body: m[2]!.trim() });
    }
    return out;
}

describe("the configuration runtime stylesheet is parsed, not assumed", () => {
    it("yields rules at all — a failed parse would make every assertion below vacuous", () => {
        const parsed = rules();
        expect(parsed.length).toBeGreaterThan(20);
        expect(parsed.some((r) => r.selector.includes(".config-runtime-input"))).toBe(true);
    });
});

describe("a focusable control keeps its focus ring", () => {
    const outlineRules = rules().filter((r) => /outline\s*:/.test(r.body) && !/outline\s*:\s*none/.test(r.body));

    it("the outline rule covers BOTH the select and the input", () => {
        // The regression: `.config-runtime-select:focus` silently left this rule when a new
        // declaration was inserted between the grouped selector's two lines.
        const covers = (sel: string) => outlineRules.some((r) => r.selector.includes(sel));
        expect(covers(".config-runtime-select:focus"), "focused selects have no focus outline").toBe(true);
        expect(covers(".config-runtime-input:focus"), "focused inputs have no focus outline").toBe(true);
    });

    it("no focusable control has its outline removed without a replacement", () => {
        // `:focus { outline: none }` paired with `:focus-visible { outline: … }` is the correct
        // modern pattern — it suppresses the ring for a mouse click and keeps it for a keyboard.
        // So a bare `outline: none` is only a defect when NOTHING else restores an affordance:
        // either in the same rule (box-shadow/border) or in a `:focus-visible` rule for the same
        // base selector. Rejecting the paired form would have pushed a real accessibility feature
        // out of the stylesheet to satisfy a test.
        const all = rules();
        const focusVisibleSelectors = all
            .filter((r) => /outline\s*:/.test(r.body) && !/outline\s*:\s*none/.test(r.body))
            .flatMap((r) => r.selector.split(","))
            .map((sel) => sel.trim())
            .filter((sel) => sel.includes(":focus-visible"));

        for (const rule of all) {
            if (!/outline\s*:\s*none/.test(rule.body)) continue;
            for (const sel of rule.selector.split(",").map((x) => x.trim())) {
                if (/box-shadow|border/.test(rule.body)) continue;
                const base = sel.replace(/:focus(-visible)?$/, "");
                expect(
                    focusVisibleSelectors.some((fv) => fv.replace(":focus-visible", "") === base),
                    `${sel} removes the outline and no :focus-visible rule restores it`,
                ).toBe(true);
            }
        }
    });
});

describe("the leading-icon padding applies to inputs that opt in, and to nothing else", () => {
    const paddingRules = rules().filter((r) => r.selector.includes(".config-runtime-input--with-leading-icon"));

    it("exists, and sets a left padding", () => {
        expect(paddingRules.length).toBe(1);
        expect(paddingRules[0]!.body).toMatch(/padding-left\s*:/);
    });

    it("is its own rule — it never shares a selector list with a focus state", () => {
        // This is the exact shape of the defect. Sharing a selector list with `:focus` means the
        // padding applies on focus only (text jumping) AND steals that selector from its own rule.
        const selector = paddingRules[0]!.selector;
        expect(selector, `${selector} groups the leading-icon padding with another selector`).toBe(
            ".config-runtime-input--with-leading-icon",
        );
        expect(selector).not.toMatch(/:focus/);
        expect(selector).not.toMatch(/,/);
    });

    it("wins against the base rule's padding shorthand by coming after it", () => {
        // A longhand only beats a shorthand of equal specificity by source order. If the class were
        // declared above `.config-runtime-input`'s `padding:` shorthand, the icon overlap returns.
        const base = executable.indexOf(".config-runtime-input {");
        const opt = executable.indexOf(".config-runtime-input--with-leading-icon");
        expect(base).toBeGreaterThan(-1);
        expect(opt).toBeGreaterThan(base);
    });
});
