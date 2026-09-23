import { test } from "@playwright/test";

/**
 * OX SLICE 3 — WAS THE REVEAL GATE ACTUALLY ACTIVE WHEN THE NEIGHBOURS FIRED?
 *
 * The contention hypothesis must be proven CAUSALLY before any scheduling change. The runtime
 * already answers this in production: `recordRevealGateEvent` writes begin / end /
 * subject_warm_emitted / subject_warm_suppressed / neighbour_effect into
 * `window.__ALLOY_REVEAL_GATE_DIAG__` with a timestamp and the gate's `active` flag at that
 * instant — deliberately NOT gated on NODE_ENV, precisely so the gate can be proven on the build
 * the measurements run against.
 *
 * So this reads the gate's own timeline across a real row switch and pairs it with the network.
 * If neighbours emitted while `active` was true the gate is broken; if `active` was false the gate
 * simply was not armed for this event; if they were suppressed the hypothesis is already wrong and
 * the contention is somewhere else.
 */
test("ox3 gate trace", async ({ page }) => {
    test.setTimeout(240_000);
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
        w.__ox3 = { reqs, clickAt: -1 };
    });

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(15000);

    // Pointer intent, then click — the real operator sequence Slice 2 established.
    await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 2) return false;
        const cur = rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        window.__ox3.target = rows[cur>=0?(cur+1)%rows.length:1];
        for (const t of ["pointerover","mouseover","pointerenter","mouseenter"]) {
            window.__ox3.target.dispatchEvent(new MouseEvent(t, { bubbles: true }));
        }
        return true;
    })()`);
    await page.waitForTimeout(800);
    /*
     * SEMANTIC MILESTONES, OBSERVED — not inferred from quiescence.
     *
     * T4 SELECTED_RECORD_AUTHORITATIVE: the header names the NEW subject. Captured as "the header
     *    identity text differs from the one on screen before the click", which is the operator's
     *    own test for "this is B now". Recorded only once.
     * T5 FIRST_ACTIONABLE_MEANING: the header's primary action control is present and enabled, i.e.
     *    the operator can actually continue work on B.
     * T6 ALL_FIRST_ORDER_FACTS_RESOLVED: every configured cell carries content — no cell is still
     *    reserved. Reserved cells are honest UNKNOWN, so this is the point at which first-order
     *    truth has landed rather than the point at which the DOM stops moving.
     */
    await page.evaluate(`(() => {
        const HEADER = '[data-alloy-os-focus-panel-header="true"]';
        const idText = () => (document.querySelector(HEADER)?.textContent || '').replace(/\\s+/g,' ').trim().slice(0,80);
        const w = window.__ox3;
        w.identityBefore = idText();
        w.milestones = {};
        w.clickAt = Math.round(performance.now());
        const mark = (k) => { if (w.milestones[k] == null) w.milestones[k] = Math.round(performance.now()) - w.clickAt; };
        /*
         * SUBJECT-BOUND, NOT GEOMETRY-BOUND.
         *
         * The panel retains A's cards while B resolves, so "six cells, none reserved" and "an enabled
         * header action" are both satisfied by A while B is selected — Slice 4 measured exactly that
         * and had to throw its T5/T6 away. Every milestone below is therefore keyed to B's own id,
         * read from data-card-subject, which each card now carries from context.subject.id.
         */
        const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
        w.subjectBefore = bodySubject();
        const cardsFor = (id) => id ? document.querySelectorAll('[data-card-subject="' + id + '"]').length : 0;
        w.__mo = new MutationObserver(() => {
            const nowSubject = bodySubject();
            const isB = nowSubject && nowSubject !== w.subjectBefore;
            if (idText() && idText() !== w.identityBefore && isB) mark('T4_authoritative');
            if (w.milestones.T4_authoritative == null) return;
            // T5: the operator can act on B — an enabled header action WHILE the body is bound to B
            // and at least one card has actually composed against B.
            const act = document.querySelector(HEADER + ' [data-alloy-os-fp-header-actions="true"] button:not([disabled])');
            if (act && cardsFor(nowSubject) >= 1) mark('T5_actionable');
            // T6: every configured cell carries B's content — no cell still showing A, none reserved.
            const cells = document.querySelectorAll('.alloy-os-ucard').length;
            const reserved = document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length;
            if (cells >= 6 && reserved === 0 && cardsFor(nowSubject) >= cells) mark('T6_first_order');
            w.cardsB = cardsFor(nowSubject);
            w.cellsTotal = cells;
        });
        w.__mo.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
        w.gateAtClick = (window.__ALLOY_REVEAL_GATE_DIAG__||[]).length;
        w.target.click();
        return true;
    })()`);
    await page.waitForTimeout(14000);

    const out = await page.evaluate(() => {
        const w = window as unknown as {
            __ox3: { reqs: Array<{ at: number; end: number; path: string }>; clickAt: number; gateAtClick: number };
            __ALLOY_REVEAL_GATE_DIAG__?: Array<{ t: number; event: string; active: boolean; detail?: string }>;
        };
        const { reqs, clickAt } = w.__ox3;
        const gate = (w.__ALLOY_REVEAL_GATE_DIAG__ ?? []).map((g) => ({ ...g, rel: g.t - clickAt }));
        const app = reqs.filter((r) => r.path.startsWith("/api/")).map((r) => ({
            rel: r.at - clickAt, dur: r.end - r.at, path: r.path,
        }));
        const subjectOf = (p: string) => {
            const m = p.match(/subject_id=([0-9a-f-]{36})/) || p.match(/opportunity\/([0-9a-f-]{36})/);
            return m ? m[1] : null;
        };
        const selected = (() => {
            const sel = document.querySelector('[data-alloy-os-focus-panel-header="true"]');
            return sel ? (sel.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60) : null;
        })();
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            gateAvailable: Array.isArray(w.__ALLOY_REVEAL_GATE_DIAG__),
            gateEventsAfterClick: gate.filter((g) => g.rel >= -200).slice(0, 40),
            postClickRequests: app.filter((r) => r.rel >= -50).sort((a, b) => a.rel - b.rel).slice(0, 25)
                .map((r) => ({ ...r, subject: subjectOf(r.path) })),
            selectedHeader: selected,
            milestones: (w.__ox3 as unknown as { milestones?: Record<string, number> }).milestones ?? null,
            identityBefore: (w.__ox3 as unknown as { identityBefore?: string }).identityBefore ?? null,
            subjectBefore: (w.__ox3 as unknown as { subjectBefore?: string }).subjectBefore ?? null,
            cardsBoundToB: (w.__ox3 as unknown as { cardsB?: number }).cardsB ?? null,
            cellsTotal: (w.__ox3 as unknown as { cellsTotal?: number }).cellsTotal ?? null,
        };
    });
    console.log(`[gate] ${JSON.stringify(out)}`);
});
