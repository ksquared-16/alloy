/**
 * WHICH SURFACE CONFIGURES `financial_policies`?
 *
 * The mounted proof found `/organization/financials?chapter=policies` authoring COMMERCIAL policies
 * — percentage/fixed discounts scoped to programs and plans. That is a different authority from
 * `financial_policies`, which owns proration, posting_review, billing_cadence, deposit and the new
 * due_date. This asks whether the financial registry is reachable at all, and where.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-mounted";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3112", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);

test("where financial_policies is authored", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/adminV2/settings/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    await page.screenshot({ path: `${OUT}/f1-settings-financials.png` });
    const text = (await page.evaluate(() => document.body.innerText || "")).slice(0, 12_000);
    const options = await page.locator("select option").allTextContents();
    writeFileSync(`${OUT}/settings-financials.txt`, `${page.url()}\n\n${text}\n\nOPTIONS:\n${options.join(" | ")}`);
    /* eslint-disable no-console */
    console.log(`URL: ${page.url()}`);
    console.log(`textLength=${text.length}`);
    console.log(`OPTIONS: ${options.join(" | ").slice(0, 900)}`);
    for (const t of ["Due date", "Proration", "Posting review", "Deposit", "Billing cadence"]) {
        console.log(`${options.some((o) => o.trim().toLowerCase() === t.toLowerCase()) ? "OK  " : "GAP "} ${t}`);
    }
    console.log(`--- TEXT ---\n${text.slice(0, 1500)}`);
    /* eslint-enable no-console */
});
