/**
 * §14 — Financials → Assignment parity, READ IN THE ASSIGNMENT SURFACE.
 *
 * The previous run proved the canonical answer changed and that Assignment reads the same route
 * with the same component. That is an inference, not a reading, so this opens the Assignment
 * responsibility section and reports what it actually renders.
 *
 * Navigation per web/playwright/FINANCIALS-NAVIGATION.md; the child's own panel is reached from
 * the household's children card row action.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(420_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("assignment reads the arrangement Financials wrote", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");

    // Certa's own panel — the children card's row action, not the name.
    await page.getByRole("button", { name: /^custom/ }).first().click({ force: true, timeout: 15_000 });
    await page.waitForTimeout(14_000);

    const open = page.locator('[data-assignment-responsibility="open"]');
    log(`responsibility disclosure: ${await open.count()}`);
    if (await open.count() === 0) {
        const surface = await page.evaluate(() => (document.querySelector("[data-schedule-surface]") as HTMLElement | null)?.innerText?.replace(/\n+/g, " / ").slice(0, 500) ?? "(no schedule surface)");
        log(`surface: ${surface}`);
        writeFileSync(`${OUT}/assignment-parity.json`, JSON.stringify({ blocked: "no disclosure", surface }, null, 2));
        return;
    }

    /* OPENING MUST AUTHOR NOTHING — watch for any execute while the panel comes up. */
    const writes: string[] = [];
    page.on("request", (r) => {
        if (r.method() === "POST" && /actions\/execute/.test(r.url())) writes.push((r.postData() ?? "").slice(0, 200));
    });

    await open.click({ force: true });
    await page.waitForTimeout(12_000);

    const out = await page.evaluate(() => {
        const section = document.querySelector('[data-assignment-responsibility="section"]') as HTMLElement | null;
        const sel = section?.querySelector("[data-testid='responsibility-scope']") as HTMLSelectElement | null;
        const readback = section?.querySelector("[data-financials-scope-arrangement]") as HTMLElement | null;
        return {
            panelMounted: Boolean(section?.querySelector('[data-financials-manage-responsibility="open-panel"]')),
            /* §11: defaults to this child, as a stated value. */
            selectedScope: sel?.value ?? null,
            selectedLabel: sel ? sel.options[sel.selectedIndex]?.textContent?.trim() ?? null : null,
            optionCount: sel ? sel.querySelectorAll("option").length : 0,
            offersHousehold: sel ? Array.from(sel.querySelectorAll("option")).some((o) => (o as HTMLOptionElement).value === "__household__") : false,
            scopeGrain: section?.querySelector("[data-financials-arrangement-scope]")?.getAttribute("data-financials-arrangement-scope") ?? null,
            kind: readback?.getAttribute("data-financials-scope-arrangement") ?? null,
            arrangementId: readback?.getAttribute("data-financials-scope-arrangement-id") ?? null,
            text: readback?.innerText ?? null,
        };
    });
    log(`\nASSIGNMENT RESPONSIBILITY:\n${JSON.stringify(out, null, 1)}`);
    log(`\nWRITES WHILE OPENING: ${writes.length} ${JSON.stringify(writes)}`);
    await page.screenshot({ path: `${OUT}/assignment-responsibility.png`, fullPage: true });
    writeFileSync(`${OUT}/assignment-parity.json`, JSON.stringify({ ...out, writesWhileOpening: writes }, null, 2));
});
