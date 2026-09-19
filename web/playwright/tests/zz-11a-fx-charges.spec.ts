/**
 * The Charges queue, read as an operator sees it: how many awaiting posting, and what September's
 * tuition rows actually are. 9 draft charges stood before any generation. Idempotent runs mean
 * 9 + 1 monthly + 5 weekly = 15; duplicating runs mean 21.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the charges queue", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/charges.png`, fullPage: true });

    const out = await page.evaluate(() => {
        const text = (document.body.innerText || "");
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        const tuition = lines.filter((l) => /tuition/i.test(l));
        return {
            awaiting: /Awaiting posting\s*(\d+)/.exec(text)?.[1] ?? /(\d+)\s*Awaiting posting/.exec(text)?.[1] ?? null,
            posted: /Posted\s*(\d+)/.exec(text)?.[1] ?? null,
            tuitionLines: tuition,
            rowMarkers: Array.from(document.querySelectorAll("[data-charge-id]")).map((e) => ({
                id: e.getAttribute("data-charge-id"),
                text: (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 110),
            })),
            allLines: lines.slice(0, 120),
        };
    });
    writeFileSync(`${OUT}/charges.json`, JSON.stringify(out, null, 2));
    log(`awaiting=${out.awaiting} posted=${out.posted} chargeRows=${out.rowMarkers.length}`);
    log(`tuition lines (${out.tuitionLines.length}):\n${out.tuitionLines.join("\n")}`);
    log(`\nrows:\n${out.rowMarkers.map((r) => `${r.id} ${r.text}`).join("\n").slice(0, 3000)}`);
});
