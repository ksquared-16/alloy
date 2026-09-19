/**
 * §3 — charge detail reads the arrangement applicable to THAT charge's subject.
 *
 * Navigation contract, corrected and recorded so the next probe does not rediscover it:
 *   sidebar  [data-adminv2-sidebar-modal-nav="financials"]  — click with force: the shell's own
 *            overlay intercepts a plain click, and the accessible name is the long title
 *   section  [data-workspace-section-tab="accounts"]        — the modal lands on Overview
 *   account  [data-financials-account-row=<customerId>]
 *   ledger   [data-financials-ledger-row=<key>]
 *
 * An empty surface here is far more often an expired QA session than a wrong selector: every
 * route silently redirects to /login, so the probe asserts it is not on /login before concluding.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(560_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("charge detail arrangement by subject", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    await page.waitForTimeout(9000);
    await page.locator('[data-workspace-section-tab="accounts"]').first().click({ force: true });
    await page.waitForTimeout(11_000);
    const first = page.locator("[data-financials-account-row]").first();
    await first.click({ force: true });
    await page.waitForTimeout(12_000);

    const rows = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-financials-ledger-row]")).map((e) => ({
            key: e.getAttribute("data-financials-ledger-row"),
            text: (e as HTMLElement).innerText.replace(/\n+/g, " · "),
        })),
    );
    const pick = (who: RegExp) => rows.find((r) => who.test(r.text ?? ""));
    const targets = [
        { name: "Certa", row: pick(/Certa Certhouse/) },
        { name: "Certb", row: pick(/Certb Certhouse/) },
        { name: "Household", row: pick(/· Household ·/) },
    ];
    const results: Record<string, unknown> = {};
    for (const t of targets) {
        if (!t.row) { results[t.name] = { missing: true }; continue; }
        await page.locator(`[data-financials-ledger-row="${t.row.key}"]`).first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(9000);
        results[t.name] = await page.evaluate(() => {
            const body = document.body.innerText || "";
            const i = body.search(/Responsib/i);
            return {
                /* The panel names the grain it is about, so the read-back is legible. */
                around: i < 0 ? null : body.slice(Math.max(0, i - 200), i + 500).replace(/\n+/g, " / "),
                scope: document.querySelector("[data-financials-arrangement-scope]")?.getAttribute("data-financials-arrangement-scope") ?? null,
                hasPanel: Boolean(document.querySelector("[data-testid='responsibility-scope']")),
            };
        });
        log(`\n=== ${t.name} (${t.row.text?.slice(0, 80)}) ===\n${JSON.stringify(results[t.name], null, 1)}`);
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(4000);
    }
    writeFileSync(`${OUT}/charge-grain.json`, JSON.stringify({ rows: rows.length, results }, null, 2));
});
