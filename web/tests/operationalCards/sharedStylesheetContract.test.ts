/**
 * THE SHARED CARD STYLESHEET MUST NOT CONTRADICT ITSELF.
 *
 * The approved cards render from one component and one stylesheet
 * (`app/adminV2/components/operationalCardsShared.css`), imported by both the design lab and the
 * production Focus Panel. That stylesheet was produced by EXTRACTING rules out of the lab's CSS,
 * and an extraction can go wrong in a way nothing else catches.
 *
 * It did. A stray rule arrived at the bottom of the extracted block:
 *
 *     .alloy-os-progression,
 *       .alloy-os-attendance__recent {
 *         grid-auto-flow: row;
 *       }
 *
 * Same specificity as the base rule, later in source order, so it won — and the Business Process
 * stage rail, which is `grid-auto-flow: column` by construction, rendered VERTICALLY in production.
 * The lab has no such rule; both selectors are `column` there. Nothing failed: the component was
 * right, the DOM was right, the class names were right, and the card was wrong.
 *
 * A width change hid it for a while. While the certification record had no configured process the
 * band rendered empty, so the inversion was invisible; it only appeared once the rail had stages to
 * stack. That is exactly why this is a stylesheet-level guard and not a screenshot.
 *
 * The rule enforced here: within the shared stylesheet, no selector may set the same property
 * twice, because a second declaration on an identical selector can only ever be a silent override
 * of the first — never an intentional cascade.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SHARED_CSS = join(process.cwd(), "app/adminV2/components/operationalCardsShared.css");
const LAB_CSS = join(process.cwd(), "app/dev/operational-card-lab/cardLab.css");

/** Selector text → the properties it declares, in source order. Comments and at-rules removed. */
function declarationsBySelector(css: string): Map<string, Array<{ prop: string; value: string }>> {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const out = new Map<string, Array<{ prop: string; value: string }>>();
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(withoutComments))) {
        const rawSelector = m[1]!.trim();
        // Skip at-rule preludes (@media, @supports); their inner rules are matched separately.
        if (rawSelector.startsWith("@") || !rawSelector) continue;
        // Normalise whitespace so a reformatted selector list is still the same selector list.
        const selector = rawSelector
            .split(",")
            .map((s) => s.trim().replace(/\s+/g, " "))
            .filter(Boolean)
            .sort()
            .join(", ");
        const decls = m[2]!
            .split(";")
            .map((d) => d.trim())
            .filter(Boolean)
            .map((d) => {
                const i = d.indexOf(":");
                return { prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
            })
            .filter((d) => d.prop && d.value);
        const prev = out.get(selector) ?? [];
        out.set(selector, [...prev, ...decls]);
    }
    return out;
}

describe("operational cards shared stylesheet", () => {
    it("never declares the same property twice for one selector", () => {
        const bySelector = declarationsBySelector(readFileSync(SHARED_CSS, "utf8"));
        const conflicts: string[] = [];
        for (const [selector, decls] of bySelector) {
            const seen = new Map<string, string>();
            for (const { prop, value } of decls) {
                const first = seen.get(prop);
                if (first !== undefined && first !== value) {
                    conflicts.push(`${selector} { ${prop}: ${first} } later overridden by { ${prop}: ${value} }`);
                }
                seen.set(prop, value);
            }
        }
        expect(conflicts).toEqual([]);
    });

    /*
     * A TRUNCATED BLOCK TAKES THE WHOLE APPLICATION DOWN, not just one card.
     *
     * The second extraction overshot its line range and copied a lab-only rule in half, leaving an
     * unclosed brace. `alloyOsRuntime.css` @imports this file, so the whole adminV2 stylesheet
     * failed to parse and every workspace route returned 500 — from a card stylesheet.
     *
     * Balanced braces is not a style rule; it is the difference between a broken card and a broken
     * product. Cheap to assert, and it catches every copy-a-range-wrong mistake at once.
     */
    it("is syntactically whole — every block closed", () => {
        const css = readFileSync(SHARED_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        const opens = (css.match(/\{/g) ?? []).length;
        const closes = (css.match(/\}/g) ?? []).length;
        expect({ opens, closes }).toEqual({ opens, closes: opens });
    });

    it("keeps the progression band horizontal, as the approved specimen renders it", () => {
        const shared = declarationsBySelector(readFileSync(SHARED_CSS, "utf8"));
        const flows = [...shared.entries()]
            .filter(([selector]) => selector.split(", ").includes(".alloy-os-progression"))
            .flatMap(([, decls]) => decls.filter((d) => d.prop === "grid-auto-flow").map((d) => d.value));

        // Exactly one answer, and it is `column`. Two answers is the bug this file exists for.
        expect(flows).toEqual(["column"]);
    });

    it("does not contradict the locked lab stylesheet on a shared selector's flow direction", () => {
        const shared = declarationsBySelector(readFileSync(SHARED_CSS, "utf8"));
        const lab = declarationsBySelector(readFileSync(LAB_CSS, "utf8"));

        const flowOf = (map: ReturnType<typeof declarationsBySelector>, target: string): string | null => {
            let found: string | null = null;
            for (const [selector, decls] of map) {
                if (!selector.split(", ").includes(target)) continue;
                for (const d of decls) if (d.prop === "grid-auto-flow") found = d.value;
            }
            return found;
        };

        for (const selector of [".alloy-os-progression", ".alloy-os-attendance__recent"]) {
            const labFlow = flowOf(lab, selector);
            const sharedFlow = flowOf(shared, selector);
            // A selector the shared sheet does not style at all is fine; a DIFFERENT answer is not.
            if (labFlow !== null && sharedFlow !== null) {
                expect(`${selector}: ${sharedFlow}`).toBe(`${selector}: ${labFlow}`);
            }
        }
    });
});
