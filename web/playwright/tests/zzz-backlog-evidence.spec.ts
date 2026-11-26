/** Evidence for backlog classification only. Nothing is implemented. Read only. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/runtime-unblock";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("backlog evidence", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    /* Focus Panel card: title, duplicated balance, dropdown layout. */
    const focusCard = await page.evaluate(() => {
        const shell = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
        const head = shell?.querySelector(".alloy-os-ucard__head, header") as HTMLElement | null;
        return {
            headText: head?.innerText.replace(/\s+/g, " ").trim() ?? null,
            headHasMoney: /\$[\d,]+\.\d{2}/.test(head?.innerText ?? ""),
            cardTitleArea: shell?.innerText.replace(/\s+/g, " ").trim().slice(0, 90) ?? null,
        };
    });
    log(`FOCUS CARD HEAD ${JSON.stringify(focusCard)}`);
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 150_000 }).catch(() => undefined);
    const detail = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
        const filt = root?.querySelector("[data-financials-filters='true']") as HTMLElement | null;
        const lens = root?.querySelector("[data-financials-lenses='true']") as HTMLElement | null;
        const firstRow = root?.querySelector("[data-financials-ledger-row]") as HTMLElement | null;
        const ledgerHead = root?.innerText.match(/DATE\s+TYPE[^\n]{0,80}/)?.[0] ?? null;
        const box = (e: Element | null) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; };
        /* Are the filter dropdowns on one line (side by side) or stacked? */
        const dropTops = Array.from(filt?.querySelectorAll("button") ?? []).map((b) => Math.round(b.getBoundingClientRect().top));
        return {
            ledgerColumns: ledgerHead,
            firstRowText: firstRow?.innerText.replace(/\s+/g, " ").trim().slice(0, 120) ?? null,
            filterDropdownTops: dropTops,
            filtersSideBySide: new Set(dropTops).size === 1 && dropTops.length > 1,
            lensBox: box(lens ?? null),
            ledgerTop: box(root?.querySelector("[data-financials-ledger-row]") ?? null),
            whitespaceAboveLedger: (() => {
                const l = root?.querySelector("[data-financials-lenses='true']") as HTMLElement | null;
                const r0 = root?.querySelector("[data-financials-ledger-row]") as HTMLElement | null;
                if (!l || !r0) return null;
                return Math.round(r0.getBoundingClientRect().top - l.getBoundingClientRect().bottom);
            })(),
            hasDescriptionColumn: /DESCRIPTION/i.test(root?.innerText ?? ""),
        };
    });
    log(`DETAIL ${JSON.stringify(detail, null, 1)}`);
    /* Financials workspace: Work/Studio, Overview KPI landing, site filter. */
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(12_000);
    const ws = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
            workStudio: /\bWork\b[\s\S]{0,40}\bStudio\b/.test(t),
            tabs: Array.from(document.querySelectorAll("[data-workspace-section-tab]")).map((e) => e.getAttribute("data-workspace-section-tab")),
            siteFilter: (t.match(/All sites|All locations/) || [])[0] ?? null,
            overviewKpis: Array.from(document.querySelectorAll("[data-workspace-metric], [class*='metric'], [class*='kpi']")).slice(0, 8).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 40)),
        };
    });
    log(`WORKSPACE ${JSON.stringify(ws, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/backlog-evidence.json`, JSON.stringify({ focusCard, detail, ws }, null, 2));
});
