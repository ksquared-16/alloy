/** §7G — the same charge-level reversal rows, read on the Workspace host. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("7G-WS · reversal concept on Financials → Accounts", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(6000);
    await page.getByText(/Certhouse Family/).first().click();
    await page.waitForTimeout(9000);
    const rows = await page.evaluate(() => {
        const out: Array<Record<string, unknown>> = [];
        document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
            if (r.className.includes("--head")) return;
            out.push({
                chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
                cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
            });
        });
        return out;
    });
    const chargeLevel = rows.filter((r) => /reversal of charge/i.test(String((r.cells as string[]).join(" "))));
    const anyCredit = chargeLevel.filter((r) => /^Credit$/i.test(String((r.cells as string[])[1]).trim()));
    log(`workspace rows=${rows.length} chargeLevelReversals=${chargeLevel.length}`);
    for (const r of chargeLevel.slice(0, 4)) log(`  ${r.chargeId} | ${JSON.stringify(r.cells)}`);
    log(`stillCallingThemCredit=${anyCredit.length}`);
    // The reversed original must also read as reversed here.
    const orig = rows.find((r) => r.chargeId === "6005cf5f-24e8-4fd2-a624-0bc83496b977");
    log(`original 6005cf5f: ${JSON.stringify(orig?.cells)}`);
    writeFileSync(`${OUT}/b1-7g-ws.json`, JSON.stringify({ chargeLevel, orig, total: rows.length }, null, 2));
    await page.screenshot({ path: `${OUT}/b1-7g-ws.png` });
});
