/**
 * R14 — what the operator actually reads when the two metrics are on screen together.
 *
 * The Tasks modal is the primary UX: `WorkItemsShell` supplies the KPI band ("Assigned") and
 * `MyTasksPanel` supplies the view pills ("Mine"), so both scopes are visible at once on the Queue
 * view. Captured at desktop and mobile widths because the ambiguity is a wording question and mobile
 * truncation changes what is legible.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, withResource } from "./r11Env.mjs";

const WIDTHS = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
];

assertLocalBase();
assertCandidateBuild();

await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        for (const vp of WIDTHS) {
            const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: vp.width, height: vp.height } });
            const page = await ctx.newPage();
            await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
            await page.waitForTimeout(8000);
            let opened = false;
            for (const sel of ['[aria-label^="Work Items"]', '[aria-label^="Tasks"]', '[aria-label*="task" i]', '[data-adminv2-tasks-open]']) {
                try {
                    await page.locator(sel).first().click({ timeout: 6000 });
                    opened = true;
                    break;
                } catch { /* try the next affordance */ }
            }
            await page.waitForTimeout(7000);
            // The modal lands on Overview, where the KPI band is deliberately hidden. The ambiguity
            // only exists on Queue, where the band and the view pills render together.
            try {
                await page.locator('[data-workspace-section-tab="queue"]').first().click({ timeout: 8000 });
                await page.waitForTimeout(7000);
            } catch { /* already on queue, or the tab is unavailable */ }
            const r = await page.evaluate(() => {
                const kpi = document.querySelector('[data-testid="work-items-kpi-band"]');
                const metric = (root) =>
                    [...(root?.querySelectorAll("*") ?? [])]
                        .filter((e) => e.children.length === 0 && (e.textContent ?? "").trim())
                        .map((e) => (e.textContent ?? "").trim());
                // Views render in the rail with a count badge, not as toolbar pills.
                const viewButtons = [...document.querySelectorAll("[data-work-items-view]")];
                const pills = viewButtons.map((e) => {
                    const label = e.querySelector("span")?.textContent?.trim() ?? "";
                    const count = e.querySelector("span:last-child")?.textContent?.trim() ?? "";
                    return `${e.getAttribute("data-work-items-view")}="${label}" (${count})`;
                });
                const truncated = viewButtons
                    .map((e) => e.querySelector("span"))
                    .filter((s2) => s2 && s2.scrollWidth > s2.clientWidth + 1)
                    .map((s2) => (s2.textContent ?? "").trim());
                return {
                    modalOpen: !!document.querySelector('[data-adminv2-tasks-modal]'),
                    kpiPresent: !!kpi,
                    kpiText: metric(kpi),
                    viewPills: [...new Set(pills)],
                    truncated,
                };
            });
            console.log(`\n=== ${vp.name} (${vp.width}px) — modal opened via affordance: ${opened} ===`);
            console.log(`  tasks modal open: ${r.modalOpen} | KPI band present: ${r.kpiPresent}`);
            console.log(`  KPI band text: ${JSON.stringify(r.kpiText)}`);
            console.log(`  view pills:    ${JSON.stringify(r.viewPills)}`);
            console.log(`  truncated controls: ${JSON.stringify(r.truncated)}`);
            const both = r.kpiText.some((t) => /^Assigned$/i.test(t)) && r.viewPills.some((t) => /"Mine"/.test(t));
            console.log(`  "Assigned" and "Mine" visible together: ${both ? "YES" : "no"}`);
            await ctx.close();
        }
    },
);
