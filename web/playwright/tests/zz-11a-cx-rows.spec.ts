/**
 * Every tuition row in the queue with the amount beside it. The account card's aggregate is a
 * secondary read and I will not infer a row count from it — this reads the rows.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("tuition rows with amounts", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(9000);

    const out = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("button"))
            .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
            .filter((t) => /Tuition ·/.test(t));
        const buckets = Array.from(document.querySelectorAll("button"))
            .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
            .filter((t) => /^(Awaiting posting|Posted|Scheduled|Draft)\d*$/i.test(t));
        return { rows, buckets };
    });
    writeFileSync(`${OUT}/rows.json`, JSON.stringify(out, null, 2));
    log(`buckets: ${JSON.stringify(out.buckets)}`);
    log(`tuition rows (${out.rows.length}):\n${out.rows.join("\n")}`);
});
