import { test } from "@playwright/test";

/**
 * OX J5 — THE VISIBLE_ENTITY WALL, RECONCILED PER SAMPLE.
 *
 * visible_entity is the largest measured owner inside shared deps at P50 ~1,200ms, and shared deps
 * at P50 1,978ms is what ALL FIRST ORDER waits on. Which branch controls that wall cannot be read
 * off aggregate percentiles: the shell is a four-leg Promise.all whose cost is MAX, not sum, and
 * subtracting one P50 from another mixes samples that never coexisted.
 *
 * So this captures the ENTIRE phases_ms object per request and reconciles each sample on its own
 * terms. Both identity facts live in that shell join — `shell_children_ms` produces the roster and
 * `shell_persons_ms` the contact — so the question Part 6 asks is answerable directly: does the
 * shell finish materially before visible_entity does, and if so what is holding the rest.
 *
 * OBSERVABILITY. `phaseKeys` reports what the payload actually carried, so a field that is missing
 * reads as missing rather than as a zero. Three instruments in this programme have run green while
 * measuring nothing of their subject.
 */
const N = Number(process.env.OX_DAG_N ?? "24");

test("j5 visible entity dag", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(16_000);

    const ids: string[] = [];
    for (let i = 1; i < 5; i += 1) {
        const ok = await page.evaluate(`(() => { const r=[...document.querySelectorAll('.alloy-os-queue-row-card')]; if (r.length<=${i}) return false; r[${i}].click(); return true; })()`);
        if (!ok) break;
        await page.waitForTimeout(6000);
        const id = await page.evaluate(`document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null`);
        if (id && !ids.includes(id as string)) ids.push(id as string);
    }
    if (!ids.length) { console.log("[dag] no subjects"); return; }
    console.log(`[dag] subjects=${ids.length}`);

    const out = await page.evaluate(`(async (ids, n) => {
        const rows = [];
        for (let i = 0; i < n; i += 1) {
            const id = ids[i % ids.length];
            const t0 = performance.now();
            let phases = null, routePhases = null, carrierAt = null, vmAt = null;
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
                            if (o.__carrier && carrierAt == null) carrierAt = Math.round(performance.now() - t0);
                            if (o.__viewModel && vmAt == null) {
                                vmAt = Math.round(performance.now() - t0);
                                phases = o.__viewModel?.timing?.phases_ms ?? null;
                                routePhases = o.__route_phases ?? null;
                            }
                        }
                    }
                    if (done) break;
                }
            } catch (e) { rows.push({ error: String(e) }); continue; }
            // The WHOLE object, so reconciliation is not limited by what this probe thought to name.
            rows.push({ i, phaseKeys: phases ? Object.keys(phases).length : null, phases, routePhases, carrierAt, vmAt });
            await new Promise((r) => setTimeout(r, 200));
        }
        return rows;
    })(${JSON.stringify(ids)}, ${N})`);

    for (const r of out as unknown[]) console.log(`[dag-row] ${JSON.stringify(r)}`);
    console.log(`[dag] done n=${(out as unknown[]).length}`);
});
