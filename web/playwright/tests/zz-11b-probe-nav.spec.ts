/** Navigation reconnaissance: what is actually on the panel, before any selector is guessed. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("what is on the panel", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    const dump = async (label: string) => {
        const d = await page.evaluate(() => ({
            url: location.pathname + location.search,
            cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
            schedulingCard: Boolean(document.querySelector("[data-scheduling-card]")),
            schedOpen: Array.from(document.querySelectorAll("[data-scheduling-open]")).map((e) => e.getAttribute("data-scheduling-open")),
            schedSurface: Boolean(document.querySelector("[data-schedule-surface]")),
            schedText: (document.querySelector("[data-scheduling-card]") as HTMLElement | null)?.innerText?.replace(/\n+/g, " / ").slice(0, 400) ?? null,
            buttons: [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()).filter((t) => t && t.length < 40))].slice(0, 40),
        }));
        log(`\n--- ${label} ---`);
        log(`url: ${d.url}`);
        log(`cards: ${JSON.stringify(d.cards)}`);
        log(`schedulingCard=${d.schedulingCard} schedSurface=${d.schedSurface} schedOpen=${JSON.stringify(d.schedOpen)}`);
        log(`schedText: ${d.schedText}`);
        log(`buttons: ${JSON.stringify(d.buttons)}`);
        return d;
    };
    const a = await dump("landing");
    // The children card's ROW ACTION opens the child's own panel; the name alone only re-scopes.
    const rowLink = page.getByRole("button", { name: /^custom/ }).first();
    log(`\nrow action matches: ${await rowLink.count()}`);
    if (await rowLink.count()) { await rowLink.click({ timeout: 5000 }).catch((e) => log(`click failed: ${e}`)); await page.waitForTimeout(13_000); }
    const b = await dump("after opening Certa's own panel");
    await page.screenshot({ path: `${OUT}/probe-nav.png`, fullPage: true });
    writeFileSync(`${OUT}/probe-nav.json`, JSON.stringify({ landing: a, afterSelect: b }, null, 2));
});
