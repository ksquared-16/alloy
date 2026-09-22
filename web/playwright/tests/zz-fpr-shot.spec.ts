import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const OUT = "../certification/financials";
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
test("mounted focus panel", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(10_000);
    for (const w of [1680, 1440, 1280]) {
        await page.setViewportSize({ width: w, height: 1050 });
        await page.waitForTimeout(3_000);
        await page.screenshot({ path: `${OUT}/fpr-current-${w}.png` });
        /* Overlap is the reported symptom, so measure it rather than eyeball it. */
        log(`OVERLAP_${w} ` + JSON.stringify(await page.evaluate(() => {
            const cards = [...document.querySelectorAll("[data-universal-card-key]")]
                .map((n) => ({ key: (n as HTMLElement).getAttribute("data-universal-card-key"), r: n.getBoundingClientRect() }))
                .filter((c) => c.r.height > 0);
            const hits: string[] = [];
            for (let i = 0; i < cards.length; i += 1) {
                for (let j = i + 1; j < cards.length; j += 1) {
                    const a = cards[i].r, b = cards[j].r;
                    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                    if (ox > 2 && oy > 2) hits.push(`${cards[i].key}~${cards[j].key} ${Math.round(ox)}x${Math.round(oy)}`);
                }
            }
            return { count: cards.length, overlaps: hits };
        })));
    }
    await page.setViewportSize({ width: 1680, height: 1050 });
    /* Anatomy, so a broken render can be told apart from a broken stylesheet. */
    log("ANATOMY " + JSON.stringify(await page.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-universal-card-key]")].map((n) => {
            const el = n as HTMLElement;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
                key: el.getAttribute("data-universal-card-key"),
                cls: el.className.toString().slice(0, 46),
                box: `${Math.round(r.width)}x${Math.round(r.height)}`,
                display: cs.display,
                border: cs.borderTopWidth,
                bg: cs.backgroundColor,
                radius: cs.borderTopLeftRadius,
            };
        });
        const sheets = document.styleSheets.length;
        let rules = 0;
        for (const sh of Array.from(document.styleSheets)) {
            try { rules += (sh as CSSStyleSheet).cssRules.length; } catch { /* cross-origin */ }
        }
        return { cards, sheets, rules };
    }), null, 1));
});
