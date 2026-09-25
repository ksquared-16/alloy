import { test } from "@playwright/test";

/**
 * OX J5 — ONE CANONICAL T6, AND AN EXPLANATION FOR THE ALL-COLD TAIL.
 *
 * Two probes reported materially different cold T6 P50 on the SAME deployed build (~960ms from the
 * carrier probe, ~1,291ms from the clear-semantics probe). Averaging them would be arithmetic over
 * two different events, and picking the faster one because it passes would be choosing the milestone
 * to fit the gate. So both predicates are evaluated HERE, on the same samples, on the same clock,
 * beside a third that states the product contract — all first-order facts for the committed subject
 * are truthfully available and mounted.
 *
 * The same run carries the tail forensics. 24 of 26 all-cold samples landed under 1,493ms and two
 * landed at 4,297 and 5,345ms; a population percentile cannot say what happened in those two, so
 * every sample records its own client support facts, its own long tasks, its own request timeline
 * INCLUDING per-NDJSON-line arrival, and its own server phases. A tail sample is then classified
 * from what was measured on it, not inferred from the distribution it belongs to.
 *
 * PRIVACY. Keys, counts, booleans and durations only. No names, no contacts, no children, no
 * business values — the presence of a key, never its content.
 */
const RUNS = Number(process.env.OX_T6_RUNS ?? "26");
const PER_LOAD = Number(process.env.OX_PER_LOAD ?? "1");

/**
 * COLD CERTIFICATION CANNOT SILENTLY RUN WARM.
 *
 * The carrier probe defaults to three switches per page load. Two of every three samples are then
 * served from the drawer VM session cache, and the pooled run reported all four gates passing
 * (T5 P50 243/P95 605, T6 P50 948/P95 1,486) where the all-cold truth was P95 2,088 and 3,596. That
 * run was one command-line default away from closing a journey on warm samples, so this probe
 * refuses rather than reports.
 */
if (!process.env.OX_T6_ALLOW_WARM && PER_LOAD !== 1) {
    throw new Error(
        `OX_PER_LOAD=${PER_LOAD} pools warm switches with cold ones; cold certification requires 1. ` +
        `Set OX_T6_ALLOW_WARM=1 only when deliberately measuring warm behaviour.`,
    );
}

/** The commit-critical registry, mirrored: the cards whose first-operational content IS first order. */
const FIRST_ORDER_KEYS = ["current_work", "business_process", "household", "children", "readiness_kpi"];

test("j5 t6 convergence and tail forensics", async ({ page }) => {
    test.setTimeout(3_600_000);

    await page.addInitScript(`(() => {
        const w = window;
        /*
         * SUPPORT IS RECORDED, NOT ASSUMED.
         *
         * An unsupported entry type makes observe() throw, and a swallowed throw leaves an observer
         * that reports zero long tasks forever — indistinguishable from a main thread that was never
         * blocked. Three probes in this programme have already run green while observing nothing, so
         * every step of the registration is answered YES/NO and absence is reported UNSUPPORTED.
         */
        const sup = {
            performanceObserver: typeof PerformanceObserver !== "undefined",
            supportedEntryTypes: null,
            longtaskSupported: null,
            longtaskObserverRegistered: null,
            longtaskRegistrationError: null,
            eventTimingRegistered: null,
        };
        const longtasks = [];
        const lines = [];
        const reqs = [];
        try {
            const types = PerformanceObserver.supportedEntryTypes;
            sup.supportedEntryTypes = Array.isArray(types) ? types.slice() : null;
            sup.longtaskSupported = Array.isArray(types) ? types.includes("longtask") : null;
        } catch (e) { sup.supportedEntryTypes = null; }
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    longtasks.push({ at: Math.round(e.startTime), dur: Math.round(e.duration) });
                }
            }).observe({ entryTypes: ["longtask"] });
            sup.longtaskObserverRegistered = true;
        } catch (e) {
            sup.longtaskObserverRegistered = false;
            sup.longtaskRegistrationError = String((e && e.name) || e).slice(0, 80);
        }
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    const r = e;
                    let path = r.name;
                    try { const u = new URL(r.name); path = u.pathname + u.search; } catch (x) { /* raw */ }
                    reqs.push({
                        at: Math.round(r.startTime),
                        reqStart: Math.round(r.requestStart || 0),
                        respStart: Math.round(r.responseStart || 0),
                        end: Math.round(r.responseEnd || 0),
                        path,
                        initiator: r.initiatorType || null,
                        transfer: r.transferSize == null ? null : r.transferSize,
                    });
                }
            }).observe({ entryTypes: ["resource"] });
        } catch (e) { /* resource timing absent is reported by an empty list plus this flag */ }

        /*
         * PER-LINE ARRIVAL ON THE PHASED STREAM.
         *
         * Resource Timing publishes one entry when the whole response COMPLETES, and this stream stays
         * open past the card clear — so it can say when the first byte arrived and when the stream
         * ended, but nothing about the gap between the carrier line and the view-model line. That gap
         * is precisely where "before first byte / between phases / after bytes arrive" is decided, so
         * the stream is teed through a clone and each NDJSON line is stamped as it lands. The clone is
         * read in the background and the original response is handed back untouched.
         */
        const origFetch = w.fetch.bind(w);
        w.fetch = function (input, init) {
            let url = "";
            try { url = typeof input === "string" ? input : (input && input.url) || ""; } catch (e) { url = ""; }
            const isDrawer = url.indexOf("/api/admin/view-models/drawer/opportunity/") !== -1;
            const t0 = Math.round(performance.now());
            const p = origFetch(input, init);
            if (!isDrawer) return p;
            return p.then((res) => {
                const rec = { url: url.slice(-120), startedAt: t0, headersAt: Math.round(performance.now()), lines: [], phases: null, error: null };
                lines.push(rec);
                try {
                    const clone = res.clone();
                    const reader = clone.body && clone.body.getReader();
                    if (reader) {
                        const dec = new TextDecoder();
                        let buf = "";
                        const pump = () => reader.read().then(({ done, value }) => {
                            if (value) buf += dec.decode(value, { stream: true });
                            let i;
                            while ((i = buf.indexOf("\\n")) >= 0) {
                                const raw = buf.slice(0, i); buf = buf.slice(i + 1);
                                if (!raw.trim()) continue;
                                let keys = ["<unparseable>"]; let phases = null;
                                try {
                                    const o = JSON.parse(raw);
                                    keys = Object.keys(o);
                                    /*
                                     * The route publishes its phase map at the TOP level of the final
                                     * line as __route_phases, beside __server_duration_ms — not
                                     * inside the view model. A first pass looked for phases_ms and
                                     * reported null for every sample, which reads exactly like a
                                     * server that publishes nothing. Both spellings are accepted and
                                     * the duration is carried separately so absence stays visible.
                                     */
                                    const vm = o.__viewModel;
                                    const ph = o.__route_phases || (vm && (vm.phases_ms || vm.timings)) || o.phases_ms || null;
                                    if (ph && typeof ph === "object") phases = ph;
                                    if (typeof o.__server_duration_ms === "number") rec.serverDurationMs = o.__server_duration_ms;
                                } catch (e) { /* keys stay unparseable */ }
                                // KEYS AND SIZE ONLY. Never the payload.
                                rec.lines.push({ at: Math.round(performance.now()), keys: keys, bytes: raw.length });
                                if (phases) rec.phases = phases;
                            }
                            if (done) { rec.doneAt = Math.round(performance.now()); return; }
                            return pump();
                        }).catch((e) => { rec.error = String((e && e.name) || e).slice(0, 60); });
                        pump();
                    }
                } catch (e) { rec.error = String((e && e.name) || e).slice(0, 60); }
                return res;
            });
        };
        w.__oxT6 = { sup: sup, longtasks: longtasks, lines: lines, reqs: reqs };
    })()`);

    let sha: string | null = null;
    for (let i = 0; i < RUNS; i += 1) {
        if (i % PER_LOAD === 0) {
            await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
            await page.waitForTimeout(15_000);
        }
        if (sha == null) {
            sha = await page.evaluate(`(async () => {
                try { const r = await fetch("/api/build-info", { cache: "no-store" }); return ((await r.json()) || {}).gitSha || null; }
                catch (e) { return null; }
            })()`);
        }

        const hovered = await page.evaluate(`((i) => {
            const rows = [...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length < 2) return false;
            const target = rows[1 + (i % Math.max(1, rows.length - 1))];
            window.__oxT6.target = target;
            for (const t of ["pointerover","mouseover","pointerenter","mouseenter"]) {
                target.dispatchEvent(new MouseEvent(t, { bubbles: true }));
            }
            return true;
        })(${i})`);
        if (!hovered) { console.log(`[t6] ${JSON.stringify({ run: i, skipped: "no_rows" })}`); break; }
        await page.waitForTimeout(800);

        const sample = await page.evaluate(`(async (FIRST_ORDER) => {
            const HEADER = '[data-alloy-os-focus-panel-header="true"]';
            const RAIL   = '[data-focus-panel-carrier-actions="true"]';
            const w = window.__oxT6;
            const m = {};
            let t0 = 0;
            const mark = (k, t) => { if (m[k] == null) m[k] = Math.round(t - t0); };

            const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const mountedKeys = () => {
                const out = {};
                for (const e of document.querySelectorAll('[data-universal-card-key]')) {
                    const k = e.getAttribute('data-universal-card-key');
                    const s = e.getAttribute('data-card-subject');
                    if (k) out[k] = s || null;
                }
                return out;
            };
            const cardSubject = () => {
                const els = [...document.querySelectorAll('[data-card-subject]')];
                if (!els.length) return null;
                const vals = [...new Set(els.map((e) => e.getAttribute('data-card-subject')))];
                return vals.length === 1 ? vals[0] : 'MIXED';
            };
            /*
             * THE CELL'S OWN STATEMENT, where the build provides it.
             *
             * data-card-subject is fed from the payload ON SCREEN and by its own contract becomes
             * the destination only at the atomic swap; measured on 84a3e00a it was absent on all six
             * cards for the whole switch and appeared on all six at once at 1.8-2.3s. A milestone
             * built on it measures full-drawer completion. The cell attributes are the grid's own
             * decision — key, readiness, and the subject of the model the cell belongs to — so they
             * answer "is this first-order fact available for B" without waiting for the swap.
             */
            const cellState = () => [...document.querySelectorAll('[data-focus-panel-cell-key]')].map((e) => ({
                key: e.getAttribute('data-focus-panel-cell-key'),
                readiness: e.getAttribute('data-focus-panel-cell-readiness'),
                subject: e.getAttribute('data-focus-panel-cell-subject'),
                reason: e.getAttribute('data-focus-panel-cell-settled-reason'),
                mounted: e.getAttribute('data-focus-panel-cell-mounted') === 'true',
            }));
            const snap = () => ({
                cellState: cellState(),
                body: bodySubject(),
                cards: cardSubject(),
                mounted: mountedKeys(),
                prep: [...document.querySelectorAll('[data-focus-panel-cell-preparing]')].map((e) => e.getAttribute('data-focus-panel-cell-preparing')),
                nRes: document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length,
                nNA: document.querySelectorAll('[data-focus-panel-cell-not-applicable="true"]').length,
                cells: document.querySelectorAll('.alloy-os-ucard').length,
                // Where the cell declares WHY it left the reserve, read it. Absent on builds before
                // the convergence instrument, and reported absent rather than guessed.
                reasons: [...document.querySelectorAll('[data-focus-panel-cell-settled-reason]')]
                    .map((e) => [e.getAttribute('data-focus-panel-cell-key'), e.getAttribute('data-focus-panel-cell-settled-reason')]),
            });

            const subjectBefore = bodySubject();
            const cardsBefore = cardSubject();
            const ltBefore = w.longtasks.length;
            const linesBefore = w.lines.length;
            const reqsBefore = w.reqs.length;
            const carrierBefore = (window.__ALLOY_CARRIER_DIAG__ || []).length;

            let mixedFrames = 0;
            const mo = new MutationObserver(() => { if (cardSubject() === 'MIXED') mixedFrames += 1; });
            mo.observe(document, { childList: true, subtree: true, attributes: true });

            t0 = performance.now();
            w.target.click();

            /*
             * ONE POLLING LOOP FOR ALL THREE PREDICATES.
             *
             * The carrier probe marks inside a MutationObserver and the clear-semantics probe polls at
             * 40ms; running them on separate clocks in separate runs is part of why they disagree at
             * all. Here every predicate reads the SAME snapshot at the SAME instant, so any remaining
             * disagreement is a disagreement about the milestone and not about the sampling.
             */
            let sawReserved = false, reservedAt = null;
            let firstOrderConfigured = null;
            let firstOrderCells = null;
            const cleared = {};
            const trace = [];
            for (let k = 0; k < 560; k += 1) {
                await new Promise((r) => setTimeout(r, 25));
                const s = snap();
                const now = performance.now();
                const t = Math.round(now - t0);
                const cardsAreB = s.cards && s.cards !== 'MIXED' && s.cards !== cardsBefore;
                const switched = !!(s.body && subjectBefore && s.body !== subjectBefore);

                if (switched) {
                    mark('T4_snapshot', now);
                    const rail = document.querySelector(RAIL + '[data-focus-panel-carrier-subject="' + s.body + '"]');
                    if (rail && Number(rail.getAttribute('data-focus-panel-carrier-executable-count') || '0') > 0) mark('T5_executable', now);
                    if (document.querySelector(HEADER + ' [data-alloy-os-fp-header-actions="true"] button:not([disabled])')) mark('T5_action_enabled', now);
                }

                // The configured cell set for THIS surface, observed rather than assumed: every key
                // this panel ever showed, whether it arrived mounted or reserved.
                if (switched) {
                    if (firstOrderConfigured == null) firstOrderConfigured = {};
                    for (const k2 of s.prep) firstOrderConfigured[k2] = true;
                    for (const k2 of Object.keys(s.mounted)) firstOrderConfigured[k2] = true;
                }

                // A — the carrier probe's predicate, replayed exactly.
                if (cardsAreB && s.cells >= 6 && s.nRes === 0) mark('T6_carrier', now);

                // B — the clear-semantics predicate, replayed exactly (reserved phase required first).
                const waiting = s.prep.indexOf('children') !== -1 || s.prep.indexOf('household') !== -1;
                if (waiting && !sawReserved) { sawReserved = true; reservedAt = t; }
                if (sawReserved && !waiting) mark('T6_semantics', now);

                // C(legacy) — every configured first-order card declaring B via data-card-subject.
                // Retained ONLY so the two readings can be compared on one sample; it is not the gate.
                if (switched && firstOrderConfigured) {
                    const required = FIRST_ORDER.filter((k2) => firstOrderConfigured[k2]);
                    if (required.length > 0 && required.filter((k2) => s.mounted[k2] !== s.body).length === 0) {
                        mark('T6_cardsubject', now);
                    }
                }

                /*
                 * D — THE CANONICAL MILESTONE.
                 *
                 * Every configured first-order cell, for the COMMITTED subject, is either mounted with
                 * a readiness that means its fact arrived, or resolved as genuinely not applicable.
                 *
                 *   subject-bound     the cell must name B; an unnamed cell is UNKNOWN and fails
                 *   truth-aware       readiness, never geometry
                 *   UNKNOWN-safe      reserved fails, and so does phase_settled_unresolved — a
                 *                     surface that gave up did not deliver a fact
                 *   swap-independent  read from the grid's decision, not from the payload on screen
                 *   settlement-stable self_loading passes; enrichment landing later never unsets it
                 */
                if (switched && s.cellState.length) {
                    const byKey = {};
                    for (const c of s.cellState) if (c.key) byKey[c.key] = c;
                    if (firstOrderCells == null) firstOrderCells = {};
                    for (const k2 of Object.keys(byKey)) firstOrderCells[k2] = true;
                    const required = FIRST_ORDER.filter((k2) => firstOrderCells[k2]);
                    if (required.length > 0) {
                        const unmet = required.filter((k2) => {
                            const c = byKey[k2];
                            if (!c) return true;
                            if (c.subject !== s.body) return true;
                            if (c.reason === 'not_applicable') return false;
                            return !(c.mounted && (c.readiness === 'ready' || c.readiness === 'self_loading'));
                        });
                        if (unmet.length === 0) mark('T6_canonical', now);
                    }
                }

                for (const k2 of FIRST_ORDER) {
                    if (cleared[k2] == null && switched && s.mounted[k2] === s.body) cleared[k2] = t;
                }
                if (trace.length < 240) trace.push({ t, nRes: s.nRes, nNA: s.nNA, cells: s.cells, prep: s.prep.length, mountedB: Object.keys(s.mounted).filter((k2) => s.mounted[k2] === s.body).length });
                if (m.T6_canonical != null && m.T6_carrier != null && m.T6_semantics != null && t > (m.T6_canonical + 600)) break;
                if (t > 13000) break;
            }
            mo.disconnect();
            const end = snap();

            const lt = w.longtasks.slice(ltBefore).map((x) => ({ rel: Math.round(x.at - t0), dur: x.dur }));
            const myLines = w.lines.slice(linesBefore).map((r) => ({
                startedAt: Math.round(r.startedAt - t0),
                headersAt: Math.round(r.headersAt - t0),
                doneAt: r.doneAt == null ? null : Math.round(r.doneAt - t0),
                error: r.error,
                lines: r.lines.map((l) => ({ rel: Math.round(l.at - t0), keys: l.keys, bytes: l.bytes })),
                phases: r.phases,
                serverDurationMs: r.serverDurationMs == null ? null : r.serverDurationMs,
            }));
            const myReqs = w.reqs.slice(reqsBefore)
                .filter((r) => r.at >= t0 - 60)
                .map((r) => ({ path: r.path.slice(-90), rel: Math.round(r.at - t0), reqStart: Math.round(r.reqStart - t0), respStart: Math.round(r.respStart - t0), end: Math.round(r.end - t0), initiator: r.initiator, transfer: r.transfer }));
            const arrivals = (window.__ALLOY_CARRIER_DIAG__ || []).slice(carrierBefore).map((d) => ({ subjectMatches: d.subject === end.body, rel: Math.round(d.t - t0) }));
            const nav = (() => {
                try {
                    const n = performance.getEntriesByType('navigation')[0];
                    if (!n) return null;
                    return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), loadEnd: Math.round(n.loadEventEnd), respEnd: Math.round(n.responseEnd), clickSinceNav: Math.round(t0) };
                } catch (e) { return null; }
            })();
            const fd = window.__ALLOY_FOCUS_SETTLEMENT_DIAG__ || {};

            return {
                sup: w.sup,
                milestones: m,
                validSwitch: !!(end.body && subjectBefore && end.body !== subjectBefore),
                mixedFrames,
                sawReserved, reservedAt,
                configuredKeys: firstOrderConfigured ? Object.keys(firstOrderConfigured).sort() : null,
                // The canonical instrument's own positive control: absent means the deployed build
                // predates it, and the canonical milestone is reported null rather than substituted.
                canonicalInstrumentPresent: !!(firstOrderCells && Object.keys(firstOrderCells).length),
                cellKeys: firstOrderCells ? Object.keys(firstOrderCells).sort() : null,
                endCellState: end.cellState,
                firstOrderCleared: cleared,
                endState: { nRes: end.nRes, nNA: end.nNA, cells: end.cells, prep: end.prep, mountedB: Object.keys(end.mounted).filter((k2) => end.mounted[k2] === end.body).sort(), reasons: end.reasons },
                identity: { children: fd.inquiryChildrenIdentityPresent ?? null, contact: fd.primaryContactIdentityPresent ?? null, keyCount: fd.identityKeyCount ?? null },
                longtask: { count: lt.length, totalMs: lt.reduce((a, b) => a + b.dur, 0), maxMs: lt.reduce((a, b) => Math.max(a, b.dur), 0), entries: lt.slice(0, 12) },
                stream: myLines,
                requests: myReqs.slice(0, 14),
                carrierArrivals: arrivals.slice(0, 6),
                nav,
                trace: trace.filter((x, idx) => idx % 4 === 0 || x.nRes === 0).slice(0, 60),
            };
        })(${JSON.stringify(FIRST_ORDER_KEYS)})`);

        console.log(`[t6] ${JSON.stringify({ run: i, sha: (sha || "").slice(0, 8), perLoad: PER_LOAD, ...(sample as Record<string, unknown>) })}`);
    }
    console.log(`[t6-done] n=${RUNS}`);
});
