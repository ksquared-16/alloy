/** F: Description as a column. G: the Adjustment surface. */
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/qa-readiness";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("F and G", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("no workspace");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 180_000 }).catch(() => undefined);
    await page.waitForTimeout(3_000);
    mkdirSync(OUT, { recursive: true });

    const cols = await page.evaluate(() => {
        const head = document.querySelector(".alloy-os-billingdetail__ledger [role='row'], .alloy-os-billingdetail__row");
        return head ? [...head.children].map((c) => (c as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean) : null;
    });
    log(`F COLUMNS: ${JSON.stringify(cols)}`);

    const scrolled = await page.evaluate(() => {
        const led = document.querySelector(".alloy-os-billingdetail__ledger") as HTMLElement | null;
        const sc = led?.parentElement?.scrollWidth && led.parentElement.scrollWidth > led.parentElement.clientWidth ? led.parentElement : (led as HTMLElement | null);
        if (!sc) return null;
        sc.scrollLeft = sc.scrollWidth;
        return { scrollLeft: Math.round(sc.scrollLeft), scrollWidth: sc.scrollWidth, clientWidth: sc.clientWidth };
    });
    await page.waitForTimeout(600);
    log(`F SCROLL: ${JSON.stringify(scrolled)}`);
    await page.screenshot({ path: `${OUT}/F-description-scrolled.png` });

    const desc = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-financials-ledger-row]")].slice(0, 5);
        return rows.map((r) => {
            const kids = [...r.children].map((c) => (c as HTMLElement).innerText.replace(/\s+/g, " ").trim());
            return { last: kids[kids.length - 1], cells: kids.length };
        });
    });
    log(`F LAST CELL PER ROW: ${JSON.stringify(desc)}`);

    /* G — the Adjustment entry path. */
    const adj = page.locator("[data-testid*='adjust'], button:has-text('Adjust')").first();
    const hasAdj = await adj.count();
    log(`G adjustment entry present: ${hasAdj > 0}`);
    if (hasAdj) {
        await adj.click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(2_500);
        const panel = await page.evaluate(() => {
            const t = document.body.innerText.replace(/\s+/g, " ");
            return {
                againstEnrolment: /against enrol|against enrollment/i.test(t),
                againstCharge: /against charge/i.test(t),
                amount: /amount/i.test(t),
                effective: /effective|date/i.test(t),
                reason: /reason/i.test(t),
                preview: /preview/i.test(t),
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
        });
        log(`G ADJUSTMENT PANEL: ${JSON.stringify(panel)}`);
        await page.screenshot({ path: `${OUT}/G-adjustment.png` });
    }
    expect(true).toBe(true);
});
