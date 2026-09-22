/** Section 2B geometry: the ledger stayed dense and Section 1's repair survived. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-geometry2b";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

for (const width of [1280, 1440, 1680]) {
    test(`geometry ${width}`, async ({ page }) => {
        mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width, height: 1050 });
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);

        // SUMMARY first — it must stay aggregate.
        const summary = await page.evaluate(() => {
            const card = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
            const txt = card?.innerText ?? "";
            const clipped = Array.from(document.querySelectorAll(".alloy-os-billing__line-label"))
                .filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1)
                .map((e) => (e as HTMLElement).innerText.trim());
            return {
                saysAggregate: /DISCOUNTS & CREDITS/i.test(txt),
                leakedProvenance: /10% of |Ongoing|One-time|policy/i.test(txt),
                clippedLabels: clipped,
            };
        });
        await page.screenshot({ path: `${OUT}/summary-${width}.png` });

        await page.getByRole("button", { name: /^Details$/ }).first().click();
        await page.waitForTimeout(8000);
        await page.screenshot({ path: `${OUT}/details-${width}.png` });

        const ledger = await page.evaluate(() => {
            const cell = (cls: string) => Array.from(document.querySelectorAll(`[class*='billingdetail__${cls}']`)).slice(0, 40);
            const measure = (cls: string) => {
                const els = cell(cls) as HTMLElement[];
                if (!els.length) return null;
                const widths = els.map((e) => Math.round(e.getBoundingClientRect().width));
                const clipped = els.filter((e) => e.scrollWidth > e.clientWidth + 1).length;
                return { n: els.length, maxW: Math.max(...widths), clipped };
            };
            const rows = Array.from(document.querySelectorAll("[class*='billingdetail__row']")) as HTMLElement[];
            let collisions = 0;
            for (let i = 1; i < Math.min(rows.length, 25); i += 1) {
                const a = rows[i - 1]!.getBoundingClientRect(); const b = rows[i]!.getBoundingClientRect();
                if (b.top < a.bottom - 1) collisions += 1;
            }
            return { desc: measure("desc"), gl: measure("gl"), type: measure("type"), rowCount: rows.length, collisions };
        });
        writeFileSync(`${OUT}/geom-${width}.json`, JSON.stringify({ summary, ledger }, null, 2));
        /* eslint-disable no-console */
        log(`\n=== ${width} ===`);
        log(`  SUMMARY aggregate=${summary.saysAggregate} leakedProvenance=${summary.leakedProvenance} clippedPositionLabels=${JSON.stringify(summary.clippedLabels)}`);
        log(`  LEDGER desc=${JSON.stringify(ledger.desc)} gl=${JSON.stringify(ledger.gl)} type=${JSON.stringify(ledger.type)} rows=${ledger.rowCount} collisions=${ledger.collisions}`);
        /* eslint-enable no-console */
    });
}
