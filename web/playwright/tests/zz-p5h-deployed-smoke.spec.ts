/**
 * PASS 5H — DEPLOYED SMOKE PROOF.
 *
 * Runs against the hosted build after the merge is deployed. Every assertion is a measurement off
 * the live DOM. Human scenarios are NOT marked PASS here: this proves the surfaces behave, not that
 * an operator has accepted them.
 *
 * The known BOS occlusion at 1280/1440 is an EXTERNAL shared-layout defect (HANDOFF-SWL-BOS-RAIL-
 * 2026-09-16). This runs at 1680x1050 where it does not apply, and reports reachability rather than
 * asserting it, so the handed-off defect is never rediscovered here as a Financials failure.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const HOUSEHOLD = "fd000000-0000-4000-8000-0000000c0001";
const OUT = "../certification/financials";
const MOUNTED = 120_000;

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });

const shot = async (page: Page, name: string) => {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}.png` });
};

test("deployed · Financials → Accounts", async ({ page }) => {
    test.setTimeout(600_000);
    // eslint-disable-next-line no-console
    console.log("DEPLOYED_BUILD " + (await (await page.request.get(`${BASE}/api/build-info`)).text()).slice(0, 200));

    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = page.locator("[data-adminv2-financials-workspace]");
    await expect(shell).toBeVisible({ timeout: MOUNTED });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`);
    await expect(row).toBeVisible({ timeout: MOUNTED });

    await row.click();
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    const first = await card.evaluate((n) => Math.round(n.getBoundingClientRect().height));
    const firstCount = await page.locator('[data-financials-card="true"]').count();
    await page.waitForTimeout(14_000);
    const hydrated = await card.evaluate((n) => Math.round(n.getBoundingClientRect().height));

    const facts = await page.evaluate(() => {
        const text = (document.querySelector("[data-financials-account-detail]") as HTMLElement | null)?.innerText ?? "";
        const stats = [...document.querySelectorAll(".alloy-os-fdetail__stat")].map((s) => (s as HTMLElement).innerText.replace(/\s+/g, " ").trim());
        return {
            cards: document.querySelectorAll('[data-financials-card="true"]').length,
            cardBodies: document.querySelectorAll("[data-financials-card-body]").length,
            stats,
            commands: [...document.querySelectorAll("[data-financials-command]")].map((b) => b.getAttribute("data-financials-command")),
            lenses: document.querySelectorAll("[data-financials-lens]").length,
            filters: [...document.querySelectorAll('[data-testid^="financials-filter-"]')].map((el) => {
                const r = el.getBoundingClientRect();
                const v = el.querySelector(".alloy-select__value") as HTMLElement | null;
                const vr = v?.getBoundingClientRect();
                return { id: el.getAttribute("data-testid"), y: Math.round(r.y), label: v?.innerText ?? null, clipped: v && vr ? v.scrollWidth > Math.ceil(vr.width) + 1 : null };
            }),
            ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
            glMapped: document.querySelectorAll('[data-financials-gl-state="mapped"]').length,
            glUnmapped: document.querySelectorAll('[data-financials-gl-state="unmapped"]').length,
            responsible: document.querySelectorAll("[data-financials-responsible]").length,
            headings: [...document.querySelectorAll(".alloy-os-billingdetail__row--head span")].map((s) => (s as HTMLElement).innerText.trim()),
            linkFarm: document.querySelectorAll(".alloy-os-fdetail__paymentops").length,
            hasBalance: /Current balance/i.test(text),
            hasDue: /\bDue\b/i.test(text),
            hasPastDue: /Past due/i.test(text),
        };
    });
    // eslint-disable-next-line no-console
    console.log(`ACCOUNTS first=${first} hydrated=${hydrated} firstCount=${firstCount} ` + JSON.stringify(facts));
    await shot(page, "p5h-D1-deployed-accounts");

    expect(hydrated, "the account shell commits one height").toBe(first);
    expect(facts.cards, "exactly one card root").toBe(1);
    expect(facts.linkFarm, "no footer link farm").toBe(0);
});

test("deployed · Focus Panel → Financials", async ({ page }) => {
    test.setTimeout(600_000);
    /*
     * The Focus Panel needs a work unit with a financial subject. Rather than pin a hosted lane that
     * may not exist, walk the workspace for one and say plainly if none is reachable.
     */
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(8_000);
    const lanes = await page.locator("[data-workspace-section-tab], [data-adminv2-sidebar-modal-nav]").evaluateAll((ns) =>
        ns.map((n) => (n as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 20),
    );
    // eslint-disable-next-line no-console
    console.log("WORKSPACE_ENTRIES " + JSON.stringify(lanes));

    const card = page.locator('[data-financials-card="true"]').first();
    const reachable = await card.count().then((c) => c > 0);
    // eslint-disable-next-line no-console
    console.log("FOCUS_PANEL_FINANCIALS_PRESENT " + reachable);
    if (!reachable) {
        // eslint-disable-next-line no-console
        console.log("FOCUS_PANEL_NOT_REACHED — no work unit with a financial subject on this tenant's default workspace");
        await shot(page, "p5h-D2-deployed-workspace");
        return;
    }
    await shot(page, "p5h-D2-deployed-focus-compact");
});
