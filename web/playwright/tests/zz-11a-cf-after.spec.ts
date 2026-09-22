/** §19/§20 — payer and responsibility after the allocation, read from the ledger row itself. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cf";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const TARGET = "907d1b64-09d5-4926-bed0-63d044c15441";

test("payer and responsibility after allocation", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(9000);
    /* The default lens may not show a settled row — ask for everything. */
    const all = page.getByRole("button", { name: /^All\b/ }).first();
    if (await all.count()) { await all.click(); await page.waitForTimeout(5000); }

    const read = await page.evaluate((target: string) => {
        const rows = Array.from(document.querySelectorAll(".alloy-os-billingdetail__row")).filter((r) => !r.className.includes("--head"));
        const find = (id: string) => rows.find((r) => r.querySelector(`[data-charge-id="${id}"]`))
            ?? rows.find((r) => (r as HTMLElement).innerText.includes(id));
        const row = find(target);
        const resp = row?.querySelector("[data-financials-responsibility]");
        const payRows = rows.filter((r) => /Payment/.test((r as HTMLElement).innerText));
        return {
            found: Boolean(row),
            responsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
            responsibilityText: (resp as HTMLElement | null)?.innerText?.trim().replace(/\s+/g, " ") ?? null,
            cells: row ? Array.from(row.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9) : null,
            payments: payRows.map((r) => Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9)),
            rowCount: rows.length,
        };
    }, TARGET);
    log(`ROWS=${read.rowCount} found=${read.found}`);
    log(`TARGET AFTER: responsibility=${read.responsibility} "${read.responsibilityText}"`);
    log(`TARGET CELLS: ${JSON.stringify(read.cells)}`);
    log(`PAYMENT ROWS: ${JSON.stringify(read.payments.slice(0, 3))}`);
    writeFileSync(`${OUT}/cf-after.json`, JSON.stringify(read, null, 2));
    await page.screenshot({ path: `${OUT}/cf-after.png` });
});
