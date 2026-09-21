/**
 * §9 / §10 / §12 on the deployed build, with the SELECTORS THAT EXIST.
 *
 * The first deployed pass used `[data-account-row]` and `[data-account-lens]` — neither is in the
 * product — so Accounts read zero rows and the responsibility "proof" degraded into substring
 * matches against the whole page. Every read here is scoped to the surface being measured.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-deployed-qa";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Financials → Accounts → account → responsibility, then Add", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");

    /* ── Financials, from the sidebar the operator can see ──────────────────────────────── */
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    R.financialsNav = { present: (await nav.count()) > 0 };
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }

    /* ── ACCOUNTS ───────────────────────────────────────────────────────────────────────── */
    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    R.accountsTab = { present: (await tab.count()) > 0, tag: (await tab.count()) ? await tab.evaluate((e) => e.tagName) : null };
    if (await tab.count()) { await tab.click({ timeout: 15_000 }); await page.waitForTimeout(13_000); }

    R.accounts = await page.evaluate(() => ({
        rows: document.querySelectorAll("[data-financials-account-row]").length,
        lenses: Array.from(document.querySelectorAll("[data-financials-lens]")).map((e) => e.getAttribute("data-financials-lens")),
        manageResponsibilityGear: Boolean(document.querySelector("[data-financials-manage-responsibility]")),
        addControl: document.querySelectorAll("[data-financials-add]").length,
        prepaidNamedOnAccounts: /available prepaid/i.test(document.body.innerText),
    }));
    log(`ACCOUNTS: ${JSON.stringify(R.accounts)}`);
    await page.screenshot({ path: `${OUT}/r01-accounts.png`, fullPage: true });

    /* ── one ACCOUNT, read inside the account card, never off the whole page ────────────── */
    const row = page.locator("[data-financials-account-row]").first();
    R.accountRow = { present: (await row.count()) > 0 };
    if (await row.count()) { await row.click({ timeout: 15_000 }); await page.waitForTimeout(12_000); }

    R.account = await page.evaluate(() => {
        const card = (document.querySelector("[data-financials-account-selected]")
            || document.querySelector("[data-financials-account-card]")) as HTMLElement | null;
        const t = card?.innerText?.replace(/\s+/g, " ") ?? "";
        return {
            scopedToCard: Boolean(card),
            responsibleParty: /responsible part/i.test(t),
            gear: Boolean(card?.querySelector("[data-financials-manage-responsibility]")),
            scope: card?.querySelector("[data-financials-arrangement-scope]")?.getAttribute("data-financials-arrangement-scope") ?? null,
            members: Array.from(card?.querySelectorAll("[data-financials-arrangement-member]") ?? []).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
            availablePrepaid: (/available prepaid[^A-Za-z]{0,12}\$?[\d,]+\.\d{2}/i.exec(t) || [null])[0],
            text: t.slice(0, 1200),
        };
    });
    log(`ACCOUNT (scoped): ${JSON.stringify(R.account)}`);
    await page.screenshot({ path: `${OUT}/r02-account.png`, fullPage: true });

    /* ── the arrangement read-back, behind the gear. READ ONLY — no arrangement is created. ─ */
    const gear = page.locator("[data-financials-manage-responsibility]").first();
    R.gearPresent = (await gear.count()) > 0;
    if (await gear.count()) { await gear.click({ timeout: 15_000 }); await page.waitForTimeout(11_000); }
    R.arrangement = await page.evaluate(() => {
        const dlg = (document.querySelector("[role='dialog'][aria-modal='true']:last-of-type")
            || document.querySelector("[data-financials-account-selected]")) as HTMLElement | null;
        const t = dlg?.innerText?.replace(/\s+/g, " ") ?? document.body.innerText.replace(/\s+/g, " ");
        return {
            grainHousehold: /household/i.test(t),
            party: (/Cert\s*Certhouse/i.exec(t) || [null])[0],
            fixed: (/fixed/i.test(t) ? "fixed" : null),
            amount: (/\$18\.00/.exec(t) || [null])[0],
            effective: (/2026-09-18|Sep(tember)?\s*18,?\s*2026/i.exec(t) || [null])[0],
            openEnded: /open-ended|no end date|ongoing/i.test(t),
            scopeAttr: dlg?.querySelector("[data-financials-arrangement-scope]")?.getAttribute("data-financials-arrangement-scope") ?? null,
            members: Array.from(dlg?.querySelectorAll("[data-financials-arrangement-member]") ?? []).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
            text: t.slice(0, 1400),
        };
    });
    log(`ARRANGEMENT: ${JSON.stringify(R.arrangement)}`);
    await page.screenshot({ path: `${OUT}/r03-arrangement.png`, fullPage: true });
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(3000);

    /* ── §12 ADD — the product's own Add control, not the first button called "Add" ──────── */
    const add = page.locator("[data-financials-add]").first();
    R.addControl = { count: await page.locator("[data-financials-add]").count(), present: (await add.count()) > 0 };
    if (await add.count()) { await add.click({ timeout: 20_000 }).catch((e) => log(`add click: ${e}`)); await page.waitForTimeout(11_000); }
    R.add = await page.evaluate(() => {
        const targets = Array.from(document.querySelectorAll("[data-charge-target]")).map((e) => ({
            value: e.getAttribute("data-charge-target"),
            text: (e as HTMLElement).innerText?.replace(/\s+/g, " ").trim(),
        }));
        const kids = targets.filter((t) => /cert[ab]\s+certhouse/i.test(t.text ?? ""));
        return {
            targets,
            children: kids.map((k) => k.text),
            eachChildOnce: kids.length >= 2 && new Set(kids.map((k) => k.text)).size === kids.length,
            householdExplicit: targets.some((t) => /household/i.test(t.text ?? "") || /household/i.test(t.value ?? "")),
        };
    });
    log(`ADD: ${JSON.stringify(R.add)}`);
    await page.screenshot({ path: `${OUT}/r04-add.png`, fullPage: true });
    writeFileSync(`${OUT}/deployed-responsibility-add.json`, JSON.stringify(R, null, 2));
});
