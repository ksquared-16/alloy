/**
 * PASS 5H — THE MOUNTED PROOF.
 *
 * Every frame is taken from the running build against a real account, and every measurement that
 * accompanies one is read off the DOM rather than asserted from source.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
const OUT = "../certification/financials";
const MOUNTED = 180_000;

test.use({ storageState: STORAGE, baseURL: BASE });
test.describe.configure({ mode: "serial" });

const shot = async (page: Page, name: string) => {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}.png` });
};

async function openFocusPanel(page: Page) {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    await page.waitForTimeout(8_000);
    return card;
}

test("01-03 · the workspace account pane commits one shell", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = page.locator("[data-adminv2-financials-workspace]");
    await expect(shell).toBeVisible({ timeout: MOUNTED });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`);
    await expect(row).toBeVisible({ timeout: MOUNTED });
    await shot(page, "p5h-01-accounts-queue");

    await row.click();
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    const first = await card.evaluate((n) => {
        const r = n.getBoundingClientRect();
        return { h: Math.round(r.height), w: Math.round(r.width), account: n.getAttribute("data-financials-account"), reserved: n.getAttribute("data-financials-reserved") };
    });
    await shot(page, "p5h-02-account-first-frame");
    await page.waitForTimeout(12_000);
    const hydrated = await card.evaluate((n) => {
        const r = n.getBoundingClientRect();
        return { h: Math.round(r.height), w: Math.round(r.width), account: n.getAttribute("data-financials-account"), reserved: n.getAttribute("data-financials-reserved") };
    });
    await shot(page, "p5h-03-account-hydrated");
    // eslint-disable-next-line no-console
    console.log("ACCOUNT_SHELL first=" + JSON.stringify(first) + " hydrated=" + JSON.stringify(hydrated));
    // eslint-disable-next-line no-console
    console.log("ACCOUNT_CARD_COUNT " + (await page.locator('[data-financials-card="true"]').count()));
    expect(hydrated.h, "the shell commits one height").toBe(first.h);
});

test("04-06 · compact card, Details first frame, Details hydrated", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1680, height: 1050 });
    const card = await openFocusPanel(page);
    // eslint-disable-next-line no-console
    console.log("COMPACT " + JSON.stringify(await card.evaluate((n) => {
        const r = n.getBoundingClientRect();
        return {
            h: Math.round(r.height),
            commands: [...n.querySelectorAll("[data-financials-command]")].map((b) => b.getAttribute("data-financials-command")),
            nav: [...n.querySelectorAll("[data-financials-nav]")].map((b) => b.getAttribute("data-financials-nav")),
            labels: [...n.querySelectorAll("button")].map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean),
        };
    })));
    await shot(page, "p5h-04-compact-card");

    await card.getByRole("button", { name: /^Details/ }).first().click({ timeout: 15_000 });
    const detail = page.locator('[data-financials-overlay="detail"]');
    await expect(detail).toBeVisible({ timeout: 60_000 });
    const firstFrame = await page.evaluate(() => {
        const grid = document.querySelector('[data-fp-card-intrinsic="financials"]') as HTMLElement | null;
        return {
            shellH: grid ? Math.round(grid.getBoundingClientRect().height) : null,
            rows: document.querySelectorAll("[data-financials-ledger-row]").length,
            lenses: document.querySelectorAll("[data-financials-lens]").length,
            heads: document.querySelectorAll(".alloy-os-billingdetail__row--head").length,
        };
    });
    await shot(page, "p5h-05-details-first-frame");
    await page.waitForTimeout(18_000);
    const hydrated = await page.evaluate(() => {
        const grid = document.querySelector('[data-fp-card-intrinsic="financials"]') as HTMLElement | null;
        const scroll = document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null;
        return {
            shellH: grid ? Math.round(grid.getBoundingClientRect().height) : null,
            rows: document.querySelectorAll("[data-financials-ledger-row]").length,
            lenses: document.querySelectorAll("[data-financials-lens]").length,
            heads: document.querySelectorAll(".alloy-os-billingdetail__row--head").length,
            scrollH: scroll?.scrollHeight ?? null,
            clientH: scroll?.clientHeight ?? null,
        };
    });
    await shot(page, "p5h-06-details-hydrated");
    // eslint-disable-next-line no-console
    console.log("DETAILS first=" + JSON.stringify(firstFrame) + " hydrated=" + JSON.stringify(hydrated));
    expect(hydrated.shellH, "the Details shell commits one height").toBe(firstFrame.shellH);
});

test("07-09 · row actions, and no link farm", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1680, height: 1050 });
    const card = await openFocusPanel(page);
    await card.getByRole("button", { name: /^Details/ }).first().click({ timeout: 15_000 });
    await expect(page.locator('[data-financials-overlay="detail"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(10_000);

    const rowActions = await page.evaluate(() => ({
        reverse: document.querySelectorAll('[data-charge-command="charge.reverse"]').length,
        adjust: document.querySelectorAll('[data-charge-command="billing.adjust_account"]').length,
        post: document.querySelectorAll('[data-charge-command="charge.post"]').length,
        rowActions: document.querySelectorAll("[data-financials-row-action]").length,
        linkFarm: document.querySelectorAll(".alloy-os-fdetail__paymentops").length,
        filters: [...document.querySelectorAll('[data-testid^="financials-filter-"]')].map((el) => {
            const r = el.getBoundingClientRect();
            const v = el.querySelector(".alloy-select__value") as HTMLElement | null;
            const vr = v?.getBoundingClientRect();
            return {
                id: el.getAttribute("data-testid"),
                y: Math.round(r.y),
                w: Math.round(r.width),
                label: v?.innerText ?? null,
                clipped: v && vr ? v.scrollWidth > Math.ceil(vr.width) + 1 : null,
            };
        }),
    }));
    // eslint-disable-next-line no-console
    console.log("ROW_ACTIONS " + JSON.stringify(rowActions));
    await shot(page, "p5h-07-row-actions");
    expect(rowActions.linkFarm, "no footer link farm").toBe(0);

    const adjust = page.locator('[data-charge-command="billing.adjust_account"]').first();
    if (await adjust.count()) {
        await adjust.click({ timeout: 15_000 });
        await page.waitForTimeout(3_000);
        const bound = await page.evaluate(() => {
            const host = document.querySelector('[data-financials-overlay="add_charge"]');
            const sel = document.querySelector('[data-testid="adjustment-source-charge"]') as HTMLSelectElement | null;
            return {
                overlay: host?.getAttribute("data-financials-overlay") ?? null,
                mode: host?.getAttribute("data-financials-entry-mode") ?? null,
                sourceCharge: sel?.value ?? null,
            };
        });
        // eslint-disable-next-line no-console
        console.log("CONTEXTUAL_ADJUST " + JSON.stringify(bound));
        await shot(page, "p5h-08-contextual-adjust");
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(2_000);
    await shot(page, "p5h-09-after-escape");
});

test("10-12 · the unified entry command, both modes, and 1280x720", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1680, height: 1050 });
    const card = await openFocusPanel(page);
    const add = card.getByRole("button", { name: /^Add/ }).first();
    await add.click({ timeout: 15_000 });
    await expect(page.locator('[data-financials-overlay="add_charge"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2_500);
    // eslint-disable-next-line no-console
    console.log("ENTRY_CHARGE " + JSON.stringify(await page.evaluate(() => {
        const host = document.querySelector('[data-financials-overlay="add_charge"]');
        return {
            mode: host?.getAttribute("data-financials-entry-mode") ?? null,
            tabs: [...document.querySelectorAll("[data-financials-entry-mode-tab]")].map((t) => t.getAttribute("data-financials-entry-mode-tab")),
        };
    })));
    await shot(page, "p5h-10-add-charge-mode");

    const adjTab = page.locator('[data-financials-entry-mode-tab="adjustment"]');
    if (await adjTab.count()) {
        await adjTab.click({ timeout: 15_000 });
        await page.waitForTimeout(2_500);
        // eslint-disable-next-line no-console
        console.log("ENTRY_ADJUSTMENT " + JSON.stringify(await page.evaluate(() => {
            const host = document.querySelector('[data-financials-overlay="add_charge"]');
            return {
                mode: host?.getAttribute("data-financials-entry-mode") ?? null,
                panel: document.querySelectorAll('[data-testid="adjustment-panel"]').length,
            };
        })));
        await shot(page, "p5h-11-add-adjustment-mode");
    }

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(3_000);
    await shot(page, "p5h-12-1280x720");
});
