/** §4B — find an UNASSIGNED obligation and read the assignment form. Discovery only; no write. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-batchA";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("S4B · locate an unassigned obligation", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);

    // Posted charges carry the interesting responsibility state; list what the tab offers.
    const posted = page.getByRole("button", { name: /^Posted\d+/ }).first();
    if (await posted.count()) { await posted.click(); await page.waitForTimeout(5000); }
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll("button"))
        .map((b) => (b as HTMLElement).innerText.trim().replace(/\s+/g, " "))
        .filter((t) => /Certhouse Family|Kurzman/.test(t)).slice(0, 25));
    log(`rows:\n${rows.join("\n")}`);
    writeFileSync(`${OUT}/s4b-rows.json`, JSON.stringify(rows, null, 2));

    // Open each until one reports no responsible party.
    for (const label of rows.slice(0, 8)) {
        const btn = page.getByRole("button", { name: label.slice(0, 45), exact: false }).first();
        if (!(await btn.count())) continue;
        await btn.click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(5000);
        const d = await page.evaluate(() => {
            const body = document.body.innerText || "";
            const i = body.search(/Manage responsibility/);
            return {
                slice: i >= 0 ? body.slice(Math.max(0, i - 420), i + 260).replace(/\n+/g, " / ") : null,
                unassigned: /No responsibility|not divided|Unassigned/i.test(body),
            };
        });
        log(`\n--- ${label.slice(0, 60)}\n    ${d.slice ?? "(no responsibility block)"}`);
        if (d.unassigned) log(`    *** UNASSIGNED CANDIDATE ***`);
    }
});
