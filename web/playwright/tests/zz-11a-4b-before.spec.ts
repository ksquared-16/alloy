/** §4B step 1 — locate the unassigned $18.00 consumable fee and record its BEFORE state. Read-only. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-4b";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function charges(p: Page) {
    await p.goto("/workspace", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000);
    await p.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await p.waitForTimeout(9000);
    await p.getByRole("tab", { name: /^Charges$/ }).or(p.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await p.waitForTimeout(7000);
}

test("4B-before · locate the $18 consumable fee", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await charges(page);

    const found: Record<string, unknown> = {};
    for (const tab of ["Awaiting posting", "Posted"]) {
        const t = page.getByRole("button", { name: new RegExp(`^${tab}\\d+`) }).first();
        if (await t.count()) { await t.click(); await page.waitForTimeout(5000); }
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll("button"))
            .map((b) => (b as HTMLElement).innerText.trim().replace(/\s+/g, " "))
            .filter((x) => /Certhouse Family|Kurzman/.test(x)));
        found[tab] = rows;
        log(`\n=== ${tab} (${rows.length}) ===\n${rows.join("\n")}`);
    }
    writeFileSync(`${OUT}/4b-rows.json`, JSON.stringify(found, null, 2));

    // The Focus Panel's own BEFORE reading of the same account.
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    const fp = await page.evaluate(() => {
        const body = document.body.innerText || "";
        const i = body.indexOf("Unassigned");
        return {
            unassignedNote: i >= 0 ? body.slice(Math.max(0, i - 120), i + 80).replace(/\n+/g, " / ") : null,
            consumable: /Consumable fee/i.test(body),
            rows: Array.from(document.querySelectorAll("[data-charge-id]")).map((e) => ({
                chargeId: e.getAttribute("data-charge-id"),
                text: (e.closest("[data-financials-row]") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").slice(0, 90)
                    ?? (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 90),
            })).slice(0, 30),
        };
    });
    writeFileSync(`${OUT}/4b-fp-before.json`, JSON.stringify(fp, null, 2));
    log(`\nFP unassigned: ${fp.unassignedNote}`);
    log(`FP consumable present: ${fp.consumable}`);
    await page.screenshot({ path: `${OUT}/4b-fp-before.png` });
});
