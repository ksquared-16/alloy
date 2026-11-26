/**
 * §8/§11 — the reduction's provenance, read from the existing Credits & adjustments representation.
 *
 * Not a second discount table: the same Focus Panel Details ledger that already states what decided
 * a reduction — concept, basis, the base it was taken on, and the child it belongs to.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-j21";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("discount provenance on the ledger", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20_000);
    const opened = page.getByRole("button", { name: /Details/, exact: false }).first();
    if (await opened.count()) { await opened.click(); await page.waitForTimeout(12_000); }
    await page.screenshot({ path: `${OUT}/prov.png`, fullPage: true });

    const out = await page.evaluate(() => {
        const text = document.body.innerText || "";
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        const idx = lines.findIndex((l) => /^Discount$/i.test(l));
        return {
            discountLines: lines.filter((l) => /discount|10%|sibling/i.test(l)).slice(0, 25),
            aroundFirstDiscount: idx >= 0 ? lines.slice(Math.max(0, idx - 3), idx + 12) : [],
            tuitionLines: lines.filter((l) => /\$185\.00|\$1,450\.00|\$18\.50|\$145\.00|\$166\.50|\$1,305\.00/.test(l)).slice(0, 20),
        };
    });
    writeFileSync(`${OUT}/prov.json`, JSON.stringify(out, null, 2));
    log(`discount-ish lines:\n${out.discountLines.join("\n")}`);
    log(`\naround the first Discount:\n${out.aroundFirstDiscount.join("\n")}`);
    log(`\nmoney lines:\n${out.tuitionLines.join("\n")}`);
});
