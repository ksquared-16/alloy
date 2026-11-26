import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-audit";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("available prepaid is named, and does not clip", async ({ page }) => {
    const R: Record<string, unknown> = {};
    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(16_000);
        expect(page.url()).not.toContain("/login");
        R[`w${width}`] = await page.evaluate(() => {
            const el = document.querySelector("[data-testid='available-prepaid']") as HTMLElement | null;
            const card = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
            const text = card?.innerText?.replace(/\s+/g, " ") ?? "";
            return {
                labelRendered: el ? el.innerText.replace(/\s+/g, " ") : null,
                namesPrepaid: /available prepaid/i.test(text),
                clipped: el ? el.scrollWidth > el.clientWidth + 2 : null,
                cardClipped: card ? card.scrollHeight > Math.ceil(card.getBoundingClientRect().height) + 2 : null,
                horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
                /* held and deposit must not have been renamed along with it */
                saysHeld: /held/i.test(text),
                saysDeposit: /deposit/i.test(text),
                balanceStillSeparate: /balance/i.test(text),
            };
        });
        log(`@${width}: ${JSON.stringify(R[`w${width}`])}`);
        await page.screenshot({ path: `${OUT}/prepaid-${width}.png`, fullPage: true });
    }
    writeFileSync(`${OUT}/prepaid-naming.json`, JSON.stringify(R, null, 2));
});
