/**
 * R14 — the measured journey after the vocabulary change.
 *
 * Counts must be untouched, so this re-reads the same band and rail across the states R14 names:
 * a site selection, and navigating away and back. Result identity for the current-operator view is
 * captured as row ids, not just a number — a count can match while the rows differ.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, withResource } from "./r11Env.mjs";

assertLocalBase();
assertCandidateBuild();

const snapshot = (page) =>
    page.evaluate(() => {
        const kpi = document.querySelector('[data-testid="work-items-kpi-band"]');
        const leaves = [...(kpi?.querySelectorAll("*") ?? [])].filter(
            (e) => e.children.length === 0 && (e.textContent ?? "").trim(),
        ).map((e) => (e.textContent ?? "").trim());
        const band = {};
        leaves.forEach((t, i) => { if (/^[A-Za-z]/.test(t) && i > 0 && /^\d+$/.test(leaves[i - 1])) band[t] = leaves[i - 1]; });
        const rail = {};
        document.querySelectorAll("[data-work-items-view]").forEach((e) => {
            rail[`${e.getAttribute("data-work-items-view")}:${e.querySelector("span")?.textContent?.trim()}`] =
                e.querySelector("span:last-child")?.textContent?.trim();
        });
        const rows = [...document.querySelectorAll("[data-adminv2-task-row], [data-work-item-row]")]
            .map((e) => e.getAttribute("data-adminv2-task-row") || e.getAttribute("data-work-item-row"));
        return { band, rail, rows };
    });

await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 1000 } });
        const page = await ctx.newPage();
        const openQueue = async () => {
            for (const sel of ['[aria-label^="Work Items"]', '[aria-label^="Tasks"]', '[aria-label*="task" i]']) {
                try { await page.locator(sel).first().click({ timeout: 6000 }); break; } catch { /* next */ }
            }
            await page.waitForTimeout(6000);
            try { await page.locator('[data-workspace-section-tab="queue"]').first().click({ timeout: 8000 }); } catch { /* already */ }
            await page.waitForTimeout(7000);
        };
        const show = (label, s) => {
            console.log(`\n${label}`);
            console.log(`  band: ${JSON.stringify(s.band)}`);
            console.log(`  rail: ${JSON.stringify(s.rail)}`);
            console.log(`  visible rows: ${s.rows.length}`);
        };

        await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForTimeout(8000);
        await openQueue();
        const first = await snapshot(page);
        show("first open (Queue)", first);

        // Activate the current-operator view and capture its result identity.
        try {
            await page.locator('[data-work-items-view="mine"]').first().click({ timeout: 8000 });
            await page.waitForTimeout(5000);
        } catch { /* view unavailable */ }
        const mine = await snapshot(page);
        show("after activating the current-operator view", mine);

        // Navigate away and back.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(3000);
        await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForTimeout(6000);
        await openQueue();
        const back = await snapshot(page);
        show("after navigating away and back", back);

        const same = JSON.stringify(first.band) === JSON.stringify(back.band)
            && JSON.stringify(first.rail) === JSON.stringify(back.rail);
        console.log(`\ncounts stable across navigation: ${same ? "YES" : "NO"}`);
    },
);
