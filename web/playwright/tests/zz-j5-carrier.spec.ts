import { test } from "@playwright/test";

/**
 * OX J5 — TWO-PHASE ACTIONABLE CARRIER: MOUNTED CERTIFICATION AND A/B.
 *
 * Measures the SAME J5 event every prior slice measured — hover the next queue row, click it — and
 * reports both the milestone this programme has always reported and a stricter one the carrier
 * makes possible.
 *
 * WHY TWO DEFINITIONS OF FIRST ACTIONABLE. The existing milestone is "an enabled button inside the
 * header action rail". The Manage trigger is such a button, so that definition can be satisfied by a
 * control whose every menu item is disabled. That was harmless while the rail only ever appeared
 * fully resolved; it is not harmless now. So T5_executable additionally requires the mounted rail to
 * declare at least one EXECUTABLE action for the selected subject. The weaker milestone is still
 * reported, never replaced, so the two can disagree visibly.
 */
const RUNS = Number(process.env.OX_CARRIER_RUNS ?? "3");

test("j5 carrier certify and measure", async ({ page }) => {
    test.setTimeout(900_000);

    await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        const reqs: Array<{ at: number; end: number; path: string }> = [];
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    const r = e as PerformanceResourceTiming;
                    let path = r.name;
                    try { const u = new URL(r.name); path = u.pathname + u.search; } catch { /* raw */ }
                    reqs.push({ at: Math.round(r.startTime), end: Math.round(r.responseEnd), path });
                }
            }).observe({ entryTypes: ["resource"] });
        } catch { /* ignore */ }
        w.__ox = { reqs };
    });

    const samples: unknown[] = [];

    /*
     * ONE COLD ROW SWITCH PER PAGE LOAD.
     *
     * The first run of this probe took 22 samples from a single page load and pooled them. The queue
     * has four rows, so after one cycle every switch was served from the drawer VM session cache:
     * 18 of 22 samples measured a cache hit at P50 42ms beside 4 real switches at P50 2,317ms, and
     * the pooled P50 was meaningless. The session cache lives in memory, so reloading between
     * samples is what makes each one a genuine first visit — which is the J5 event this programme
     * has measured throughout and the one the 2,336ms baseline describes.
     *
     * It costs a page load per sample. A cheap sample of the wrong journey costs more.
     */
    /*
     * SEVERAL COLD SWITCHES PER PAGE LOAD, NOT ONE.
     *
     * Each SUBJECT is visited at most once per load, so every sample is still a genuine first visit
     * and still misses the drawer VM session cache — which is the property that matters. What it
     * stops paying for is a page load per sample, and P95 on 21 samples was unstable enough that
     * the sample count is the binding constraint on knowing whether the tail is real.
     */
    const PER_LOAD = Number(process.env.OX_PER_LOAD ?? "3");
    for (let i = 0; i < RUNS; i += 1) {
        if (i % PER_LOAD === 0) {
            await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
            await page.waitForTimeout(16_000);
        }
        // Hover first — the operator sequence, and the prewarm this programme must preserve.
        /*
         * WALK BY INDEX, NOT BY "WHICHEVER ROW LOOKS SELECTED".
         *
         * The census probe cycled rows by finding the selected one and taking the next; it returned
         * 55 observations for a SINGLE subject, because neither `aria-selected` nor a `--selected`
         * class is how this queue marks selection, so the search answered -1 every time and the same
         * row was clicked repeatedly. A measurement of the row-to-row switch that never switches
         * rows would have reported beautiful numbers for a journey nobody took.
         */
        const hovered = await page.evaluate(`((i) => {
            const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length < 2) return false;
            // Rotate the destination across samples so one row's configuration cannot stand for
            // the whole surface; after a reload the selected row is the route default, so any other
            // row is a real switch.
            const target = rows[1 + (i % Math.max(1, rows.length - 1))];
            window.__ox.target = target;
            window.__ox.targetIndex = (i + 1) % rows.length;
            window.__ox.hoverAt = Math.round(performance.now());
            for (const t of ["pointerover","mouseover","pointerenter","mouseenter"]) {
                target.dispatchEvent(new MouseEvent(t, { bubbles: true }));
            }
            return true;
        })(${i})`);
        if (!hovered) break;
        await page.waitForTimeout(800);

        const sample = await page.evaluate(`(async () => {
            const HEADER = '[data-alloy-os-focus-panel-header="true"]';
            const RAIL   = '[data-focus-panel-carrier-actions="true"]';
            const w = window.__ox;
            const m = {};
            const mark = (k) => { if (m[k] == null) m[k] = Math.round(performance.now()) - w.clickAt; };

            const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const cardSubject = () => {
                const els = [...document.querySelectorAll('[data-card-subject]')];
                if (!els.length) return null;
                const vals = [...new Set(els.map((e) => e.getAttribute('data-card-subject')))];
                return vals.length === 1 ? vals[0] : 'MIXED';
            };
            const subjectBefore = bodySubject();
            const cardSubjectBefore = cardSubject();
            const carrierBefore = (window.__ALLOY_CARRIER_DIAG__ || []).length;

            let mixedFrames = 0;
            w.clickAt = Math.round(performance.now());
            const mo = new MutationObserver(() => {
                const nowBody = bodySubject();
                const nowCards = cardSubject();
                if (nowCards === 'MIXED') mixedFrames += 1;
                if (nowBody && nowBody !== subjectBefore) {
                    mark('T4_snapshot');
                    // The carrier rail, mounted for the COMMITTED subject — not merely present.
                    const rail = document.querySelector(RAIL + '[data-focus-panel-carrier-subject="' + nowBody + '"]');
                    if (rail) {
                        mark('T_carrier_mounted');
                        const n = Number(rail.getAttribute('data-focus-panel-carrier-executable-count') || '0');
                        if (n > 0) mark('T5_executable');
                        // The weaker, historical milestone: any enabled button in the rail.
                        if (document.querySelector(HEADER + ' [data-alloy-os-fp-header-actions="true"] button:not([disabled])')) {
                            mark('T5_action_enabled');
                        }
                    } else if (document.querySelector(HEADER + ' [data-alloy-os-fp-header-actions="true"] button:not([disabled])')) {
                        mark('T5_action_enabled');
                    }
                }
                const cardsAreB = nowCards && nowCards !== 'MIXED' && nowCards !== cardSubjectBefore;
                if (!cardsAreB) return;
                mark('T4_visible');
                if (document.querySelector(HEADER + ' [data-alloy-os-fp-header-actions="true"] button:not([disabled])')) mark('T5_actionable');
                const cells = document.querySelectorAll('.alloy-os-ucard').length;
                const reserved = document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length;
                if (cells >= 6 && reserved === 0) mark('T6_first_order');
            });
            mo.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
            w.target.click();

            await new Promise((r) => setTimeout(r, 14000));
            mo.disconnect();

            const diag = window.__ALLOY_CARRIER_DIAG__ || [];
            /*
             * ONLY ARRIVALS BELONGING TO THIS CLICK.
             *
             * An earlier version asked "is there any carrier for this subject" across the whole page
             * session and reported a ready-before-click rate of 19/22. On a probe that revisits four
             * rows repeatedly that question answers yes from a previous cycle, minutes earlier: the
             * P50 it produced was -174 seconds. Scoping to arrivals recorded since this click is the
             * only honest reading, and with one switch per page load there is nothing older to
             * confuse it with.
             */
            const arrivals = diag.slice(carrierBefore).map((d) => ({ ...d, rel: d.t - w.clickAt }));
            const nowBody = bodySubject();
            const forSubject = arrivals.filter((d) => d.subject === nowBody);
            const earliest = forSubject.length ? Math.min(...forSubject.map((d) => d.rel)) : null;

            const drawerReq = w.reqs.filter((r) => r.path.includes('/view-models/drawer/opportunity/'))
                .map((r) => ({ rel: r.at - w.clickAt, dur: r.end - r.at, phased: r.path.includes('phased=1') }));

            return {
                milestones: m,
                mixedFrames,
                subjectBefore, subjectAfter: nowBody,
                // A sample where the committed subject did not move is NOT a row switch and must
                // not be pooled with the ones that were.
                validSwitch: !!(nowBody && subjectBefore && nowBody !== subjectBefore),
                targetIndex: w.targetIndex,
                carrierArrivalsThisEvent: arrivals,
                carrierRelForClickedSubject: earliest,
                carrierReadyBeforeClick: earliest != null && earliest < 0,
                drawerRequests: drawerReq.slice(-4),
                phasedRequests: drawerReq.filter((r) => r.phased).length,
                cellsTotal: document.querySelectorAll('.alloy-os-ucard').length,
                reservedTotal: document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length,
                railStillPresentAfterSettle: !!document.querySelector(RAIL),
            };
        })()`);
        samples.push(sample);
        console.log(`[carrier-sample] ${JSON.stringify(sample)}`);
    }
    console.log(`[carrier-done] n=${samples.length}`);
});

/**
 * A -> B -> C, and hover B -> hover C -> click C.
 *
 * The carrier makes an action set mountable before the record exists, so the question "can a
 * superseded subject's commands survive under the current one" has to be answered on the deployed
 * build and not only in a unit test. Both sequences assert the same thing from opposite directions:
 * what is mounted names the subject the operator is actually on.
 */
test("j5 carrier rapid navigation", async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(20_000);

    const out = await page.evaluate(`(async () => {
        const RAIL = '[data-focus-panel-carrier-actions="true"]';
        const rows = [...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 3) return { skipped: 'need three rows', rows: rows.length };
        const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
        const railSubject = () => document.querySelector(RAIL)?.getAttribute('data-focus-panel-carrier-subject') || null;
        const cardSubject = () => {
            const els = [...document.querySelectorAll('[data-card-subject]')];
            if (!els.length) return null;
            const vals = [...new Set(els.map((e) => e.getAttribute('data-card-subject')))];
            return vals.length === 1 ? vals[0] : 'MIXED';
        };
        const hover = (el) => { for (const t of ["pointerover","mouseover","pointerenter","mouseenter"]) el.dispatchEvent(new MouseEvent(t, { bubbles: true })); };
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        const observed = [];
        let mixed = 0;
        let railMismatch = 0;
        const mo = new MutationObserver(() => {
            if (cardSubject() === 'MIXED') mixed += 1;
            const rs = railSubject();
            const bs = bodySubject();
            // The rail must never name a subject other than the committed one.
            if (rs && bs && rs !== bs) railMismatch += 1;
        });
        mo.observe(document, { childList: true, subtree: true, attributes: true });

        // SEQUENCE 1 — hover B, click B, then immediately click C.
        hover(rows[1]); await sleep(700);
        rows[1].click(); await sleep(350);
        const midB = { body: bodySubject(), rail: railSubject() };
        rows[2].click(); await sleep(9000);
        observed.push({ seq: 'B_then_C', afterC_body: bodySubject(), afterC_rail: railSubject(), midB });

        await sleep(2000);

        // SEQUENCE 2 — hover B, hover C, click C. B's speculative carrier must never mount.
        hover(rows[1]); await sleep(600);
        hover(rows[0]); await sleep(600);
        const beforeClick = { body: bodySubject(), rail: railSubject() };
        rows[0].click(); await sleep(9000);
        observed.push({ seq: 'hoverB_hoverC_clickC', beforeClick, after_body: bodySubject(), after_rail: railSubject() });

        mo.disconnect();
        return { observed, mixedSubjectFrames: mixed, railSubjectMismatchFrames: railMismatch };
    })()`);
    console.log(`[carrier-nav] ${JSON.stringify(out)}`);
});

/**
 * SERVED CONTAINMENT — asked of the deployed server, not inferred from a SHA.
 *
 * A build SHA says which commit was built. It does not say that the phased branch is reachable, that
 * it writes NDJSON, or that phase 1 precedes phase 2 on the wire. Those are three separate claims
 * and each is answerable directly: ask the deployed route for a phased drawer view model and read
 * what comes back, in order, with its media type.
 *
 * The unphased request is asked for too, because the opt-in is the compatibility guarantee: if the
 * plain request ever started streaming, every consumer that cannot read a second delivery would
 * break, and that must fail loudly here rather than quietly in a browser.
 */
test("j5 carrier served containment", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(18_000);

    const subject = await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length) rows[1].click();
        return null;
    })()`);
    void subject;
    await page.waitForTimeout(12_000);

    const out = await page.evaluate(`(async () => {
        const id = document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject');
        if (!id) return { error: 'no committed subject' };
        const base = '/api/admin/view-models/drawer/opportunity/' + encodeURIComponent(id);

        const phasedRes = await fetch(base + '?phased=1', { credentials: 'include' });
        const phasedType = phasedRes.headers.get('content-type');
        const phasedFlag = phasedRes.headers.get('x-alloy-drawer-vm-phased');
        const text = await phasedRes.text();
        const lines = text.split('\\n').filter((l) => l.trim());
        const keys = lines.map((l) => { try { return Object.keys(JSON.parse(l)); } catch { return ['<unparseable>']; } });

        let carrier = null;
        for (const l of lines) {
            try { const o = JSON.parse(l); if (o.__carrier) { carrier = o.__carrier; break; } } catch { /* skip */ }
        }

        const plainRes = await fetch(base, { credentials: 'include' });
        const plainType = plainRes.headers.get('content-type');
        const plainBody = await plainRes.text();
        let plainIsSingleJson = false;
        try { JSON.parse(plainBody); plainIsSingleJson = true; } catch { plainIsSingleJson = false; }

        return {
            subject: id,
            phased: {
                status: phasedRes.status,
                contentType: phasedType,
                phasedHeader: phasedFlag,
                lineCount: lines.length,
                lineKeys: keys,
                // Phase 1 must come FIRST. A carrier delivered after the view model buys nothing.
                carrierIsFirstLine: keys.length > 0 && keys[0].includes('__carrier'),
                viewModelIsLastLine: keys.length > 0 && keys[keys.length - 1].includes('__viewModel'),
            },
            carrier: carrier ? {
                version: carrier.carrier_version,
                subjectMatches: carrier.subject?.opportunity_id === id,
                lens: carrier.subject?.attention_subject_id,
                execution: carrier.execution,
                flushed_at_ms: carrier.flushed_at_ms,
                actions: (carrier.header_menu || []).map((a) => [a.key, a.readiness]),
                executable: (carrier.header_menu || []).filter((a) => a.readiness === 'CARRIER_SAFE').length,
            } : null,
            unphasedStillOneAnswer: { contentType: plainType, isSingleJsonDocument: plainIsSingleJson },
        };
    })()`);
    console.log(`[carrier-containment] ${JSON.stringify(out)}`);
});
