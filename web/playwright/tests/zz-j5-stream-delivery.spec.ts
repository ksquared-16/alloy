import { test } from "@playwright/test";

/**
 * OX J5 — IS PHASE 1 ACTUALLY DELIVERED WHEN IT IS WRITTEN?
 *
 * Measured across 36 deployed row switches: the carrier's arrival at the browser correlates with the
 * TOTAL response duration at r = +0.835, and with the moment the server actually wrote it at only
 * +0.328. A delivery that tracks the whole response is not an early delivery — it is a late one that
 * happens to be first in the file.
 *
 * Two mechanisms produce that signature and they need different repairs, so this distinguishes them
 * by reading the bytes rather than reasoning about the framework: it records the response headers,
 * the time to the FIRST chunk of any kind, the time to the carrier line, and the time to the end. If
 * the first chunk arrives late and carries both lines, something between the route and the browser is
 * accumulating the stream. If the first chunk arrives early with only the carrier in it, streaming
 * works and the correlation has another cause.
 */
const N = Number(process.env.OX_STREAM_N ?? "12");

test("j5 stream delivery", async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(16_000);

    const ids: string[] = [];
    for (let i = 1; i < 4; i += 1) {
        const ok = await page.evaluate(`(() => { const r=[...document.querySelectorAll('.alloy-os-queue-row-card')]; if (r.length<=${i}) return false; r[${i}].click(); return true; })()`);
        if (!ok) break;
        await page.waitForTimeout(6000);
        const id = await page.evaluate(`document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null`);
        if (id && !ids.includes(id as string)) ids.push(id as string);
    }
    if (!ids.length) { console.log("[stream] no subjects"); return; }

    const out = await page.evaluate(`(async (ids, n) => {
        const rows = [];
        for (let i = 0; i < n; i += 1) {
            const id = ids[i % ids.length];
            const t0 = performance.now();
            const res = await fetch('/api/admin/view-models/drawer/opportunity/' + encodeURIComponent(id) + '?phased=1',
                { credentials: 'include', cache: 'no-store' });
            const hdrs = {
                contentType: res.headers.get('content-type'),
                contentEncoding: res.headers.get('content-encoding'),
                transferEncoding: res.headers.get('transfer-encoding'),
                cacheControl: res.headers.get('cache-control'),
                xAccelBuffering: res.headers.get('x-accel-buffering'),
                xVercelCache: res.headers.get('x-vercel-cache'),
                contentLength: res.headers.get('content-length'),
            };
            const reader = res.body.getReader(); const dec = new TextDecoder();
            let buf = '', firstChunkAt = null, firstChunkBytes = null, firstChunkHadViewModel = null;
            let carrierAt = null, vmAt = null, flush = null, chunks = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (value) {
                    chunks += 1;
                    if (firstChunkAt == null) {
                        firstChunkAt = Math.round(performance.now() - t0);
                        firstChunkBytes = value.byteLength;
                        const peek = dec.decode(value, { stream: true });
                        firstChunkHadViewModel = peek.includes('__viewModel');
                        buf += peek;
                    } else {
                        buf += dec.decode(value, { stream: true });
                    }
                    let nl = buf.indexOf('\\n');
                    while (nl >= 0) {
                        const line = buf.slice(0, nl); buf = buf.slice(nl + 1); nl = buf.indexOf('\\n');
                        if (!line.trim()) continue;
                        let o; try { o = JSON.parse(line); } catch { continue; }
                        if (o.__carrier && carrierAt == null) { carrierAt = Math.round(performance.now() - t0); flush = o.__carrier.flushed_at_ms; }
                        if (o.__viewModel && vmAt == null) vmAt = Math.round(performance.now() - t0);
                    }
                }
                if (done) break;
            }
            rows.push({ i, hdrs, chunks, firstChunkAt, firstChunkBytes, firstChunkHadViewModel, carrierAt, vmAt, flush });
            await new Promise((r) => setTimeout(r, 300));
        }
        return rows;
    })(${JSON.stringify(ids)}, ${N})`);

    for (const r of out as unknown[]) console.log(`[stream-row] ${JSON.stringify(r)}`);
    console.log(`[stream] done n=${(out as unknown[]).length}`);
});
