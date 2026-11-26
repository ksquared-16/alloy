/** Validate the three suspicious readings before dispositioning them. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("validate", async ({ page }) => {
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

    const rowOverflow = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-financials-ledger-row]")].slice(0, 4);
        return rows.map((r) => ({
            scrollW: r.scrollWidth, clientW: r.clientWidth, delta: r.scrollWidth - r.clientWidth,
            display: getComputedStyle(r).display, overflowX: getComputedStyle(r).overflowX,
            rectW: Math.round(r.getBoundingClientRect().width),
            parentScrolls: (() => { const p = r.parentElement; return p ? p.scrollWidth - p.clientWidth : null; })(),
        }));
    });
    log(`ROW OVERFLOW: ${JSON.stringify(rowOverflow)}`);

    const backdrop = await page.evaluate(() => {
        const all = [...document.querySelectorAll("[class*='backdrop'], [class*='scrim']")];
        return all.map((e) => {
            const cs = getComputedStyle(e);
            const r = e.getBoundingClientRect();
            return { cls: (e.className || "").toString().slice(0, 60), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, pointerEvents: cs.pointerEvents, w: Math.round(r.width), h: Math.round(r.height) };
        });
    });
    log(`BACKDROP CANDIDATES: ${JSON.stringify(backdrop)}`);

    const clickable = await page.evaluate(() => {
        const row = document.querySelector("[data-financials-account-row]") as HTMLElement | null;
        if (!row) return null;
        const r = row.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { rowReachable: !!top && (row.contains(top) || top === row), topTag: top?.tagName ?? null, topCls: ((top as HTMLElement)?.className || "").toString().slice(0, 50) };
    });
    log(`ACCOUNT ROW HIT TEST: ${JSON.stringify(clickable)}`);

    const siteControls = await page.evaluate(() => {
        const cands = [...document.querySelectorAll("[data-workspace-site-filter], [data-financials-site-filter], [data-site-filter], button, [role='combobox']")]
            .filter((e) => /site|location/i.test((e.getAttribute("data-testid") || "") + (e.getAttribute("aria-label") || "") + ((e as HTMLElement).innerText || "").slice(0, 40)));
        return cands.slice(0, 6).map((e) => ({ tag: e.tagName, testid: e.getAttribute("data-testid"), aria: e.getAttribute("aria-label"), text: ((e as HTMLElement).innerText || "").slice(0, 40) }));
    });
    log(`SITE CONTROLS: ${JSON.stringify(siteControls)}`);

    await page.locator("[data-workspace-section-tab='overview']").first().click({ timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(6_000);
    const ov = await page.evaluate(() => ({ headings: [...document.querySelectorAll("h1,h2,h3,[role='heading']")].map((h) => (h as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 12), sample: document.body.innerText.replace(/\s+/g, " ").slice(0, 300) }));
    log(`OVERVIEW HEADINGS: ${JSON.stringify(ov.headings)}`);
    log(`OVERVIEW SAMPLE: ${ov.sample}`);
    expect(true).toBe(true);
});
