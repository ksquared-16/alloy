/**
 * §18 responsive and §19 accessibility — keyboard-driven, not inferred from element type.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-audit";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("responsive at three widths, and the repaired paths by keyboard", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const R: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/a11y-responsive.json`, JSON.stringify(R, null, 2));

    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(16_000);
        expect(page.url()).not.toContain("/login");
        (R as Record<string, unknown>)[`panel_${width}`] = await page.evaluate(() => {
            const card = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
            return {
                cards: Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")),
                standaloneTuition: Boolean(document.querySelector("[data-universal-card-key='assignment_tuition']")),
                prepaidNamed: /Available prepaid/i.test(document.body.innerText || ""),
                cardClipped: card ? card.scrollHeight > Math.ceil(card.getBoundingClientRect().height) + 2 : null,
                horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
            };
        });
        await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(12_000);
        (R as Record<string, unknown>)[`org_${width}`] = await page.evaluate(() => ({
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
            policiesTileNamesDiscount: /discount/i.test((document.querySelector('[data-testid="financials-landing-tile-policies"]') as HTMLElement | null)?.innerText ?? ""),
        }));
        log(`@${width}: panel=${JSON.stringify((R as Record<string, unknown>)[`panel_${width}`])} org=${JSON.stringify((R as Record<string, unknown>)[`org_${width}`])}`);
    }
    flush();

    /* ── KEYBOARD: reach and operate a chapter control without a pointer ─────────────────── */
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const kb: Record<string, unknown> = {};
    await page.keyboard.press("Tab");
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
        const cur = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            return { name: (a?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40), tag: a?.tagName ?? null,
                     visibleFocus: a ? getComputedStyle(a).outlineStyle !== "none" || a.className.includes("focus-visible") || a.className.includes("ring") : false };
        });
        if (/^Open Accounting$/i.test(cur.name)) { kb.reachedByKeyboard = true; kb.control = cur; found = true; break; }
        await page.keyboard.press("Tab");
    }
    if (found) {
        await page.keyboard.press("Enter");
        await page.waitForTimeout(13_000);
        kb.activatedWithEnter = page.url().includes("chapter=accounting");
        kb.landedOn = page.url();
        kb.calendarPanel = await page.evaluate(() => Boolean(document.querySelector('[data-testid="accounting-calendar-panel"]')));
    }
    R.keyboard = kb;
    log(`KEYBOARD: ${JSON.stringify(kb)}`);
    flush();
});
