import { test } from "@playwright/test";

/**
 * OX J5 — WHICH CARD ACTUALLY HOLDS ALL-FIRST-ORDER OPEN.
 *
 * ALL FIRST ORDER fires in the same millisecond as full-drawer-visible in 19 of 21 deployed samples,
 * so T6 is not "first-order facts are slow" — it is first-order readiness defined as transport
 * completion. But the commit frame already admits nine cards: five whose content is knowable from the
 * provisioning answer, and four that mount self-loading because their identity is. A self-loading
 * card renders its real self, not a reserve, so it does not hold T6 open.
 *
 * Something in the configured set therefore falls in neither bucket, and the grid reserves its cell
 * until settlement. This names it instead of reasoning about it: after the click it samples which
 * cells are still reserved, by card key, until none remain — so the LAST card to un-reserve is the
 * one that owns T6, and the ones that clear at commit are shown to be already free.
 */
const RUNS = Number(process.env.OX_FO_RUNS ?? "6");

test("j5 first-order census", async ({ page }) => {
    test.setTimeout(900_000);
    for (let run = 0; run < RUNS; run += 1) {
        await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
        await page.waitForTimeout(16_000);

        const sample = await page.evaluate(`(async (idx) => {
            const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length < 2) return { error: 'not enough rows' };
            const target = rows[1 + (idx % Math.max(1, rows.length - 1))];
            const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const before = bodySubject();

            const reservedNow = () => [...document.querySelectorAll('[data-focus-panel-cell-preparing]')]
                .map((e) => e.getAttribute('data-focus-panel-cell-preparing')).filter(Boolean);
            const cellsNow = () => document.querySelectorAll('.alloy-os-ucard').length;

            const t0 = performance.now();
            target.click();

            // Sample the reserved SET over time. The card that clears last owns ALL FIRST ORDER.
            const timeline = [];
            const cleared = {};
            let lastSet = null;
            for (let i = 0; i < 260; i += 1) {
                await new Promise((r) => setTimeout(r, 50));
                const rs = reservedNow().sort();
                const key = rs.join(',');
                if (key !== lastSet) {
                    const at = Math.round(performance.now() - t0);
                    timeline.push({ at, reserved: rs, cells: cellsNow() });
                    if (lastSet != null) {
                        for (const k of lastSet.split(',').filter(Boolean)) {
                            if (!rs.includes(k) && cleared[k] == null) cleared[k] = at;
                        }
                    }
                    lastSet = key;
                }
                if (rs.length === 0 && cellsNow() >= 6 && bodySubject() !== before) break;
            }
            return {
                subject: bodySubject(),
                switched: bodySubject() !== before,
                clearedAt: cleared,
                lastToClear: Object.entries(cleared).sort((a,b) => b[1]-a[1])[0] ?? null,
                timeline: timeline.slice(0, 14),
                finalCells: cellsNow(),
                finalReserved: reservedNow(),
            };
        })(${run})`);
        console.log(`[fo] ${JSON.stringify(sample)}`);
        await page.waitForTimeout(1500);
    }
    console.log(`[fo] done runs=${RUNS}`);
});
