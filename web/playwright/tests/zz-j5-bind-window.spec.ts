import { test } from "@playwright/test";

/**
 * OX J5 — WHO OWNS THE WINDOW BETWEEN "NO CELL IS RESERVED" AND "EVERY CARD NAMES B"?
 *
 * The convergence run measured, on the same sample, reserved cells reaching zero at ~470-560ms while
 * not one card declared the committed subject until ~930-1,270ms. Something is mounted in those cells
 * for half a second that does not vouch for B. Counting cells cannot say what — so this names every
 * cell: its card key, the subject it declares, and whether it is a reserve, a resolved-empty or a
 * real card. Keys and classifications only; never a value.
 */
test("j5 bind window", async ({ page }) => {
    test.setTimeout(600_000);
    for (let run = 0; run < 3; run += 1) {
        await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
        await page.waitForTimeout(15_000);
        const out = await page.evaluate(`(async (idx) => {
            const rows = [...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length < 2) return { skipped: 'no_rows' };
            const target = rows[1 + (idx % Math.max(1, rows.length - 1))];
            const body = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const before = body();
            const cells = () => [...document.querySelectorAll('.alloy-os-ucard')].map((e) => ({
                k: e.getAttribute('data-universal-card-key') || e.getAttribute('data-focus-panel-cell-preparing') || null,
                // Whose content is this? null = the card declines to vouch for any subject.
                s: e.getAttribute('data-card-subject'),
                st: e.hasAttribute('data-focus-panel-cell-reserved') ? 'reserved'
                    : e.hasAttribute('data-focus-panel-cell-not-applicable') ? 'resolved_empty'
                    : 'mounted',
                // Is it inside the Focus Panel grid at all? The ucard class is used elsewhere too.
                inGrid: !!e.closest('[data-alloy-os-focus-panel-grid], .alloy-os-focus-panel-grid'),
            }));
            const t0 = performance.now();
            target.click();
            const frames = [];
            for (let i = 0; i < 90; i += 1) {
                await new Promise((r) => setTimeout(r, 40));
                const t = Math.round(performance.now() - t0);
                const c = cells();
                const sig = JSON.stringify(c.map((x) => [x.k, x.s === body() ? 'B' : x.s === before ? 'A' : x.s == null ? 'NONE' : 'OTHER', x.st, x.inGrid]));
                if (!frames.length || frames[frames.length - 1].sig !== sig) frames.push({ t, sig, n: c.length });
                if (t > 3500 && frames.length > 3) break;
            }
            return { switched: body() !== before, frames: frames.slice(0, 22) };
        })(${run})`);
        console.log(`[bind] ${JSON.stringify({ run, out })}`);
    }
});
