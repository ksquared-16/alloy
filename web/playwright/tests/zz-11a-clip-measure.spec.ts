/** WHERE THE CLIPPING COMES FROM — measured, at several supported widths. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-clip";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

for (const width of [1280, 1440, 1680]) {
    test(`clipping at ${width}`, async ({ page }) => {
        mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width, height: 1050 });
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        await page.screenshot({ path: `${OUT}/clip-${width}.png` });
        const r = await page.evaluate(() => {
            const out: Array<Record<string, unknown>> = [];
            for (const el of Array.from(document.querySelectorAll(".alloy-os-billing__line-label"))) {
                const h = el as HTMLElement;
                const cs = getComputedStyle(h);
                const clipped = h.scrollWidth > h.clientWidth + 1;
                out.push({
                    text: h.innerText.trim(),
                    clipped,
                    scrollW: h.scrollWidth,
                    clientW: h.clientWidth,
                    overflow: cs.overflow,
                    textOverflow: cs.textOverflow,
                    whiteSpace: cs.whiteSpace,
                    parentW: Math.round((h.parentElement as HTMLElement).getBoundingClientRect().width),
                    zoneW: Math.round(((h.closest(".alloy-os-billing__zone") as HTMLElement) ?? h).getBoundingClientRect().width),
                });
            }
            return out;
        });
        writeFileSync(`${OUT}/clip-${width}.json`, JSON.stringify(r, null, 2));
        /* eslint-disable no-console */
        log(`\n=== ${width}px ===`);
        for (const l of r) {
            log(`  ${l.clipped ? "CLIPPED" : "ok     "} "${l.text}" scroll=${l.scrollW} client=${l.clientW} parent=${l.parentW} zone=${l.zoneW} overflow=${l.overflow} textOverflow=${l.textOverflow} ws=${l.whiteSpace}`);
        }
        /* eslint-enable no-console */
    });
}
