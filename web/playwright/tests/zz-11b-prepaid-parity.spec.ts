/**
 * §19/§20 — is positive available prepaid ACTUALLY absent from Financials → Accounts?
 *
 * The §0 inventory said it was, on the strength of `FinancialsAccountWorkspaceDetail` not
 * mentioning it. Reading further, that component states plainly that it carries NO summary because
 * the Financials card composed directly above it owns one — and that card renders `Available`
 * under `data-testid="available-prepaid"`, silent at zero.
 *
 * So the inventory may have named a gap that does not exist. This measures all three surfaces
 * before anything is built, because building a second prepaid line into a surface that already has
 * one is exactly the duplication the platform rule forbids.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const readPrepaid = () => ({
    nodes: Array.from(document.querySelectorAll('[data-testid="available-prepaid"]')).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
    balance: (() => {
        const t = document.body.innerText || "";
        const i = t.indexOf("Balance");
        return i < 0 ? null : t.slice(i, i + 40).replace(/\n+/g, " ").trim();
    })(),
});

test("prepaid across the three surfaces", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};

    // ── Focus Panel Summary ────────────────────────────────────────────────────────────────
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(22_000);
    out.summary = await page.evaluate(readPrepaid);
    await page.screenshot({ path: `${OUT}/prepaid-summary.png`, fullPage: true });

    // ── Focus Panel Details ────────────────────────────────────────────────────────────────
    const details = page.getByRole("button", { name: /Details/, exact: false }).first();
    if (await details.count()) { await details.click(); await page.waitForTimeout(16_000); }
    out.details = await page.evaluate(readPrepaid);
    await page.screenshot({ path: `${OUT}/prepaid-details.png`, fullPage: true });

    // ── Financials Workspace → Accounts ────────────────────────────────────────────────────
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const fin = page.getByRole("button", { name: /Financials — the financial work/ }).first();
    if (await fin.count()) { await fin.click(); await page.waitForTimeout(14_000); }
    const accounts = page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first();
    if (await accounts.count()) { await accounts.click(); await page.waitForTimeout(12_000); }
    // Open the household that holds unapplied money.
    const row = page.locator("button", { hasText: /Certhouse/ }).first();
    if (await row.count()) { await row.click(); await page.waitForTimeout(16_000); }
    out.accounts = await page.evaluate(() => ({
        ...(() => {
            const nodes = Array.from(document.querySelectorAll('[data-testid="available-prepaid"]')).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim());
            const t = document.body.innerText || "";
            const i = t.indexOf("Balance");
            return { nodes, balance: i < 0 ? null : t.slice(i, i + 40).replace(/\n+/g, " ").trim() };
        })(),
        accountCard: !!document.querySelector('[data-financials-account-card="true"]'),
        financialsCard: !!document.querySelector('[data-financials-card="true"]'),
    }));
    await page.screenshot({ path: `${OUT}/prepaid-accounts.png`, fullPage: true });

    writeFileSync(`${OUT}/prepaid-parity.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 1));
});
