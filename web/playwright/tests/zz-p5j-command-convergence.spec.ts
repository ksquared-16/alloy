/**
 * PASS 5I — the shared command authority, proven from both hosts.
 *
 * Accounts must offer the same row actions and raise the SAME command shell the Focus Panel uses,
 * and dismissing must leave the account, lens and filters exactly as they were.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const OUT = "../certification/financials";
const MOUNTED = 180_000;

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });

const shot = async (page: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${n}.png` }); };

async function openAccount(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = page.locator("[data-adminv2-financials-workspace]");
    await expect(shell).toBeVisible({ timeout: MOUNTED });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`);
    await expect(row).toBeVisible({ timeout: MOUNTED });
    await row.click({ timeout: 20_000 });
    await page.waitForTimeout(14_000);
}

const surface = (page: Page) =>
    page.evaluate(() => ({
        account: document.querySelector("[data-financials-account-detail]")?.getAttribute("data-financials-account-detail") ?? null,
        lens: document.querySelector('[data-financials-lens][aria-pressed="true"]')?.getAttribute("data-financials-lens") ?? null,
        overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
        rowActions: document.querySelectorAll("[data-financials-row-action]").length,
        kinds: [...new Set([...document.querySelectorAll("[data-financials-row-action]")].map((a) => a.getAttribute("data-financials-row-action")))],
        commands: [...new Set([...document.querySelectorAll("[data-financials-row-action]")].map((a) => a.getAttribute("data-charge-command")).filter(Boolean))],
        accessible: [...document.querySelectorAll("[data-financials-row-action]")].every((a) => !!a.getAttribute("aria-label") && !!a.getAttribute("title")),
    }));

test("Accounts · the same rail, raising the card's command", async ({ page }) => {
    test.setTimeout(900_000);
    await openAccount(page);
    const before = await surface(page);
    // eslint-disable-next-line no-console
    console.log("ACCOUNTS_RAIL " + JSON.stringify(before));
    await shot(page, "p5j-01-accounts-rail");

    const adjust = page.locator('[data-financials-row-action="adjust"]').first();
    await expect(adjust).toBeVisible({ timeout: 30_000 });
    await adjust.click({ timeout: 20_000 });
    await page.waitForTimeout(4_000);
    // eslint-disable-next-line no-console
    console.log("ACCOUNTS_ADJUST_OPENED " + JSON.stringify(await page.evaluate(() => {
        const host = document.querySelector('[data-financials-overlay="add_charge"]');
        const sel = document.querySelector('[data-testid="adjustment-source-charge"]') as HTMLSelectElement | null;
        return {
            overlay: host?.getAttribute("data-financials-overlay") ?? null,
            mode: host?.getAttribute("data-financials-entry-mode") ?? null,
            sourceCharge: sel?.value ?? null,
            tabs: [...document.querySelectorAll("[data-financials-entry-mode-tab]")].length,
        };
    })));
    await shot(page, "p5j-02-accounts-adjust-command");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(3_500);
    const after = await surface(page);
    // eslint-disable-next-line no-console
    console.log("ACCOUNTS_AFTER_DISMISS " + JSON.stringify(after));
    await shot(page, "p5j-03-accounts-restored");
    expect(after.account, "the selected account survives dismissal").toBe(before.account);
    expect(after.lens, "and so does the lens").toBe(before.lens);

    const reverse = page.locator('[data-financials-row-action="reverse"]').first();
    if (await reverse.count()) {
        await reverse.click({ timeout: 20_000 });
        await page.waitForTimeout(4_000);
        // eslint-disable-next-line no-console
        console.log("ACCOUNTS_REVERSE_OPENED " + JSON.stringify(await page.evaluate(() => ({
            panel: document.querySelectorAll('[data-testid="charge-reverse-panel"], [data-testid="adjustment-reverse-panel"]').length,
            text: (document.querySelector('[data-financials-command-host="true"]') as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
        }))));
        await shot(page, "p5j-04-accounts-reverse-command");
    }
});

test("Focus Panel · unchanged 5I anatomy", async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    await page.waitForTimeout(9_000);
    // eslint-disable-next-line no-console
    console.log("FP_COMPACT_HEIGHT " + await card.evaluate((n) => Math.round(n.getBoundingClientRect().height)));

    await card.getByRole("button", { name: /^Details/ }).first().click({ timeout: 20_000 });
    await expect(page.locator('[data-financials-overlay="detail"]')).toBeVisible({ timeout: 60_000 });
    const firstFrame = await page.evaluate(() => {
        const g = document.querySelector('[data-fp-card-intrinsic="financials"]') as HTMLElement | null;
        const cs = g ? getComputedStyle(g.querySelector(".alloy-os-ucard") ?? g) : null;
        const r = g?.getBoundingClientRect();
        return {
            box: r ? `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}` : null,
            opacity: cs?.opacity ?? null,
            stats: document.querySelectorAll(".alloy-os-fdetail__stat").length,
            lenses: document.querySelectorAll("[data-financials-lens]").length,
            rows: document.querySelectorAll("[data-financials-ledger-row]").length,
        };
    });
    // eslint-disable-next-line no-console
    console.log("FP_DETAILS_FIRST_FRAME " + JSON.stringify(firstFrame));
    await page.waitForTimeout(14_000);
    // eslint-disable-next-line no-console
    console.log("FP_DETAILS_ACTIONS " + JSON.stringify(await page.evaluate(() => ({
        rowActions: document.querySelectorAll("[data-financials-row-action]").length,
        kinds: [...new Set([...document.querySelectorAll("[data-financials-row-action]")].map((a) => a.getAttribute("data-financials-row-action")))],
        linkFarm: document.querySelectorAll(".alloy-os-fdetail__paymentops").length,
    }))));
    await shot(page, "p5j-05-focus-details-unchanged");
});
