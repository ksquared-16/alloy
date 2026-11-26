import { test } from "@playwright/test";

/**
 * GATE D FINAL — USABLE DETAILS, SCOPED TO THE ACTIVE ACCOUNT PANE.
 *
 * The previous predicate counted card skeletons DOCUMENT-WIDE, so unrelated loading anywhere in the
 * modal kept it from ever firing and it reported "27 of 27 material misses" that were its own fault.
 * Two selector guesses before it measured nothing at all. So this one keys only on what the live DOM
 * was observed to publish, and every readiness query is rooted at the pane:
 *
 *   [data-financials-account-detail="<customerId>"]   the active pane, naming its account
 *   pane-local [data-financials-card-skeleton]        still a skeleton
 *   pane-local [data-financials-empty]                still loading or resolved-absent
 *   pane-local [data-financials-row-group]            authoritative content mounted
 *
 * A POSITIVE CONTROL RUNS FIRST and the population does not start unless every observable it needs
 * was actually seen. Three instrument failures in this gate have already been mistaken for product
 * defects once; a probe that cannot prove it can see is not allowed to produce a distribution.
 *
 * PRIVACY: opaque ids, counts, timings. No names, no money.
 */
const SWITCHES = Number(process.env.T6_SWITCHES ?? "10");

test("gate D — usable details, pane-scoped", async ({ page }) => {
    test.setTimeout(1_800_000);

    await page.addInitScript(`(() => {
        const reqs = [];
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    if (e.name.indexOf('/api/admin/financials/') === -1) continue;
                    let p = e.name;
                    try { const u = new URL(e.name); p = u.pathname + u.search; } catch (x) { /* raw */ }
                    reqs.push({ at: Math.round(e.startTime), end: Math.round(e.responseEnd), path: p });
                }
            }).observe({ entryTypes: ['resource'] });
        } catch (e) { /* absence reported, never faked */ }
        window.__t6 = { reqs: reqs };
    })()`);

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(13_000);

    const out = await page.evaluate(`(async (switches) => {
        const sha = await (async () => {
            try { const r = await fetch('/api/build-info', { cache: 'no-store' }); return ((await r.json()) || {}).gitSha || null; }
            catch (e) { return null; }
        })();
        const nav = document.querySelector('[data-adminv2-sidebar-modal-nav="financials"]');
        if (!nav) return { skipped: 'no_financials_nav', sha };
        nav.click();
        await new Promise((r) => setTimeout(r, 6500));
        if (document.querySelectorAll('[data-financials-account-row]').length < 2) {
            const tab = [...document.querySelectorAll('button,a')].find((e) => /^accounts$/i.test((e.textContent || '').trim()));
            if (tab) { tab.click(); await new Promise((r) => setTimeout(r, 6500)); }
        }

        const rows = () => [...document.querySelectorAll('[data-financials-account-row]')];
        const rowSelected = (id) => {
            const r = document.querySelector('[data-financials-account-row="' + id + '"]');
            return !!r && r.getAttribute('data-financials-account-selected') === 'true';
        };
        // THE ACTIVE PANE. Every readiness question below is asked of this element's subtree only.
        const pane = () => document.querySelector('[data-financials-account-detail]');
        const paneState = () => {
            const p = pane();
            if (!p) return { present: false };
            const skeletons = p.querySelectorAll('[data-financials-card-skeleton]').length;
            const emptyEl = p.querySelector('[data-financials-empty]');
            const groups = p.querySelectorAll('[data-financials-row-group]').length;
            const lenses = p.querySelectorAll('[data-financials-lens]').length;
            const figs = ((p.textContent || '').match(/[0-9][0-9,]*\.[0-9]{2}/g) || []).length;
            return {
                present: true,
                account: p.getAttribute('data-financials-account-detail'),
                skeletons,
                emptyClass: emptyEl ? emptyEl.getAttribute('data-financials-empty') : null,
                groups, lenses, figs,
                /*
                 * THE FLOOR IS NOT THE SAME EVENT AS THE MEANING, and conflating them is what made the
                 * first attempt report 135ms for a switch whose own requests had not returned.
                 *
                 * floor    the pane is B's, mounted, with its reserved state cleared - the documented
                 *          progressive Details floor, which is SUPPOSED to be immediate
                 * usable   the floor PLUS B's authoritative figures, which is what the operator was
                 *          actually waiting for when they reported a visible delay
                 */
                floor: skeletons === 0 && !emptyEl && (groups > 0 || lenses > 0),
                usable: skeletons === 0 && !emptyEl && figs > 0,
            };
        };

        const ids = rows().map((r) => r.getAttribute('data-financials-account-row')).filter(Boolean);
        const uniq = [...new Set(ids)];
        if (uniq.length < 2) return { skipped: 'too_few_accounts', sha, ids: uniq.length };

        const doSwitch = async (id) => {
            const before = paneState();
            const reqFrom = window.__t6.reqs.length;
            const el = document.querySelector('[data-financials-account-row="' + id + '"]');
            if (!el) return { id, skipped: 'row_gone' };
            const t0 = performance.now();
            el.click();
            let T1 = null, T3 = null, T4 = null, T5 = null, T6 = null;
            let sawPaneLocalPending = false, staleUsableFrames = 0, sawNotUsableForB = false;
            let T6floor = null;
            for (let i = 0; i < 700; i += 1) {
                await new Promise((r) => setTimeout(r, 25));
                const t = Math.round(performance.now() - t0);
                const s = paneState();
                if (T1 == null && rowSelected(id)) T1 = t;
                if (T3 == null && s.present && s.account === id) T3 = t;
                if (s.present && s.account === id && (s.skeletons > 0 || s.emptyClass === 'loading')) sawPaneLocalPending = true;
                // The predicate must be SEEN to be false for B before it is true, or it proves nothing.
                if (s.present && s.account === id && !s.usable) sawNotUsableForB = true;
                if (T6floor == null && s.present && s.account === id && s.floor) T6floor = t;
                if (T4 == null && s.present && s.account === id) T4 = t;
                if (T5 == null && s.present && s.account === id && (s.groups > 0 || s.lenses > 0)) T5 = t;
                if (T6 == null && s.present && s.account === id && s.usable) T6 = t;
                // The pane still naming the PREVIOUS account while presenting settled content, with
                // the new row already selected, would be A's truth under B.
                if (s.present && before.account && s.account === before.account && s.account !== id && s.usable && rowSelected(id)) staleUsableFrames += 1;
                if (T6 != null) break;
            }
            const mine = window.__t6.reqs.slice(reqFrom).map((r) => ({
                rel: Math.round(r.at - t0), end: Math.round(r.end - t0), dur: r.end - r.at,
                required: r.path.indexOf(id) !== -1,
                route: r.path.split('?')[0].split('/').pop(),
            }));
            const required = mine.filter((r) => r.required);
            const lastRequiredEnd = required.length ? Math.max(...required.map((r) => r.end)) : null;
            const s = paneState();
            return {
                id, T1, T3, T4, T5, T6, T6floor,
                sawPaneLocalPending, staleUsableFrames, sawNotUsableForB,
                finalFigs: s.figs,
                lastRequiredEnd,
                requestToUsable: (T6 != null && lastRequiredEnd != null) ? T6 - lastRequiredEnd : null,
                slowestRequired: required.length ? Math.max(...required.map((r) => r.dur)) : null,
                requiredCount: required.length,
                routes: required.map((r) => [r.route, r.dur]),
                finalAccount: s.account, finalUsable: s.usable,
                CORRECT: s.account === id,
            };
        };

        // ── POSITIVE CONTROL ──────────────────────────────────────────────────────────────────
        const first = uniq[0], second = uniq[1];
        const a = document.querySelector('[data-financials-account-row="' + first + '"]');
        if (a) { a.click(); await new Promise((r) => setTimeout(r, 7000)); }
        const beforeA = paneState();
        const pc = await doSwitch(second);
        const control = {
            paneLocated: !!pane(),
            identityABeforeSwitch: beforeA.present && beforeA.account === first,
            paneBecameB: pc.T3 != null,
            paneLocalPendingObservable: pc.sawPaneLocalPending,
            // Either a pane-local reserved frame OR a not-yet-authoritative frame proves the probe can
            // see B before B is ready. Requiring the skeleton specifically was too narrow: the
            // progressive floor can mount without one.
            predicateDiscriminates: pc.sawNotUsableForB,
            usableObservable: pc.T6 != null,
            floorObservable: pc.T6floor != null,
            T6floor: pc.T6floor, T6: pc.T6, finalFigs: pc.finalFigs,
        };
        const controlOk = control.paneLocated && control.identityABeforeSwitch && control.paneBecameB
            && control.predicateDiscriminates && control.usableObservable;
        if (!controlOk) return { sha, control, ABORTED: 'positive_control_failed', pc };

        const samples = [pc];
        const visited = {}; visited[first] = true; visited[second] = true;
        for (let i = 0; i < switches; i += 1) {
            const id = uniq[(i + 2) % uniq.length];
            const s = await doSwitch(id);
            s.warm = !!visited[id];
            samples.push(s);
            visited[id] = true;
            await new Promise((r) => setTimeout(r, 300));
        }
        return { sha, control, accounts: uniq.length, samples };
    })(${SWITCHES})`);

    console.log(`[T6] ${JSON.stringify(out)}`);
});
