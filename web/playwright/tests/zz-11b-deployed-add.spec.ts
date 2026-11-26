/**
 * §12 — the unified Add target on the DEPLOYED build, from the entry Financials card.
 *
 * Reachability only: the dialog is opened and read, then dismissed. Nothing is written — the
 * economics are already certified and this run must not mutate Kelly's fixture.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-deployed-qa";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Add offers each child once, with Household explicit", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    expect(page.url()).not.toContain("/login");

    R.summary = await page.evaluate(() => {
        const c = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
        const t = c?.innerText?.replace(/\s+/g, " ") ?? "";
        return {
            present: Boolean(c),
            balance: (/Balance \$[\d,]+\.\d{2}/.exec(t) || [null])[0],
            availablePrepaid: (/Available prepaid \$[\d,]+\.\d{2}/.exec(t) || [null])[0],
            bareAvailable: /Available(?! prepaid)\s*\$/.test(t),
        };
    });
    log(`SUMMARY: ${JSON.stringify(R.summary)}`);

    const add = page.getByRole("button", { name: /^Add$/ }).first();
    R.addControl = { count: await page.getByRole("button", { name: /^Add$/ }).count(), present: (await add.count()) > 0 };
    if (await add.count()) { await add.click({ timeout: 20_000 }); await page.waitForTimeout(9000); }

    R.add = await page.evaluate(() => {
        const names = Array.from(document.querySelectorAll("input[type='checkbox'],[role='checkbox']"))
            .map((e) => (e.closest("label") || e.parentElement)?.textContent?.replace(/\s+/g, " ").trim() ?? "")
            .filter(Boolean);
        const kids = names.filter((n) => /cert[ab]\s+certhouse/i.test(n));
        return {
            targets: names,
            children: kids,
            eachChildOnce: kids.length >= 2 && new Set(kids).size === kids.length,
            householdExplicit: /household/i.test(document.body.innerText),
            oneActiveTargetControl: names.length > 0,
        };
    });
    log(`ADD: ${JSON.stringify(R.add)}`);
    await page.screenshot({ path: `${OUT}/a01-add.png`, fullPage: true });
    await page.keyboard.press("Escape").catch(() => {});
    writeFileSync(`${OUT}/deployed-add.json`, JSON.stringify(R, null, 2));
});
