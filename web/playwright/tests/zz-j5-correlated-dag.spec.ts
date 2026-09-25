import { test } from "@playwright/test";

/**
 * OX J5 — ONE EVENT, BOTH CLOCKS.
 *
 * T6 P50 2,680ms and shared_deps_wall P50 1,322ms are two population medians taken on two clocks
 * from two different observations. Subtracting them yields ~1,367ms, which is a hint and not a
 * phase. This measures the SAME switch end to end:
 *
 *   A  serverChildrenTruthReadyMs  server offset at which `_inquiry_children` became canonical
 *   B  serverTotalMs               server offset at which the compose finished
 *   C  vmAppliedAt - t0            browser instant the VM for this subject landed
 *   D  clearedAt                   browser instant children/household stopped being reserved
 *
 * from which, per sample:
 *
 *   server tail after the fact = B - A
 *   transport + request start  = C - B
 *   commit/render after the VM = D - C
 *   total wait after the fact  = D - C + B - A
 *
 * Cold samples only: the page is reloaded between switches, and a sample counts only once the
 * reserved phase has actually been observed. A warm subject holds the drawer already and never
 * shows the event being measured; an earlier probe that skipped both reported ~100ms clears for
 * switches that had not begun.
 */
const RUNS = Number(process.env.OX_COR_RUNS ?? "22");

test("j5 correlated dag", async ({ page }) => {
    test.setTimeout(2_400_000);

    for (let run = 0; run < RUNS; run += 1) {
        await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
        await page.waitForTimeout(14_000);

        const out = await page.evaluate(`(async (idx) => {
            const rows = [...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length < 2) return { skipped: 'no_rows' };
            const target = rows[1 + (idx % Math.max(1, rows.length - 1))];
            const subj = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const was = subj();
            const d = () => window.__ALLOY_FOCUS_SETTLEMENT_DIAG__ || {};
            const prep = () => [...document.querySelectorAll('[data-focus-panel-cell-preparing]')]
                .map((e) => e.getAttribute('data-focus-panel-cell-preparing'));

            const t0 = performance.now();
            target.click();
            let sawReserved = false, reservedAt = null, clearedAt = null, atClear = null;
            for (let i = 0; i < 300; i += 1) {
                await new Promise((r) => setTimeout(r, 40));
                const t = Math.round(performance.now() - t0);
                const p = prep();
                const waiting = p.includes('children') || p.includes('household');
                if (waiting && !sawReserved) { sawReserved = true; reservedAt = t; }
                if (sawReserved && !waiting && clearedAt == null) {
                    clearedAt = t;
                    const g = d();
                    atClear = {
                        A: g.serverChildrenTruthReadyMs ?? null,
                        Acontact: g.serverContactTruthReadyMs ?? null,
                        B: g.serverTotalMs ?? null,
                        sharedDeps: g.serverSharedDepsWallMs ?? null,
                        visibleEntity: g.serverVisibleEntityMs ?? null,
                        vmAppliedAbs: g.vmAppliedAt ?? null,
                        childrenTruth: g.inquiryChildrenIdentityPresent ?? null,
                        contactTruth: g.primaryContactIdentityPresent ?? null,
                    };
                }
                if (clearedAt != null && t > clearedAt + 600) break;
                if (!sawReserved && t > 6000) break;
            }
            const C = atClear && atClear.vmAppliedAbs != null ? Math.round(atClear.vmAppliedAbs - t0) : null;
            return { switched: subj() !== was, sawReserved, reservedAt, clearedAt, C, ...(atClear || {}) };
        })(${run})`);
        console.log(`[cor] ${JSON.stringify({ run, out })}`);
    }
    console.log(`[cor] done runs=${RUNS}`);
});
