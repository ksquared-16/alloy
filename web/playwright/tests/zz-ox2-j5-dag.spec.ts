import { test } from "@playwright/test";

/**
 * OX SLICE 2 — PROVE THE J5 REQUEST DAG BEFORE CHANGING ANYTHING.
 *
 * The runtime already distinguishes queue_row_open_cache_hit / _miss(scope_mismatch|no_entry), but
 * those route through perfDebugTraceEnabled(), which is a BUILD-TIME flag that deployed staging does
 * not set. So consumption is proven from the network instead, which needs no build change:
 *
 *   warm the row by pointer intent, record every request it issues,
 *   then click and record every request again.
 *
 * A URL that appears in BOTH windows was warmed and then re-fetched — the warm result was not
 * consumed. A URL only in the hover window was consumed. This is direct evidence of the
 * consumption question rather than an inference from total duration.
 */
test("ox2 j5 dag", async ({ page }) => {
    test.setTimeout(240_000);

    await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        const reqs: Array<{ at: number; end: number; path: string; size: number }> = [];
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    const r = e as PerformanceResourceTiming;
                    let path = r.name;
                    try { path = new URL(r.name).pathname + new URL(r.name).search; } catch { /* keep raw */ }
                    reqs.push({ at: Math.round(r.startTime), end: Math.round(r.responseEnd), path, size: r.transferSize || 0 });
                }
            }).observe({ entryTypes: ["resource"] });
        } catch { /* ignore */ }
        w.__dag = { reqs, marks: {} as Record<string, number> };
    });

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(15000);

    // ── HOVER WINDOW ──────────────────────────────────────────────────────────────────
    const hoverAt = await page.evaluate(`(() => {
        const w = window.__dag;
        w.marks.hoverAt = Math.round(performance.now());
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 2) return -1;
        const cur = rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        const next = rows[cur>=0?(cur+1)%rows.length:1];
        w.__target = next;
        for (const t of ["pointerover","mouseover","pointerenter","mouseenter"]) {
            next.dispatchEvent(new MouseEvent(t, { bubbles: true }));
        }
        return w.marks.hoverAt;
    })()`);
    // Give the warm the time it needs to actually complete, so the click can see a settled entry.
    await page.waitForTimeout(6000);

    // ── CLICK WINDOW ──────────────────────────────────────────────────────────────────
    await page.evaluate(`(() => {
        const w = window.__dag;
        w.marks.clickAt = Math.round(performance.now());
        w.__target.click();
        return true;
    })()`);
    await page.waitForTimeout(12000);

    const out = await page.evaluate(() => {
        const w = window as unknown as { __dag: { reqs: Array<{ at: number; end: number; path: string; size: number }>; marks: Record<string, number> } };
        const { reqs, marks } = w.__dag;
        const app = (r: { path: string }) => r.path.startsWith("/api/") || r.path.includes("provisioning-answer");
        const inWindow = (r: { at: number }, a: number, b: number) => r.at >= a && r.at < b;
        const hoverWin = reqs.filter((r) => app(r) && inWindow(r, marks.hoverAt, marks.clickAt))
            .map((r) => ({ path: r.path, rel: r.at - marks.hoverAt, dur: r.end - r.at }));
        const clickWin = reqs.filter((r) => app(r) && r.at >= marks.clickAt)
            .map((r) => ({ path: r.path, rel: r.at - marks.clickAt, dur: r.end - r.at }));
        const base = (p: string) => p.split("?")[0];
        const hoverPaths = new Set(hoverWin.map((r) => base(r.path)));
        const refetched = clickWin.filter((r) => hoverPaths.has(base(r.path)));
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            marks,
            hoverWin, clickWin,
            refetchedAfterWarm: refetched,
            verdict: hoverWin.length === 0 ? "NO_WARM_REQUESTS_AT_ALL"
                : refetched.length > 0 ? "WARM_RESULT_NOT_CONSUMED" : "WARM_RESULT_CONSUMED",
        };
    });
    console.log(`[dag] ${JSON.stringify(out)}`);
});
