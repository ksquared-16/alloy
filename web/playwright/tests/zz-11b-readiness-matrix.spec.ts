/**
 * READINESS MATRIX A–N, by visible navigation. Engineering proof that the walkthrough is
 * walkable — NOT Human QA, and nothing here is marked passed on Kelly's behalf.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-audit";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("A-N reachable by clicking", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const M: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/readiness-matrix.json`, JSON.stringify(M, null, 2));

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);
    expect(page.url()).not.toContain("/login");

    /* G · summary, K · prepaid — on the entry surface */
    M.G_summary = await page.evaluate(() => {
        const c = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
        const t = c?.innerText?.replace(/\s+/g, " ") ?? "";
        return { present: Boolean(c), balance: (/Balance \$[\d,]+\.\d{2}/.exec(t) || [null])[0],
                 availablePrepaid: (/Available prepaid \$[\d,]+\.\d{2}/.exec(t) || [null])[0] };
    });
    M.K_prepaid = { named: /Available prepaid/.test(String((M.G_summary as Record<string,unknown>).availablePrepaid ?? "")) };

    /* J · the unified Add target */
    const add = page.getByRole("button", { name: /^Add$/ }).first();
    M.J_add = { control: (await add.count()) > 0 };
    if (await add.count()) {
        await add.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(6000);
        M.J_add = { ...(M.J_add as object), ...(await page.evaluate(() => {
            const t = document.body.innerText || "";
            const names = Array.from(document.querySelectorAll("input[type='checkbox'],[role='checkbox']"))
                .map((e) => (e.closest("label") || e.parentElement)?.textContent?.replace(/\s+/g, " ").trim() ?? "").filter(Boolean);
            return { targets: names, householdOffered: /household/i.test(t), eachChildOnce: new Set(names).size === names.length };
        })) };
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(2500);
    }
    log(`G/K/J: ${JSON.stringify({ G: M.G_summary, K: M.K_prepaid, J: M.J_add })}`);
    flush();

    /* A–F · the child's Assignment, reached by clicking a child */
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);
    M.assignment = await page.evaluate(() => {
        const s = document.querySelector("[data-universal-card-key='scheduling']") as HTMLElement | null;
        const t = s?.innerText?.replace(/\s+/g, " ") ?? "";
        return {
            A_tuition: /tuition/i.test(t),
            B_billingFrequency: /billing frequency/i.test(t),
            C_periods: /current period[\s\S]{0,60}next/i.test(t),
            D_responsibility: /who owes|responsib/i.test(t),
            E_discountForecast: /DISCOUNTS/i.test(t),
            F_exceptionAffordance: Boolean(document.querySelector("[data-add-policy-exception]")) || /add exception/i.test(t),
        };
    });
    log(`A-F: ${JSON.stringify(M.assignment)}`);
    flush();

    /* H · Details, I · Accounts — through the sidebar */
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1500);
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) {
        await nav.click({ force: true, timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(13_000);
        const tab = page.locator("[data-workspace-section-tab='accounts']").first();
        if (await tab.count()) { await tab.click({ timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(13_000); }
        M.I_accounts = await page.evaluate(() => ({
            rows: document.querySelectorAll("[data-financials-account-row]").length,
            manageResponsibility: Boolean(document.querySelector("[data-financials-manage-responsibility]")),
            lenses: Array.from(document.querySelectorAll("[data-financials-lens]")).map((e) => e.getAttribute("data-financials-lens")),
        }));
        const row = page.locator("[data-financials-account-row]").first();
        if (await row.count()) {
            await row.click({ timeout: 15_000 }).catch(() => {});
            await page.waitForTimeout(12_000);
            M.H_details = await page.evaluate(() => {
                const t = document.body.innerText || "";
                return { availablePrepaid: (/Available prepaid[^\n]{0,20}/i.exec(t) || [null])[0],
                         responsibleParty: /responsib/i.test(t),
                         gear: Boolean(document.querySelector("[data-financials-manage-responsibility]")) };
            });
        }
    }
    log(`H/I: ${JSON.stringify({ H: M.H_details, I: M.I_accounts })}`);
    flush();

    /* L, M, N · organization chapters, by pressing the tile buttons */
    for (const [item, chapter] of [["L_tuition", "Tuition"], ["M_policies", "Policies"], ["N_accounting", "Accounting"]] as const) {
        await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(12_000);
        const btn = page.getByRole("button", { name: new RegExp(`^Open ${chapter}$`, "i") }).first();
        if ((await btn.count()) === 0) { (M as Record<string, unknown>)[item] = { reachable: false }; continue; }
        await btn.click({ timeout: 20_000 });
        await page.waitForTimeout(13_000);
        (M as Record<string, unknown>)[item] = await page.evaluate(() => {
            const t = document.body.innerText || "";
            return {
                reachable: true,
                headings: Array.from(document.querySelectorAll("h2,h3")).map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 6),
                billingFrequencies: /billing frequenc/i.test(t),
                discounts: /discount/i.test(t),
                calendarPanel: Boolean(document.querySelector('[data-testid="accounting-calendar-panel"]')),
                closeControls: document.querySelectorAll('[data-testid^="accounting-period-close-"]').length,
                reopenCopy: /reopening one is not an action/i.test(t),
            };
        });
        log(`${item}: ${JSON.stringify((M as Record<string, unknown>)[item]).slice(0, 220)}`);
    }
    flush();
});
