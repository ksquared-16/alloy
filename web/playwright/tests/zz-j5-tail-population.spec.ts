import { test } from "@playwright/test";

/**
 * OX J5 — CHARACTERISE THE FIRST-ACTIONABLE TAIL, AND TEST THE ENVIRONMENT HYPOTHESIS.
 *
 * P95 on 21 samples is unstable, and six hand-inspected examples are not a population. This takes a
 * large deployed sample of the SAME request the operator waits on, decomposes each one by the
 * server's own phase boundaries, and classifies what made it slow.
 *
 * IT ALSO CARRIES ITS OWN CONTROL. "Some of the tail is environmental" has been a hypothesis in this
 * programme for two slices and has never been tested. So each iteration pairs the drawer request
 * with an INDEPENDENT request the carrier work cannot have touched — a small admin route on the same
 * host, same session, issued back to back. If the two inflate together the host is slow; if only the
 * drawer inflates, the cause is on the drawer's own path and the environment story is wrong.
 *
 * Pairing beats comparing across runs: both numbers come from the same instant, so a busy minute
 * cannot masquerade as a code difference.
 */
const N = Number(process.env.OX_POP_N ?? "60");
const CONTROL = process.env.OX_CONTROL_PATH ?? "/api/admin/work-units";

test("j5 tail population and environment control", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(18_000);

    const ids: string[] = [];
    for (let i = 1; i < 5; i += 1) {
        const moved = await page.evaluate(`(() => {
            const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length <= ${i}) return false;
            rows[${i}].click(); return true;
        })()`);
        if (!moved) break;
        await page.waitForTimeout(6000);
        const id = await page.evaluate(`document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null`);
        if (id && !ids.includes(id as string)) ids.push(id as string);
    }
    console.log(`[pop] subjects=${ids.length}`);
    if (!ids.length) { console.log("[pop] no subjects discovered"); return; }

    const out = await page.evaluate(`(async (ids, n, controlPath) => {
        const rows = [];
        for (let i = 0; i < n; i += 1) {
            const id = ids[i % ids.length];

            // CONTROL FIRST, immediately before the drawer request, so the two sample the same instant.
            const c0 = performance.now();
            let controlMs = null, controlStatus = null;
            try {
                const cr = await fetch(controlPath, { credentials: 'include', cache: 'no-store' });
                controlStatus = cr.status;
                await cr.text();
                controlMs = Math.round(performance.now() - c0);
            } catch { controlMs = null; }

            const t0 = performance.now();
            let carrierAt = null, carrierRouteMs = null, vmAt = null, flush = null, phases = null, serverMs = null;
            try {
                const res = await fetch('/api/admin/view-models/drawer/opportunity/' + encodeURIComponent(id) + '?phased=1',
                    { credentials: 'include', cache: 'no-store' });
                const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
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
                                carrierRouteMs = o.__carrier_route_ms ?? null;
                                flush = o.__carrier.flushed_at_ms;
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
            } catch (e) { rows.push({ error: String(e), controlMs }); continue; }
            rows.push({ i, subject: id.slice(0,8), controlMs, controlStatus, carrierAt, carrierRouteMs, vmAt, flush, phases, serverMs });
            await new Promise((r) => setTimeout(r, 200));
        }
        return rows;
    })(${JSON.stringify(ids)}, ${N}, ${JSON.stringify(CONTROL)})`);

    for (const r of out as unknown[]) console.log(`[pop-row] ${JSON.stringify(r)}`);
    console.log(`[pop] done n=${(out as unknown[]).length}`);
});
