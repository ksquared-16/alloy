import { test, type Page } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
test("ancestor walk", async ({ page }) => {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    /* Real nesting, bottom-up, so no assumption about which wrapper sits where survives. */
  for (const w of [1680, 1280]) {
    await page.setViewportSize({ width: w, height: 1050 });
    await page.waitForTimeout(2_500);
    for (const key of ["children", "attendance", "health_safety"]) {
    await page.evaluate((k) => { (window as unknown as { __k: string }).__k = k; }, key);
    log(`WALK_${w}_${key} ` + JSON.stringify(await page.evaluate(() => {
        const card = document.querySelector(`[data-universal-card-key="${(window as unknown as { __k: string }).__k}"]`) as HTMLElement | null;
        const out: string[] = [];
        let n: HTMLElement | null = card;
        for (let i = 0; n && i < 8; i += 1) {
            const cs = getComputedStyle(n);
            out.push([
                `${i}:${(n.className?.toString().split(/\s+/)[0] || n.tagName)}`,
                `h=${Math.round(n.getBoundingClientRect().height)}`,
                `css-h=${cs.height}`,
                `dir=${cs.flexDirection}`,
                `disp=${cs.display}`,
                `flex=${cs.flex}`,
                `alignItems=${cs.alignItems}`,
                `alignSelf=${cs.alignSelf}`,
            ].join(" "));
            n = n.parentElement;
        }
        return out;
    }), null, 1));
    }
  }
}); 
