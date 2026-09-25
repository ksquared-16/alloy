import { test } from "@playwright/test";

/**
 * OX SLICE 8 — DID THE FRAME ACTUALLY ARRIVE EARLY?
 *
 * The after-measurement showed actionable essentially unchanged, and the obvious reading — "the
 * two-phase repair did nothing" — is not supported by the duration it was read from. For a streamed
 * response `responseEnd` is when the stream CLOSES, which is after phase 2 by construction, so the
 * ~2.2s round trip is exactly what a working two-phase seam would also report.
 *
 * `responseStart` is the byte that settles it: it is when the first byte of the frame arrived. If it
 * is early and actionable is late, the server did its part and the client is holding the frame. If it
 * is late, the seam never deferred and the repair is not in the path at all. Those are opposite
 * repairs, so the number is measured rather than chosen between.
 */
test("ox8 provisioning ttfb", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(14000);

    // The provisioning answer is issued by the J5 gesture, not by the page load.
    await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 2) return false;
        const cur = rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        const t = rows[cur>=0?(cur+1)%rows.length:1];
        for (const e of ["pointerover","mouseover","pointerenter","mouseenter"]) t.dispatchEvent(new MouseEvent(e,{bubbles:true}));
        window.__t = t; return true;
    })()`);
    await page.waitForTimeout(800);
    await page.evaluate(`window.__t.click()`);
    await page.waitForTimeout(12000);

    const out = await page.evaluate(() => {
        const rows = performance.getEntriesByType("resource")
            .filter((e) => e.name.includes("provisioning-answer"))
            .map((e) => {
                const r = e as PerformanceResourceTiming;
                return {
                    phased: r.name.includes("phased=1"),
                    ttfb_ms: Math.round(r.responseStart - r.startTime),
                    total_ms: Math.round(r.responseEnd - r.startTime),
                    // The gap between the first byte and the stream closing IS the deferred phase.
                    stream_tail_ms: Math.round(r.responseEnd - r.responseStart),
                };
            });
        return { signedOut: !!document.querySelector('input[type="password"]'), rows };
    });
    console.log(`[ttfb] ${JSON.stringify(out)}`);
});
