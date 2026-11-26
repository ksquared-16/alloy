import { test } from "@playwright/test";

/**
 * WORKSPACE_SESSION_RESET — WHAT REPLACES THE DOCUMENT?
 *
 * Tracing backward from the replacement, not forward from the final URL. The difficulty is that the
 * evidence dies with the document, so the ring buffer is mirrored into sessionStorage on every
 * append: sessionStorage survives a same-origin document replacement, so the NEW document can
 * report what the OLD one saw in its final moments.
 *
 * Recorded: clicks (with the nearest anchor and whether the default was prevented), history writes,
 * popstate, pagehide/beforeunload, visibility, RSC requests and their outcomes, errors and
 * rejections. On the new document, PerformanceNavigationTiming says what KIND of navigation it was.
 *
 * A source census already found no application code that navigates to /workspace on failure, so the
 * initiator is something else and this is built to name it rather than guess.
 */
const CYCLES = Number(process.env.RF_CYCLES ?? "3");
/* The watchdog kills a run past roughly two minutes, so the cycle is bounded rather than the session. */
const UNITS = Number(process.env.RF_UNITS ?? "4");

const RING = `(() => {
    const KEY = '__rf_ring';
    const w = window;
    w.__rf = { tok: Math.random().toString(36).slice(2), born: Date.now() };
    const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
    const save = (r) => { try { sessionStorage.setItem(KEY, JSON.stringify(r.slice(-70))); } catch (e) {} };
    const push = (type, data) => {
        try {
            const r = load();
            r.push(Object.assign({ t: Date.now(), tok: w.__rf.tok, type }, data || {}));
            save(r);
        } catch (e) {}
    };
    w.__rfPush = push;
    // The new document announces itself and states how the browser got here.
    try {
        const nav = performance.getEntriesByType('navigation')[0];
        push('DOCUMENT_BOOT', { navType: nav ? nav.type : null, url: location.pathname + location.search });
    } catch (e) { push('DOCUMENT_BOOT', { navType: null, url: location.pathname + location.search }); }

    document.addEventListener('click', (e) => {
        try {
            const path = e.composedPath ? e.composedPath() : [];
            let anchor = null, form = null;
            for (const n of path) {
                if (!anchor && n && n.tagName === 'A') anchor = n;
                if (!form && n && n.tagName === 'FORM') form = n;
            }
            const t = e.target;
            push('CLICK', {
                tag: t && t.tagName, role: t && t.getAttribute && t.getAttribute('role'),
                wv: t && t.getAttribute && t.getAttribute('data-work-view-id'),
                row: !!(t && t.closest && t.closest('.alloy-os-queue-row-card')),
                anchorHref: anchor ? anchor.getAttribute('href') : null,
                formAction: form ? form.getAttribute('action') : null,
                defaultPrevented: e.defaultPrevented,
            });
        } catch (x) {}
    }, true);
    // Default-prevented is only final AFTER the listeners have run.
    document.addEventListener('click', (e) => {
        try { push('CLICK_SETTLED', { defaultPrevented: e.defaultPrevented, url: location.pathname }); } catch (x) {}
    }, false);

    const wrapHist = (kind, orig) => function (s, t, u) {
        try { push('HISTORY_' + kind, { url: String(u == null ? location.href : u).slice(-60) }); } catch (x) {}
        return orig.apply(this, arguments);
    };
    history.pushState = wrapHist('PUSH', history.pushState);
    history.replaceState = wrapHist('REPLACE', history.replaceState);
    w.addEventListener('popstate', () => push('POPSTATE', { url: location.pathname + location.search }));
    w.addEventListener('beforeunload', () => push('BEFOREUNLOAD', { url: location.pathname + location.search }));
    w.addEventListener('pagehide', () => push('PAGEHIDE', { url: location.pathname + location.search }));
    document.addEventListener('visibilitychange', () => push('VISIBILITY', { state: document.visibilityState }));
    w.addEventListener('error', (e) => push('ERROR', { msg: String((e && e.message) || '').slice(0, 110) }));
    w.addEventListener('unhandledrejection', (e) => push('REJECTION', { msg: String((e.reason && e.reason.message) || e.reason || '').slice(0, 110) }));

    // RSC / navigation traffic, and anything that failed.
    try {
        const of = w.fetch.bind(w);
        w.fetch = function (input, init) {
            let u = ''; try { u = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
            const isRsc = u.indexOf('_rsc') !== -1 || (init && init.headers && String(JSON.stringify(init.headers)).indexOf('RSC') !== -1);
            const t0 = Date.now();
            return of(input, init).then((res) => {
                if (isRsc || !res.ok) push('FETCH', { rsc: !!isRsc, ok: res.ok, status: res.status,
                    ct: (res.headers.get('content-type') || '').slice(0, 40), ms: Date.now() - t0, u: u.slice(-56) });
                return res;
            }).catch((err) => {
                push('FETCH_FAIL', { rsc: !!isRsc, u: u.slice(-56), ms: Date.now() - t0, msg: String(err).slice(0, 80) });
                throw err;
            });
        };
    } catch (e) {}
})()`;

test("workspace session reset forensics", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.addInitScript(RING);
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(9_000);

    const read = async () => {
        for (let i = 0; i < 3; i += 1) {
            try {
                return await page.evaluate(`(() => ({
                    tok: window.__rf ? window.__rf.tok : null,
                    url: location.pathname + location.search,
                    rows: document.querySelectorAll('.alloy-os-queue-row-card').length,
                    ring: JSON.parse(sessionStorage.getItem('__rf_ring') || '[]'),
                }))()`) as { tok: string; url: string; rows: number; ring: Array<Record<string, unknown>> };
            } catch (e) { await page.waitForTimeout(2000); }
        }
        return null;
    };

    const click = async (js: string) => { try { await page.evaluate(js); } catch (e) { /* context may die mid-click */ } };

    let prevTok: string | null = null;
    const resets: unknown[] = [];
    let actions = 0;

    for (let c = 0; c < CYCLES; c += 1) {
        const links = await page.evaluate(`(() => { const s={}; return [...document.querySelectorAll('a[href*="/workspace/work-unit/"]')].map((a)=>a.getAttribute('href')).filter((h)=>h&&!s[h]&&(s[h]=1)); })()`).catch(() => []) as string[];
        for (const href of links.slice(0, UNITS)) {
            await click(`(() => { const a=[...document.querySelectorAll('a[href*="/workspace/work-unit/"]')].find((x)=>x.getAttribute('href')===${JSON.stringify(href)}); if(a) a.click(); })()`);
            await page.waitForTimeout(5200); actions += 1;
            // rows, then views — the interactions the resets landed on
            for (let k = 1; k <= 2; k += 1) {
                await click(`(() => { const r=[...document.querySelectorAll('.alloy-os-queue-row-card')][${k}]; if(r) r.click(); })()`);
                await page.waitForTimeout(1700); actions += 1;
                const s = await read();
                if (s && prevTok && s.tok !== prevTok) { resets.push({ at: `cycle${c}:${href.slice(-18)}:row${k}`, actions, url: s.url, rows: s.rows, ring: s.ring.slice(-22) }); }
                if (s) prevTok = s.tok;
            }
            const pills = await page.evaluate(`(() => [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].map((e)=>e.getAttribute('data-work-view-id')))()`).catch(() => []) as string[];
            for (const p of pills.slice(1, 3)) {
                await click(`(() => { const b=[...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e)=>e.getAttribute('data-work-view-id')===${JSON.stringify(p)}); if(b) b.click(); })()`);
                await page.waitForTimeout(2000); actions += 1;
                const s = await read();
                if (s && prevTok && s.tok !== prevTok) { resets.push({ at: `cycle${c}:${href.slice(-18)}:view`, actions, url: s.url, rows: s.rows, ring: s.ring.slice(-22) }); }
                if (s) prevTok = s.tok;
            }
            await click(`(() => { const a=[...document.querySelectorAll('a[href$="/workspace"]')].find((x)=>!/work-unit/.test(x.getAttribute('href')||'')); if(a) a.click(); })()`);
            await page.waitForTimeout(6000); actions += 1;
            const s = await read();
            if (s && prevTok && s.tok !== prevTok) { resets.push({ at: `cycle${c}:${href.slice(-18)}:backToWorkspace`, actions, url: s.url, rows: s.rows, ring: s.ring.slice(-22) }); }
            if (s) prevTok = s.tok;
        }
    }
    console.log(`[RF] ${JSON.stringify({ actions, resetCount: resets.length, resets })}`);
});
