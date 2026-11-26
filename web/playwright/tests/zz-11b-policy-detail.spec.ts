/** §23 — what the policy detail states, per tab. The rail row is role="option", not a button. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const RATE = /10\s*%/;

test("the policy detail, per tab", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    const row = page.getByRole("option", { name: /Sibling discount/ }).first();
    const rowCount = await row.count();
    log(`rail rows named "Sibling discount": ${rowCount}`);
    const railRow = await row.innerText().catch(() => "");
    await row.click();
    await page.waitForTimeout(6000);
    const read = async (label: string) => {
        const t = await page.evaluate(() => {
            const pane = document.querySelector("[data-testid='policy-overview'],[data-testid='policy-rules'],[data-testid='policy-applies-to']");
            return (pane as HTMLElement | null)?.innerText?.replace(/\n+/g, " / ") ?? "(no pane)";
        });
        log(`${label}: ${t}`);
        return t;
    };
    const overview = await read("OVERVIEW");
    await page.screenshot({ path: `${OUT}/policy-overview.png`, fullPage: true });
    await page.getByRole("tab", { name: "Rules" }).click();
    await page.waitForTimeout(3000);
    const rules = await read("RULES");
    await page.getByRole("tab", { name: "Applies To" }).click();
    await page.waitForTimeout(3000);
    const appliesTo = await read("APPLIES TO");
    const out = {
        railRow: railRow.replace(/\n+/g, " / "),
        railRowStatesRate: RATE.test(railRow),
        overview, overviewStatesRate: RATE.test(overview),
        rules, rulesStatesRate: RATE.test(rules),
        appliesTo,
    };
    writeFileSync(`${OUT}/policy-detail.json`, JSON.stringify(out, null, 2));
    log(`\nRATE VISIBLE — rail: ${out.railRowStatesRate} · overview: ${out.overviewStatesRate} · rules: ${out.rulesStatesRate}`);
});
