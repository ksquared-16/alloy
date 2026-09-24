import { test } from "@playwright/test";

/**
 * OX J5 — WHERE THE FIRST-ACTIONABLE TAIL ACTUALLY LIVES.
 *
 * Deployed 0fed7c2e reached FIRST ACTIONABLE P50 424ms and P95 1,883ms against a P95 target of
 * 1,250ms. Both samples over the target had the SERVER reaching its own flush point late — 1,687ms
 * and 7,769ms into compose — and the carrier mounted 109ms and 85ms afterwards. So the tail is not
 * transport, and repairing transport further would buy nothing.
 *
 * That leaves a question the UI probe cannot answer at n=20: WHICH part of the pre-flush path is
 * slow, and is the tail a property of one leg or of the whole request. This asks the route directly,
 * many times, which costs a fetch rather than a page load and therefore affords a real distribution.
 *
 * Every number here is the server's own: `__route_phases` on the phase-2 line gives the gate, the
 * org assertion and the participant resolve, and the carrier gives `flushed_at_ms` from the start of
 * compose. Together they decompose the whole wait, and the client-side arrival times bound the
 * network on top. Nothing is inferred from quiescence.
 */
const N = Number(process.env.OX_TAIL_N ?? "30");

test("j5 compose tail attribution", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(18_000);

    const subjects = await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        // The queue row carries the subject on its own attributes or its link; fall back to clicking.
        const ids = rows.map((r) => r.getAttribute('data-subject-id') || r.getAttribute('data-record-id') || null).filter(Boolean);
        return ids;
    })()`);

    // If the rows do not advertise their ids, learn one by selecting a row and reading the committed subject.
    let ids: string[] = Array.isArray(subjects) ? (subjects as string[]) : [];
    if (!ids.length) {
        for (let i = 1; i < 5; i += 1) {
            const moved = await page.evaluate(`(() => {
                const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
                if (rows.length <= ${i}) return false;
                rows[${i}].click();
                return true;
            })()`);
            if (!moved) break;
            await page.waitForTimeout(6000);
            const id = await page.evaluate(`document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null`);
            if (id && !ids.includes(id as string)) ids.push(id as string);
        }
    }
    console.log(`[tail] subjects=${ids.length}`);
    if (!ids.length) { console.log("[tail] no subjects discovered"); return; }

    const out = await page.evaluate(`(async (ids, n) => {
        const rows = [];
        for (let i = 0; i < n; i += 1) {
            const id = ids[i % ids.length];
            const url = '/api/admin/view-models/drawer/opportunity/' + encodeURIComponent(id) + '?phased=1';
            const t0 = performance.now();
            let carrierAt = null, vmAt = null, flush = null, phases = null, serverMs = null, actions = null;
            try {
                const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
                const reader = res.body.getReader();
                const dec = new TextDecoder();
                let buf = '';
                for (;;) {
                    const { done, value } = await reader.read();
                    if (value) {
                        buf += dec.decode(value, { stream: true });
                        let nl = buf.indexOf('\\n');
                        while (nl >= 0) {
                            const line = buf.slice(0, nl); buf = buf.slice(nl + 1); nl = buf.indexOf('\\n');
                            if (!line.trim()) continue;
                            let o; try { o = JSON.parse(line); } catch { continue; }
                            if (o.__carrier && carrierAt == null) {
                                carrierAt = Math.round(performance.now() - t0);
                                flush = o.__carrier.flushed_at_ms;
                                actions = (o.__carrier.header_menu || []).filter((a) => a.readiness === 'CARRIER_SAFE').length;
                            }
                            if (o.__viewModel && vmAt == null) {
                                vmAt = Math.round(performance.now() - t0);
                                phases = o.__route_phases || null;
                                serverMs = o.__server_duration_ms ?? null;
                            }
                        }
                    }
                    if (done) break;
                }
            } catch (e) { rows.push({ error: String(e) }); continue; }
            rows.push({ subject: id.slice(0,8), carrierAt, vmAt, flush, phases, serverMs, executable: actions });
            await new Promise((r) => setTimeout(r, 250));
        }
        return rows;
    })(${JSON.stringify(ids)}, ${N})`);

    for (const r of out as unknown[]) console.log(`[tail-row] ${JSON.stringify(r)}`);
    console.log(`[tail] done n=${(out as unknown[]).length}`);
});
