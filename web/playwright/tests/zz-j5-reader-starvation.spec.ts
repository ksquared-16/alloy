import { test } from "@playwright/test";

/**
 * OX J5 — IS THE STREAM READER STARVED DURING A ROW SWITCH?
 *
 * Two measurements disagree and the disagreement is the finding. Fetched in isolation, the carrier is
 * PROCESSED at the server's flush plus about 290ms, and the first chunk contains the carrier alone —
 * so the transport streams correctly. Fetched during a real row switch, the same 392-548ms server
 * flush produced processing at 2,045-4,167ms.
 *
 * The bytes are early and the JavaScript that reads them is late. The remaining candidate is
 * main-thread occupancy: `reader.read()` cannot resolve while the thread is executing a long task,
 * and a row switch is exactly when the thread is busiest.
 *
 * So this samples the SAME operator event with a long-task observer running, and pairs each carrier's
 * processing delay with the main-thread time blocked between the click and that moment. If the slow
 * samples are the blocked ones, the owner is client scheduling and no server repair moves P95. If
 * they are not, the thread is idle while the carrier is late and the cause is still upstream.
 */
const RUNS = Number(process.env.OX_STARVE_RUNS ?? "15");

test("j5 reader starvation", async ({ page }) => {
    test.setTimeout(900_000);
    await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        const lt: Array<{ at: number; dur: number }> = [];
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) lt.push({ at: Math.round(e.startTime), dur: Math.round(e.duration) });
            }).observe({ entryTypes: ["longtask"] });
        } catch { /* not all browsers */ }
        w.__lt = lt;
    });

    const out: unknown[] = [];
    for (let run = 0; run < RUNS; run += 1) {
        if (run % 3 === 0) {
            await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
            await page.waitForTimeout(16_000);
        }
        const sample = await page.evaluate(`(async (idx) => {
            const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length < 2) return { error: 'not enough rows' };
            const target = rows[1 + (idx % Math.max(1, rows.length - 1))];
            const lt = window.__lt;
            const before = document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const diagBefore = (window.__ALLOY_CARRIER_DIAG__ || []).length;
            const ltBefore = lt.length;

            const clickAt = performance.now();
            target.click();
            await new Promise((r) => setTimeout(r, 12000));

            const diag = (window.__ALLOY_CARRIER_DIAG__ || []).slice(diagBefore);
            const after = document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const arrival = diag.length ? Math.round(Math.min(...diag.map((d) => d.t)) - clickAt) : null;
            const flush = diag.length ? diag[0].flushed_at_ms : null;

            // Main-thread time BLOCKED between the click and the carrier being processed.
            const tasks = lt.slice(ltBefore).map((t) => ({ rel: Math.round(t.at - clickAt), dur: t.dur }));
            const upTo = arrival == null ? tasks : tasks.filter((t) => t.rel < arrival);
            const blocked = upTo.reduce((s, t) => s + t.dur, 0);
            const longest = upTo.reduce((m, t) => Math.max(m, t.dur), 0);
            return {
                switched: after !== before, arrival, flush,
                blockedMsBeforeArrival: blocked,
                longestTaskMs: longest,
                taskCountBeforeArrival: upTo.length,
                tasks: upTo.slice(0, 8),
            };
        })(${run})`);
        console.log(`[starve] ${JSON.stringify(sample)}`);
        out.push(sample);
        await page.waitForTimeout(1200);
    }
    console.log(`[starve] done n=${out.length}`);
});
