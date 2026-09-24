import { test } from "@playwright/test";

/**
 * OX J5 — GATE A: DOES THE IDENTITY EXIST BEFORE THE FULL DRAWER?
 *
 * Children and Household become truthful only when the drawer lands at ~3,112ms. The repair being
 * considered delivers their canonical truth earlier — but only if that truth is actually READY
 * earlier. If it is produced at the same moment the drawer completes, an intermediate delivery phase
 * would be an empty pipe, and the dispatch says to stop and name the producer instead.
 *
 * Both cards read truth produced inside shared deps: `_inquiry_children` through the children shell
 * inside the visible payload, and the household contact through the prep join. So the question is
 * arithmetic on the server's own boundaries, which PR #1267 made measurable for the first time:
 * `shared_deps_wall_ms` against `tiers_join_ms` and the total.
 *
 * OBSERVABILITY FIRST. This programme has shipped three instruments that ran green while measuring
 * nothing, so this one reports whether each field was FOUND, separately from its value. A missing
 * field reads as `null` with `fieldsSeen` naming what did arrive — silence and success cannot look
 * alike here.
 */
const N = Number(process.env.OX_GATEA_N ?? "24");

test("j5 gate a identity readiness", async ({ page }) => {
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
    if (!ids.length) { console.log("[gatea] no subjects discovered"); return; }
    console.log(`[gatea] subjects=${ids.length}`);

    const out = await page.evaluate(`(async (ids, n) => {
        const rows = [];
        for (let i = 0; i < n; i += 1) {
            const id = ids[i % ids.length];
            const t0 = performance.now();
            let carrierAt = null, vmAt = null, phases = null, routePhases = null, serverMs = null;
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
                                serverMs = o.__server_duration_ms ?? null;
                            }
                        }
                    }
                    if (done) break;
                }
            } catch (e) { rows.push({ error: String(e) }); continue; }
            const p = phases || {};
            rows.push({
                i,
                // OBSERVABILITY: what the payload actually contained, before any value is read.
                fieldsSeen: Object.keys(p).sort(),
                sharedDepsWall: p.shared_deps_wall_ms ?? null,
                sharedDepsTotal: p.shared_deps_total_ms ?? null,
                missionStages: p.mission_stages_ms ?? null,
                tiersJoin: p.tiers_join_ms ?? null,
                tierInitialLeg: p.tier_initial_leg_ms ?? null,
                tierDeferredLeg: p.tier_deferred_leg_ms ?? null,
                visibleEntity: p.visible_entity_ms ?? null,
                statusAndDept: p.status_and_dept_ms ?? null,
                householdNested: p.household_persons_nested_ms ?? null,
                composeTotal: p.total_ms ?? null,
                carrierAt, vmAt, serverMs,
                routeFull: routePhases?.full_compose_end_ms ?? null,
            });
            await new Promise((r) => setTimeout(r, 200));
        }
        return rows;
    })(${JSON.stringify(ids)}, ${N})`);

    for (const r of out as unknown[]) console.log(`[gatea-row] ${JSON.stringify(r)}`);
    console.log(`[gatea] done n=${(out as unknown[]).length}`);
});
