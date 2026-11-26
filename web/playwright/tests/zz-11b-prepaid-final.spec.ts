/** §14-§17 prepaid three-surface · §21 target options · §23-§25 responsive. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(560_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const money = (t: string, label: RegExp) => { const m = label.exec(t); return m ? m[1] : null; };

test("prepaid three surfaces, target options, responsive", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");

    // ── SURFACE 1: Focus Panel Summary (the compact card). ──
    out.summary = await page.evaluate(() => {
        const card = document.querySelector("[data-universal-card-key='financials']") as HTMLElement | null;
        const t = card?.innerText ?? "";
        const avail = /AVAILABLE\s*\n?\s*(\$[\d,]+\.\d{2})/i.exec(t);
        const bal = /Balance\s*\n?\s*(-?\$[\d,]+\.\d{2})/i.exec(t);
        return {
            available: avail ? avail[1] : null,
            balance: bal ? bal[1] : null,
            zeroRendered: /AVAILABLE\s*\n?\s*\$0\.00/i.test(t),
            saysDeposit: /\bDeposit\b/i.test(t),
        };
    });
    log(`SUMMARY: ${JSON.stringify(out.summary)}`);

    // ── §21: the target options, after the subject repair. ──
    await page.locator("[data-universal-card-key='financials']").getByRole("button", { name: /^Add$/ }).first()
        .click({ force: true });
    await page.waitForTimeout(10_000);
    out.target = await page.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll("[data-addcharge-child]"));
        const ids = boxes.map((b) => b.getAttribute("data-addcharge-child"));
        return {
            checkboxCount: boxes.length,
            uniqueChildren: [...new Set(ids)].length,
            eachOnce: ids.length === new Set(ids).size,
            householdOffered: Boolean(document.querySelector("[data-addcharge-target-household]")),
            summary: (document.querySelector("[data-addcharge-targetsum]") as HTMLElement | null)?.innerText ?? null,
            commandHosts: document.querySelectorAll("[data-addcharge-target]").length,
        };
    });
    log(`TARGET: ${JSON.stringify(out.target)}`);
    const resp: Record<string, unknown> = {};
    for (const w of [1280, 1440, 1680]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2200);
        resp[`target_${w}`] = await page.evaluate(() => {
            const el = document.querySelector("[data-addcharge-target]") as HTMLElement | null;
            if (!el) return { missing: true };
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), overflows: r.right > window.innerWidth + 1, clipped: el.scrollWidth > el.clientWidth + 1 };
        });
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.waitForTimeout(3000);

    // ── SURFACE 2: Focus Panel Details. ──
    const details = page.locator("[data-universal-card-key='financials'] [data-financials-nav='details']").first();
    log(`details link: ${await details.count()}`);
    if (await details.count()) { await details.click({ force: true }); await page.waitForTimeout(13_000); }
    out.details = await page.evaluate(() => {
        const t = document.body.innerText || "";
        const avail = /AVAILABLE PREPAID\s*\n?\s*(\$[\d,]+\.\d{2})/i.exec(t) ?? /AVAILABLE\s*\n?\s*(\$[\d,]+\.\d{2})/i.exec(t);
        const bal = /CURRENT BALANCE\s*\n?\s*(-?\$[\d,]+\.\d{2})/i.exec(t) ?? /Balance\s*\n?\s*(-?\$[\d,]+\.\d{2})/i.exec(t);
        return {
            available: avail ? avail[1] : null, balance: bal ? bal[1] : null,
            zeroRendered: /AVAILABLE[^\n]*\n?\s*\$0\.00/i.test(t), saysDeposit: /\bDeposit\b/i.test(t),
        };
    });
    log(`DETAILS: ${JSON.stringify(out.details)}`);
    for (const w of [1280, 1440, 1680]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2000);
        resp[`prepaid_${w}`] = await page.evaluate(() => {
            const t = document.body.innerText || "";
            const m = /AVAILABLE[^\n]*\n?\s*(\$[\d,]+\.\d{2})/i.exec(t);
            const el = Array.from(document.querySelectorAll("*")).find((e) => /AVAILABLE/i.test((e as HTMLElement).innerText ?? "") && (e as HTMLElement).children.length === 0) as HTMLElement | undefined;
            return { value: m ? m[1] : null, clipped: el ? el.scrollWidth > el.clientWidth + 1 : null };
        });
    }
    out.responsive = resp;
    log(`RESPONSIVE: ${JSON.stringify(resp)}`);
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.screenshot({ path: `${OUT}/prepaid-details.png`, fullPage: true });
    writeFileSync(`${OUT}/prepaid-final.json`, JSON.stringify(out, null, 2));
});
