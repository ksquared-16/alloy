/**
 * R14 — mobile fit gate for the new view-rail and KPI vocabulary.
 *
 * `Assigned to me` is materially longer than `Mine`, and the rail label is a `truncate` span next to
 * a count badge. Truncation to an ambiguous fragment ("Assigned…") would be worse than the wording it
 * replaced, so this measures the real element geometry at each width rather than eyeballing a
 * screenshot: rendered vs natural width, overlap with the count, and horizontal overflow of the page.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, withResource } from "./r11Env.mjs";

const WIDTHS = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile-430", width: 430, height: 932 },
    { name: "mobile-390", width: 390, height: 844 },
    { name: "smallest-320", width: 320, height: 568 },
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
            for (const sel of ['[aria-label^="Work Items"]', '[aria-label^="Tasks"]', '[aria-label*="task" i]']) {
                try { await page.locator(sel).first().click({ timeout: 6000 }); break; } catch { /* next */ }
            }
            await page.waitForTimeout(6000);
            try { await page.locator('[data-workspace-section-tab="queue"]').first().click({ timeout: 8000 }); } catch { /* already there */ }
            await page.waitForTimeout(7000);

            const r = await page.evaluate(() => {
                const btn = document.querySelector('[data-work-items-view="mine"]');
                const span = btn?.querySelector("span");
                const count = btn?.querySelector("span:last-child");
                const kpi = document.querySelector('[data-testid="work-items-kpi-band"]');
                const kpiLabels = [...(kpi?.querySelectorAll("*") ?? [])]
                    .filter((e) => e.children.length === 0 && (e.textContent ?? "").trim())
                    .map((e) => (e.textContent ?? "").trim());
                const overlap = (() => {
                    if (!span || !count) return null;
                    const a = span.getBoundingClientRect(), b = count.getBoundingClientRect();
                    return a.right > b.left + 0.5;
                })();
                return {
                    railPresent: !!btn,
                    label: span?.textContent?.trim() ?? null,
                    // A truncate span reports its full text width as scrollWidth.
                    rendered: span ? Math.round(span.clientWidth) : null,
                    natural: span ? Math.round(span.scrollWidth) : null,
                    truncated: span ? span.scrollWidth > span.clientWidth + 1 : null,
                    lines: span ? Math.round(span.getBoundingClientRect().height) : null,
                    overlapsCount: overlap,
                    kpiLabels,
                    pageOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
                };
            });
            const verdict =
                !r.railPresent ? "rail not rendered at this width"
                : r.truncated ? "TRUNCATED — fallback required"
                : r.overlapsCount ? "OVERLAPS COUNT"
                : "fits";
            console.log(`\n=== ${vp.name} (${vp.width}px) ===`);
            console.log(`  rail label: ${JSON.stringify(r.label)}  rendered=${r.rendered}px natural=${r.natural}px height=${r.lines}px`);
            console.log(`  truncated=${r.truncated} overlapsCount=${r.overlapsCount} pageOverflowX=${r.pageOverflowX}`);
            console.log(`  KPI labels: ${JSON.stringify(r.kpiLabels.filter((t) => !/^[\d—]+$/.test(t)))}`);
            console.log(`  VERDICT: ${verdict}`);
            await ctx.close();
        }
    },
);
