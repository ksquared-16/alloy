/**
 * R13 — the rendered sub-tab contract on the surfaces that actually mount it.
 *
 * Operations and Communications both render `WorkspaceSubTabs` as MODALS from the top nav, so this
 * drives the real controls rather than guessing routes, and checks both the old and new attribute so
 * a partial migration cannot read as success.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, withResource } from "./r11Env.mjs";

assertLocalBase();
assertCandidateBuild();

const read = (page) =>
    page.evaluate(() => ({
        newTabs: document.querySelectorAll("[data-workspace-section-tab]").length,
        newLists: document.querySelectorAll("[data-workspace-section-tabs]").length,
        oldTabs: document.querySelectorAll("[data-comms-tab]").length,
        oldLists: document.querySelectorAll("[data-comms-modal-tabs]").length,
        keys: [...document.querySelectorAll("[data-workspace-section-tab]")].map((e) => e.getAttribute("data-workspace-section-tab")),
        scopes: [...document.querySelectorAll("[data-workspace-mode-sections]")].map((e) => e.getAttribute("data-workspace-mode-sections")),
        labels: [...document.querySelectorAll('[role="tablist"]')].map((e) => e.getAttribute("aria-label")),
        roleTabs: document.querySelectorAll('[role="tab"]').length,
        selected: document.querySelectorAll('[role="tab"][aria-selected="true"]').length,
        commsPanels: document.querySelectorAll("[data-comms-tab-panel]").length,
    }));

await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 1000 } });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForTimeout(9000);

        const show = (label, r) => {
            console.log(`${label}`);
            console.log(`  NEW ${r.newTabs} tabs / ${r.newLists} tablists   OLD ${r.oldTabs} tabs / ${r.oldLists} tablists`);
            console.log(`  keys=${JSON.stringify(r.keys)}`);
            console.log(`  scopes=${JSON.stringify(r.scopes)} labels=${JSON.stringify(r.labels)}`);
            console.log(`  role=tab ${r.roleTabs}, aria-selected=true ${r.selected}, comms panels ${r.commsPanels}`);
        };

        show("workspace (no modal)", await read(page));
        for (const [label, sel] of [["Operations modal", '[aria-label^="Operations"]'], ["Communications modal", '[aria-label^="Communications"], [aria-label^="Inbox"]']]) {
            try {
                await page.locator(sel).first().click({ timeout: 15000 });
                await page.waitForTimeout(8000);
                show(label, await read(page));
                await page.keyboard.press("Escape");
                await page.waitForTimeout(3000);
            } catch (e) {
                console.log(`${label}: could not open — ${String(e).slice(0, 70)}`);
            }
        }
    },
);
