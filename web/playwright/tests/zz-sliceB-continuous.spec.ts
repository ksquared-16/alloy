import { test } from "@playwright/test";

/**
 * SLICE B — CONTINUOUS QUEUE-ROW SWITCHING, THE WAY AN OPERATOR ACTUALLY DOES IT.
 *
 * The complaint is not about a cold first switch — that is the J5 journey, already certified. It is
 * that repeated switching INSIDE an already-open Work Unit still feels inconsistent. So: one page
 * load, no reloads between switches, and the pointer moves to the destination row before clicking,
 * because that is what a person does and it is what arms the prewarm.
 *
 * Milestones reuse the canonical instruments this programme already deployed, not new ones:
 *   T3  the row acknowledges
 *   T4  the committed subject is B (the safe frame)
 *   T5  the action rail is mounted for B and declares an executable action
 *   T6  every configured first-order cell names B with a readiness that means its fact arrived,
 *       read from data-focus-panel-cell-key/-readiness/-subject
 *
 * SB_MODE=hover is the primary population; SB_MODE=nohover is the control that skips the pointer
 * move. They are never pooled — the whole question is whether hovering helps.
 */
const MODE = process.env.SB_MODE ?? "hover";
const N = Number(process.env.SB_N ?? "12");
const FIRST_ORDER = ["current_work", "business_process", "household", "children", "readiness_kpi"];

test("slice B continuous switching", async ({ page }) => {
    test.setTimeout(1_800_000);

    await page.addInitScript(`(() => {
        const reqs = [];
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    const n = e.name;
                    if (n.indexOf('/api/admin/') === -1) continue;
                    let p = n; try { const u = new URL(n); p = u.pathname + u.search; } catch (x) { /* raw */ }
                    reqs.push({ at: Math.round(e.startTime), end: Math.round(e.responseEnd), path: p });
                }
            }).observe({ entryTypes: ['resource'] });
        } catch (e) { /* absence reported, never faked */ }
        window.__sb = { reqs: reqs };
    })()`);

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(15_000);

    const rowBox = async (id: string) => page.evaluate(`(() => {
        const r = document.querySelector('.alloy-os-queue-row-card[data-entity-id="${id}"]');
        if (!r) return null;
        const b = r.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    })()`) as Promise<{ x: number; y: number } | null>;

    const ids = await page.evaluate(`(() => [...document.querySelectorAll('.alloy-os-queue-row-card')]
        .map((e) => e.getAttribute('data-entity-id')).filter(Boolean))()`) as string[];
    if (ids.length < 3) { console.log(`[SB] ${JSON.stringify({ skipped: "too_few_rows", n: ids.length })}`); return; }

    // Settle the surface on the first row so every measured switch is a CONTINUOUS one.
    await page.evaluate(`(() => { const r=document.querySelector('.alloy-os-queue-row-card[data-entity-id="${ids[0]}"]'); if(r) r.click(); })()`);
    await page.waitForTimeout(9000);

    const samples: unknown[] = [];
    const visited: Record<string, boolean> = { [ids[0]]: true };

    for (let i = 0; i < N; i += 1) {
        const id = ids[(i + 1) % ids.length];
        if (id === undefined) continue;

        const reqBefore = await page.evaluate(`window.__sb.reqs.length`) as number;
        let hoverAt: number | null = null;
        const tHover = Date.now();
        if (MODE === "hover") {
            const b = await rowBox(id);
            if (b) { await page.mouse.move(b.x, b.y); hoverAt = 0; await page.waitForTimeout(450); }
        }
        const dwell = Date.now() - tHover;

        const out = await page.evaluate(`(async (id, dwell, firstOrder) => {
            const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const rowActive = (x) => {
                const r = document.querySelector('.alloy-os-queue-row-card[data-entity-id="' + x + '"]');
                return !!r && r.getAttribute('data-queue-row-active') === 'true';
            };
            const cells = () => {
                const out = {};
                for (const e of document.querySelectorAll('[data-focus-panel-cell-key]')) {
                    out[e.getAttribute('data-focus-panel-cell-key')] = {
                        readiness: e.getAttribute('data-focus-panel-cell-readiness'),
                        subject: e.getAttribute('data-focus-panel-cell-subject'),
                        reason: e.getAttribute('data-focus-panel-cell-settled-reason'),
                        mounted: e.getAttribute('data-focus-panel-cell-mounted') === 'true',
                    };
                }
                return out;
            };
            const railExec = (subj) => {
                const r = document.querySelector('[data-focus-panel-carrier-actions="true"][data-focus-panel-carrier-subject="' + subj + '"]');
                return !!r && Number(r.getAttribute('data-focus-panel-carrier-executable-count') || '0') > 0;
            };
            const cardSubjects = () => {
                const v = [...new Set([...document.querySelectorAll('[data-card-subject]')].map((e) => e.getAttribute('data-card-subject')))];
                return v.length === 1 ? v[0] : (v.length ? 'MIXED' : null);
            };

            const before = bodySubject();
            const el = document.querySelector('.alloy-os-queue-row-card[data-entity-id="' + id + '"]');
            if (!el) return { id, skipped: 'row_gone' };
            const reqAtClick = window.__sb.reqs.length;
            const t0 = performance.now();
            el.click();

            let T3 = null, T4 = null, T5 = null, T6 = null, mixedFrames = 0, cellKeys = null;
            for (let k = 0; k < 320; k += 1) {
                await new Promise((r) => setTimeout(r, 40));
                const t = Math.round(performance.now() - t0);
                const s = bodySubject();
                if (T3 == null && rowActive(id)) T3 = t;
                if (T4 == null && s === id) T4 = t;
                if (cardSubjects() === 'MIXED') mixedFrames += 1;
                if (s === id) {
                    if (T5 == null && railExec(id)) T5 = t;
                    const c = cells();
                    const keys = Object.keys(c);
                    if (keys.length) { cellKeys = keys; }
                    const required = firstOrder.filter((k2) => keys.indexOf(k2) !== -1);
                    if (T6 == null && required.length > 0) {
                        const unmet = required.filter((k2) => {
                            const x = c[k2];
                            if (!x || x.subject !== id) return true;
                            if (x.reason === 'not_applicable') return false;
                            return !(x.mounted && (x.readiness === 'ready' || x.readiness === 'self_loading'));
                        });
                        if (unmet.length === 0) T6 = t;
                    }
                }
                if (T6 != null) break;
            }
            const mine = window.__sb.reqs.slice(reqAtClick).map((r) => ({
                rel: Math.round(r.at - t0), dur: r.end - r.at,
                forSubject: r.path.indexOf(id) !== -1,
                route: r.path.split('?')[0].split('/').slice(-2).join('/'),
            }));
            // Work started during the HOVER window, before the click — the warm.
            const warm = window.__sb.reqs.slice(0, reqAtClick)
                .filter((r) => r.at >= t0 - dwell - 60 && r.path.indexOf(id) !== -1)
                .map((r) => ({ rel: Math.round(r.at - t0), dur: r.end - r.at, inFlightAtClick: r.end > t0,
                               route: r.path.split('?')[0].split('/').slice(-2).join('/') }));
            const afterClickForSubject = mine.filter((r) => r.forSubject);
            return {
                id, before, dwell,
                T3, T4, T5, T6, mixedFrames,
                cellKeys,
                CORRECT: bodySubject() === id,
                warmCount: warm.length, warmInFlightAtClick: warm.filter((w) => w.inFlightAtClick).length,
                warmRoutes: warm.slice(0, 5),
                afterClickSubjectRequests: afterClickForSubject.length,
                reissued: warm.filter((w) => afterClickForSubject.some((a) => a.route === w.route)).length,
                slowestAfterClick: afterClickForSubject.length ? Math.max(...afterClickForSubject.map((r) => r.dur)) : null,
                requests: mine.slice(0, 8),
            };
        })(${JSON.stringify(id)}, ${dwell}, ${JSON.stringify(FIRST_ORDER)})`);

        const rec = out as Record<string, unknown>;
        rec.mode = MODE;
        rec.returning = !!visited[id];
        rec.reqBefore = reqBefore;
        samples.push(rec);
        visited[id] = true;
        await page.waitForTimeout(350);
    }

    console.log(`[SB] ${JSON.stringify({ mode: MODE, rows: ids.length, n: samples.length, samples })}`);
});
