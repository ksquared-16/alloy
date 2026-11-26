/**
 * §1 — charge detail reads the arrangement applicable to THAT charge's subject.
 *
 * Navigation correction this probe establishes: a ledger row in ACCOUNTS never opens charge
 * detail. Its `[data-financials-row-action]` controls are commands — post, reverse, adjust,
 * resolveResponsibility, reallocateResponsibility — and `FinancialsChargeDetail` is mounted by the
 * CHARGES section instead, selected through `[data-financials-queue-row=<chargeId>]`.
 *
 * See web/playwright/FINANCIALS-NAVIGATION.md for the rest of the contract.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(420_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("charge detail arrangement by subject", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");

    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    await page.waitForTimeout(9000);
    await page.locator('[data-workspace-section-tab="charges"]').first().click({ force: true });
    await page.waitForTimeout(12_000);

    const queue = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-financials-queue-row]")).map((e) => ({
            chargeId: e.getAttribute("data-financials-queue-row"),
            text: (e as HTMLElement).innerText.replace(/\n+/g, " · "),
        })),
    );
    log(`queue rows: ${queue.length}`);
    for (const q of queue.slice(0, 10)) log(`  ${q.chargeId} · ${q.text}`);

    const pick = (who: RegExp) => queue.find((q) => who.test(q.text ?? ""));
    const targets = [
        { name: "Certa", row: pick(/Certa/) },
        { name: "Certb", row: pick(/Certb/) },
        { name: "Household (no child)", row: queue.find((q) => !/Cert[ab]/.test(q.text ?? "")) },
    ];

    const results: Record<string, unknown> = {};
    for (const t of targets) {
        if (!t.row) { results[t.name] = { missing: true }; log(`\n${t.name}: no specimen in the queue`); continue; }
        await page.locator(`[data-financials-queue-row="${t.row.chargeId}"]`).first().click({ force: true, timeout: 15_000 }).catch((e) => log(`click: ${e}`));
        await page.waitForTimeout(9000);
        results[t.name] = await page.evaluate(() => {
            const body = document.body.innerText || "";
            const grab = (label: RegExp) => {
                const i = body.search(label);
                return i < 0 ? null : body.slice(i, i + 260).replace(/\n+/g, " / ");
            };
            return {
                /* The panel's own scope marker, written by the product not inferred by the probe. */
                arrangementScope: document.querySelector("[data-financials-arrangement-scope]")?.getAttribute("data-financials-arrangement-scope") ?? null,
                hasConfigurePanel: Boolean(document.querySelector("[data-testid='responsibility-scope']")),
                responsibility: grab(/Responsib/i),
                posting: grab(/Billing period/i),
            };
        });
        log(`\n=== ${t.name} · ${t.row.text?.slice(0, 90)} ===`);
        log(JSON.stringify(results[t.name], null, 1));
    }
    await page.screenshot({ path: `${OUT}/charge-grain.png`, fullPage: true });
    writeFileSync(`${OUT}/charge-grain.json`, JSON.stringify({ queue: queue.length, results }, null, 2));
});
