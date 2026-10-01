import { test } from "@playwright/test";

/**
 * GATE R — BROAD /WORKSPACE RELIABILITY.
 *
 * The operator reported two things the interaction gates never tested: apparently random
 * refreshes during normal use, and a MINORITY of Work Units that take unacceptably long to become
 * usable. Good medians cannot answer either, so this drives a long-lived session and records what
 * actually resets.
 *
 * WHAT MAKES A RESET CLASSIFIABLE. An init script runs once per DOCUMENT, so a fresh token is
 * itself proof the document was replaced — that alone separates a full navigation from every
 * client-side effect, without inferring from visuals. On top of it:
 *   docToken change      FULL_DOCUMENT_NAVIGATION
 *   navigation entry     reload / back_forward / navigate
 *   WU shell mount count WORK_UNIT_REMOUNT (its own contract says a lens switch must not move it)
 *   build-info sha       DEPLOYMENT_VERSION_TRANSITION
 *   /login               AUTH_REDIRECT
 *   _rsc requests        RSC_REVALIDATION
 *   error / rejection    ERROR_RECOVERY
 *
 * MODE=control runs only the positive control and asserts the instrument can tell these apart.
 * MODE=session runs the population. The control must pass before the population is trusted.
 *
 * PRIVACY: opaque ids, counts, timings, URL paths. No names, no business values.
 */
const MODE = process.env.GR_MODE ?? "control";
const OPENS = Number(process.env.GR_OPENS ?? "12");

const INIT = `(() => {
    const w = window;
    w.__rel = {
        docToken: Math.random().toString(36).slice(2),
        bootAt: Date.now(),
        errors: [], rejections: [], rsc: [], pushes: [], visibility: [],
    };
    try {
        const nav = performance.getEntriesByType('navigation')[0];
        w.__rel.navType = nav ? nav.type : null;
    } catch (e) { w.__rel.navType = null; }
    w.addEventListener('error', (e) => {
        try { w.__rel.errors.push({ at: Date.now(), msg: String(e.message || '').slice(0, 90) }); } catch (x) {}
    });
    w.addEventListener('unhandledrejection', (e) => {
        try { w.__rel.rejections.push({ at: Date.now(), msg: String((e.reason && e.reason.message) || e.reason || '').slice(0, 90) }); } catch (x) {}
    });
    document.addEventListener('visibilitychange', () => {
        try { w.__rel.visibility.push({ at: Date.now(), state: document.visibilityState }); } catch (x) {}
    });
    try {
        new PerformanceObserver((l) => {
            for (const e of l.getEntries()) {
                if (e.name.indexOf('_rsc') !== -1) w.__rel.rsc.push({ at: Math.round(e.startTime), dur: Math.round(e.duration) });
            }
        }).observe({ entryTypes: ['resource'] });
    } catch (e) { /* absence reported, never faked */ }
    const wrap = (kind, orig) => function (s, t, u) {
        try { w.__rel.pushes.push({ at: Date.now(), kind, url: String(u == null ? location.href : u).slice(-70) }); } catch (x) {}
        return orig.apply(this, arguments);
    };
    history.pushState = wrap('push', history.pushState);
    history.replaceState = wrap('replace', history.replaceState);
})()`;

const PROBE = `(() => {
    const w = window;
    return {
        docToken: w.__rel ? w.__rel.docToken : null,
        navType: w.__rel ? w.__rel.navType : null,
        bootAt: w.__rel ? w.__rel.bootAt : null,
        wuMounts: w.__ALLOY_WU_SHELL_MOUNT_COUNT__ ?? null,
        url: location.pathname + location.search,
        isLogin: /\\/login/.test(location.pathname),
        errors: w.__rel ? w.__rel.errors.length : null,
        rejections: w.__rel ? w.__rel.rejections.length : null,
        rsc: w.__rel ? w.__rel.rsc.length : null,
        pushes: w.__rel ? w.__rel.pushes.length : null,
        lastErrors: w.__rel ? w.__rel.errors.slice(-2) : [],
        lastRejections: w.__rel ? w.__rel.rejections.slice(-2) : [],
        rows: document.querySelectorAll('.alloy-os-queue-row-card').length,
        pills: document.querySelectorAll('button[role="tab"][data-work-view-id]').length,
        subject: document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null,
        view: new URLSearchParams(location.search).get('work_view_id'),
    };
})()`;

test("gate R workspace reliability", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.addInitScript(INIT);

    const sha = async () => page.evaluate(`(async () => { try { const r = await fetch('/api/build-info', { cache: 'no-store' }); return ((await r.json()) || {}).gitSha || null; } catch (e) { return null; } })()`) as Promise<string | null>;
    /*
     * A READ MUST NOT BE ABLE TO KILL THE RUN.
     *
     * `page.evaluate` throws "Execution context was destroyed" when a FULL DOCUMENT navigation lands
     * mid-read, and a first pass lost five whole batches to it. That error is also a signal worth
     * keeping rather than swallowing: a soft client navigation never destroys the context, so a
     * destroyed one means the document really was replaced. It is recorded and retried once the new
     * document settles, instead of ending the session.
     */
    let contextDestroyed = 0;
    const probe = async (): Promise<Record<string, unknown>> => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                return (await page.evaluate(PROBE)) as Record<string, unknown>;
            } catch (e) {
                if (!/Execution context was destroyed|frame was detached/i.test(String(e))) throw e;
                contextDestroyed += 1;
                await page.waitForTimeout(2500);
            }
        }
        return { unreadable: true } as Record<string, unknown>;
    };

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(12_000);
    const servedSha = await sha();

    if (MODE === "control") {
        const c: Record<string, unknown> = { servedSha };
        const a = await probe();
        c.docTokenPresent = !!a.docToken;
        c.navType = a.navType;
        c.wuMountsOnWorkspace = a.wuMounts;

        // (1) A REAL full document navigation must change the document token.
        await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 180_000 });
        await page.waitForTimeout(6000);
        const b = await probe();
        c.fullNavChangesToken = a.docToken !== b.docToken;

        // (2) A client-side navigation into a Work Unit must NOT change it.
        const links = await page.evaluate(`(() => [...document.querySelectorAll('a[href*="/workspace/work-unit/"]')].map((a) => a.getAttribute('href')).filter(Boolean).slice(0, 8))()`) as string[];
        c.workUnitLinksFound = links.length;
        if (links.length) {
            await page.evaluate(`(() => { const a=[...document.querySelectorAll('a[href*="/workspace/work-unit/"]')][0]; if(a) a.click(); })()`);
            await page.waitForTimeout(11_000);
            const d = await probe();
            c.clientNavKeepsToken = b.docToken === d.docToken;
            c.clientNavUrl = d.url;
            c.wuMountsAfterOpen = d.wuMounts;
            /*
             * ABSENT IS ZERO HERE, and only here. The counter is created by the Work Unit shell's
             * mount effect, so on /workspace — where no such shell exists — it is legitimately
             * undefined. A first version required both readings to be numbers and scored the real
             * transition undefined -> 1 as unmeasurable, failing its own control for arithmetic
             * reasons while every genuine discrimination passed.
             */
            const mountsBefore = typeof b.wuMounts === "number" ? (b.wuMounts as number) : 0;
            const mountsAfter = typeof d.wuMounts === "number" ? (d.wuMounts as number) : 0;
            c.wuMountsBeforeNormalised = mountsBefore;
            c.wuMountIncremented = mountsAfter > mountsBefore;

            // (3) A LENS switch must not remount the Work Unit shell — its own stated contract.
            const pills = await page.evaluate(`(() => [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].map((e) => e.getAttribute('data-work-view-id')))()`) as string[];
            if (pills.length > 1) {
                await page.evaluate(`(() => { const p=[...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e)=>e.getAttribute('data-work-view-id')==='${'X'}'); })()`);
                await page.evaluate(`((id) => { const p=[...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e)=>e.getAttribute('data-work-view-id')===id); if(p) p.click(); })(${JSON.stringify(pills[1])})`);
                await page.waitForTimeout(7000);
                const e = await probe();
                c.lensSwitchKeepsToken = d.docToken === e.docToken;
                c.lensSwitchRemountsShell = (e.wuMounts as number) > (d.wuMounts as number);
                c.lensSwitchChangedView = e.view !== d.view;
            }
        }
        const pass = c.docTokenPresent && c.fullNavChangesToken === true && c.clientNavKeepsToken === true
            && c.wuMountIncremented === true && c.lensSwitchRemountsShell === false;
        c.CONTROL_PASS = pass;
        console.log(`[GR] ${JSON.stringify({ mode: "control", control: c })}`);
        return;
    }

    // ── LONG-LIVED SESSION ────────────────────────────────────────────────────────────────────
    const events: unknown[] = [];
    const opens: unknown[] = [];
    let prev = await probe();
    let prevSha = servedSha;
    let actions = 0;

    const record = async (label: string) => {
        actions += 1;
        const now = await probe();
        const nowSha = await sha();
        const ev: Record<string, unknown> = { label, actions };
        if (now.docToken !== prev.docToken) ev.FULL_DOCUMENT_NAVIGATION = true;
        if (now.isLogin) ev.AUTH_REDIRECT = true;
        if (nowSha !== prevSha) { ev.DEPLOYMENT_VERSION_TRANSITION = true; ev.shaFrom = String(prevSha).slice(0, 8); ev.shaTo = String(nowSha).slice(0, 8); }
        if ((now.errors as number) > (prev.errors as number)) { ev.ERROR = true; ev.errs = now.lastErrors; }
        if ((now.rejections as number) > (prev.rejections as number)) { ev.REJECTION = true; ev.rej = now.lastRejections; }
        const dMount = (now.wuMounts as number ?? 0) - (prev.wuMounts as number ?? 0);
        if (dMount > 0) ev.wuRemounts = dMount;
        ev.url = now.url; ev.rows = now.rows; ev.view = now.view;
        if (Object.keys(ev).length > 5) events.push(ev);
        prev = now; prevSha = nowSha;
        return now;
    };

    const goWorkspace = async () => {
        const ok = await page.evaluate(`(() => { const a=[...document.querySelectorAll('a[href$="/workspace"],a[href*="/workspace?"]')].find((x)=>!/work-unit/.test(x.getAttribute('href')||'')); if(a){a.click();return true;} return false; })()`);
        if (!ok) {
            // A hard navigation here is the PROBE's own doing, not a product reset. It is labelled so
            // the classification cannot later confuse the two.
            await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
        }
        await page.waitForTimeout(6500);
        await record(ok ? "workspace(client)" : "workspace(PROBE_HARD_NAV)");
    };

    const openUnits = async (n: number) => {
        const links = await page.evaluate(`(() => { const s={}; return [...document.querySelectorAll('a[href*="/workspace/work-unit/"]')].map((a)=>a.getAttribute('href')).filter((h)=>h&&!s[h]&&(s[h]=1)); })()`) as string[];
        for (let i = 0; i < Math.min(n, links.length); i += 1) {
            const href = links[i];
            const t0 = Date.now();
            const clicked = await page.evaluate(`((h) => { const a=[...document.querySelectorAll('a[href*="/workspace/work-unit/"]')].find((x)=>x.getAttribute('href')===h); if(a){a.click();return true;} return false; })(${JSON.stringify(href)})`);
            if (!clicked) continue;
            let T4: number | null = null, T6: number | null = null, T7: number | null = null;
            for (let k = 0; k < 150; k += 1) {
                await page.waitForTimeout(120);
                let s;
                try { s = await page.evaluate(`(() => ({
                    rows: document.querySelectorAll('.alloy-os-queue-row-card').length,
                    subject: document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null,
                    railExec: (() => { const r=document.querySelector('[data-focus-panel-carrier-actions="true"]'); return !!r && Number(r.getAttribute('data-focus-panel-carrier-executable-count')||'0')>0; })(),
                    cells: [...document.querySelectorAll('[data-focus-panel-cell-key]')].map((e)=>({k:e.getAttribute('data-focus-panel-cell-key'),r:e.getAttribute('data-focus-panel-cell-readiness'),s:e.getAttribute('data-focus-panel-cell-subject'),m:e.getAttribute('data-focus-panel-cell-mounted')==='true',n:e.getAttribute('data-focus-panel-cell-settled-reason')})),
                }))()`) as { rows: number; subject: string | null; railExec: boolean; cells: Array<{ k: string; r: string; s: string; m: boolean; n: string }> };
                } catch (e) {
                    if (!/Execution context was destroyed|frame was detached/i.test(String(e))) throw e;
                    contextDestroyed += 1; await page.waitForTimeout(2000); continue;
                }
                const t = Date.now() - t0;
                if (T4 == null && s.subject) T4 = t;
                if (T6 == null && (s.railExec || (s.cells.length > 0 && s.subject))) T6 = t;
                if (T7 == null && s.subject && s.cells.length) {
                    const fo = ["current_work", "business_process", "household", "children", "readiness_kpi"];
                    const have = s.cells.filter((c) => fo.indexOf(c.k) !== -1);
                    if (have.length && have.every((c) => c.s === s.subject && (c.n === "not_applicable" || (c.m && (c.r === "ready" || c.r === "self_loading"))))) T7 = t;
                }
                if (T7 != null) break;
            }
            const after = await record(`open:${href.slice(-22)}`);
            opens.push({ href: href.slice(-30), T4, T6, T7, rows: after.rows, subject: after.subject ? "present" : null, revisit: false });
            // interact: two queue rows and one work view
            const rows = await page.evaluate(`(() => [...document.querySelectorAll('.alloy-os-queue-row-card')].map((e)=>e.getAttribute('data-entity-id')).filter(Boolean).slice(0,3))()`) as string[];
            for (const r of rows.slice(1, 3)) {
                await page.evaluate(`((id) => { const e=document.querySelector('.alloy-os-queue-row-card[data-entity-id="'+id+'"]'); if(e) e.click(); })(${JSON.stringify(r)})`);
                await page.waitForTimeout(2200);
                await record("row");
            }
            const pl = await page.evaluate(`(() => [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].map((e)=>e.getAttribute('data-work-view-id')))()`) as string[];
            if (pl.length > 1) {
                await page.evaluate(`((id) => { const p=[...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e)=>e.getAttribute('data-work-view-id')===id); if(p) p.click(); })(${JSON.stringify(pl[1])})`);
                await page.waitForTimeout(2600);
                await record("view");
            }
            await goWorkspace();
        }
    };

    await record("start");
    await openUnits(OPENS);

    console.log(`[GR] ${JSON.stringify({ mode: "session", servedSha: String(servedSha).slice(0, 9), endSha: String(prevSha).slice(0, 9), actions, contextDestroyed, opens, events })}`);
});
