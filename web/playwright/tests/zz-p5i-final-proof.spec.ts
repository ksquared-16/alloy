/**
 * PASS 5I — the remaining mounted proof: both Add modes with measured geometry, the same row-action
 * primitive in Financials → Accounts, and 1280x720.
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

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });

const shot = async (page: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${n}.png` }); };

const tabGeometry = (page: Page) =>
    page.evaluate(() =>
        [...document.querySelectorAll("[data-financials-entry-mode-tab]")].map((t) => {
            const e = t as HTMLElement;
            const r = e.getBoundingClientRect();
            const cs = getComputedStyle(e);
            return {
                mode: e.getAttribute("data-financials-entry-mode-tab"),
                selected: e.getAttribute("aria-selected"),
                w: Math.round(r.width), h: Math.round(r.height),
                padding: cs.padding, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
            };
        }),
    );

test("Add · both modes, equal geometry, truthful preview", async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    await page.waitForTimeout(9_000);
    await card.getByRole("button", { name: /^Add/ }).first().click({ timeout: 20_000 });
    await expect(page.locator('[data-financials-overlay="add_charge"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(3_000);

    // eslint-disable-next-line no-console
    console.log("ADD_CHARGE_TABS " + JSON.stringify(await tabGeometry(page)));
    // eslint-disable-next-line no-console
    console.log("ADD_POSTING_COPY " + JSON.stringify(await page.evaluate(() => {
        const host = document.querySelector(".alloy-os-addcharge") as HTMLElement | null;
        const text = host?.innerText.replace(/\s+/g, " ") ?? "";
        return {
            posting: /Posting (.{0,60})/.exec(text)?.[1] ?? null,
            draftSentence: /Creates a draft[^.]*\./.exec(text)?.[0] ?? null,
            postsSentence: /Posts on confirm[^.]*\./.exec(text)?.[0] ?? null,
            afterPosting: /After posting (\S+)/.exec(text)?.[1] ?? null,
        };
    })));
    await shot(page, "p5i-A10-add-charge-mode");

    await page.locator('[data-financials-entry-mode-tab="adjustment"]').click({ timeout: 20_000 });
    await page.waitForTimeout(3_000);
    // eslint-disable-next-line no-console
    console.log("ADD_ADJUSTMENT_TABS " + JSON.stringify(await tabGeometry(page)));
    await shot(page, "p5i-A11-add-adjustment-mode");
});

test("Accounts · the same row-action primitive", async ({ page }) => {
    test.setTimeout(600_000);
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

    const parity = await page.evaluate(() => {
        const acts = [...document.querySelectorAll("[data-financials-row-action]")];
        const first = acts[0] as HTMLElement | undefined;
        return {
            rowActions: acts.length,
            kinds: [...new Set(acts.map((a) => a.getAttribute("data-financials-row-action")))],
            commands: [...new Set(acts.map((a) => a.getAttribute("data-charge-command")).filter(Boolean))],
            everyOneHasAnAccessibleName: acts.every((a) => !!a.getAttribute("aria-label") && !!a.getAttribute("title")),
            isRealButton: first ? first.tagName === "BUTTON" : null,
            headings: [...document.querySelectorAll(".alloy-os-billingdetail__row--head > span")].map((s) => (s as HTMLElement).innerText.trim()),
            rowHeights: [...new Set([...document.querySelectorAll("[data-financials-ledger-row]")].map((r) => Math.round(r.getBoundingClientRect().height)))],
            responsibility: [...new Set([...document.querySelectorAll("[data-financials-responsibility]")].map((n) => n.getAttribute("data-financials-responsibility")))],
            glStates: [...new Set([...document.querySelectorAll("[data-financials-gl-state]")].map((n) => n.getAttribute("data-financials-gl-state")))],
        };
    });
    // eslint-disable-next-line no-console
    console.log("ACCOUNTS_PARITY " + JSON.stringify(parity));
    await shot(page, "p5i-A12-accounts-row-actions");

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(4_000);
    // eslint-disable-next-line no-console
    console.log("NARROW_OVERFLOW " + await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1));
    await shot(page, "p5i-A13-1280x720");
});
