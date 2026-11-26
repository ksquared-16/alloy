/**
 * DOES REMOVING `name` FROM AN INPUT CHANGE ANYTHING THE OPERATOR CAN SEE?
 *
 * V2.1 treats an attribute as visible state when a live stylesheet selects on it. WU-04's late
 * "authoritative" mutation is the removal of `name` from an INPUT, which is a form-field
 * identifier — so either a rule genuinely styles on it, or the classifier is over-counting.
 *
 * This inspects the ACTUAL matching rules and the RENDERED consequence rather than reasoning
 * about the attribute's usual meaning.
 */
import { test } from "@playwright/test";

test("name attribute adjudication", async ({ page }) => {
    await page.goto(process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads", {
        waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(Number(process.env.P076_SETTLE_MS || 9000));

    const out = await page.evaluate(() => {
        // 1. Every selector that mentions `name` as an attribute.
        const hits: string[] = [];
        const walk = (rules: CSSRuleList | undefined, depth: number) => {
            if (!rules || depth > 4) return;
            for (let i = 0; i < rules.length; i++) {
                const r = rules[i] as CSSStyleRule & { cssRules?: CSSRuleList };
                const sel = typeof r.selectorText === "string" ? r.selectorText : "";
                if (/\[\s*name\b/.test(sel)) hits.push(sel.slice(0, 160));
                if (r.cssRules) walk(r.cssRules, depth + 1);
            }
        };
        for (let i = 0; i < document.styleSheets.length; i++) {
            try { walk((document.styleSheets[i] as CSSStyleSheet).cssRules, 0); } catch { /* cross-origin */ }
        }

        // 2. The rendered consequence: take a real input, snapshot computed style, remove `name`,
        //    snapshot again, restore. If nothing differs, no rule is producing a visible result.
        const input = document.querySelector("input[name]") as HTMLInputElement | null;
        let diff: string[] = [];
        let tag = null as string | null;
        let nameVal = null as string | null;
        if (input) {
            tag = input.tagName;
            nameVal = input.getAttribute("name");
            const snap = (el: Element) => {
                const cs = getComputedStyle(el);
                const o: Record<string, string> = {};
                for (let i = 0; i < cs.length; i++) o[cs[i]] = cs.getPropertyValue(cs[i]);
                return o;
            };
            const before = snap(input);
            const box0 = input.getBoundingClientRect();
            input.removeAttribute("name");
            const after = snap(input);
            const box1 = input.getBoundingClientRect();
            for (const k of Object.keys(before)) if (before[k] !== after[k]) diff.push(`${k}: ${before[k]} -> ${after[k]}`);
            if (box0.width !== box1.width || box0.height !== box1.height) diff.push("geometry changed");
            if (nameVal !== null) input.setAttribute("name", nameVal);
        }
        return { hits, inputFound: !!input, tag, nameVal, diffCount: diff.length, diff: diff.slice(0, 8), inputsWithName: document.querySelectorAll("input[name]").length };
    });

    console.log(`[name-adj] selectorsMentioningName=${out.hits.length} inputsWithName=${out.inputsWithName} inputFound=${out.inputFound} tag=${out.tag} name=${out.nameVal}`);
    for (const h of out.hits.slice(0, 6)) console.log(`[name-sel] ${h}`);
    console.log(`[name-render] computedStyleDiffs=${out.diffCount} ${JSON.stringify(out.diff)}`);
});
