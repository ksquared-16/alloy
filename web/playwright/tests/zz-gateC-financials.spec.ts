import { test } from "@playwright/test";

/**
 * GATE C — IS THE FINANCIALS CARD ALWAYS THE COMMITTED SUBJECT'S?
 *
 * Human QA saw one family with a fully populated Financials card and another state showing only
 * BALANCE / PAST DUE / PAYMENTS with no figures. The navigation defect was live at the time, so the
 * hypothesis is that the operator was reading one view under another view's name. That is plausible
 * and this probe exists to decide it rather than assume it.
 *
 * The card publishes its own classification, so appearance is never the verdict:
 *   permission   the read was denied
 *   loading      committed anatomy with placeholders - by contract never a number and never a zero
 *   no-subject   resolved: this record has no financial subject
 *   no-account   resolved: no account
 * absent         the card settled into real figures
 *
 * PRIVACY. No money and no names leave the page. Monetary state travels as a DIGEST of the card's
 * numeric text, which is enough to prove figures changed with the subject and that A's figures never
 * appear under B, without emitting anyone's balance. Subjects are opaque ids plus a role label.
 */
const STEP_SETTLE_MS = Number(process.env.GC_SETTLE_MS ?? "9000");

test("gate C — financials subject and truth convergence", async ({ page }) => {
    test.setTimeout(1_800_000);

    await page.addInitScript(`(() => {
        const reqs = [];
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    if (e.name.indexOf('/api/admin/financials/') === -1) return;
                    let path = e.name;
                    try { const u = new URL(e.name); path = u.pathname + u.search; } catch (x) { /* raw */ }
                    reqs.push({ at: Math.round(e.startTime), end: Math.round(e.responseEnd), path });
                }
            }).observe({ entryTypes: ['resource'] });
        } catch (e) { /* absence is reported, never faked */ }
        window.__gc = { reqs: reqs };
    })()`);

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(15_000);

    const out = await page.evaluate(`(async (settleMs) => {
        const pills = () => [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].map((e) => ({
            id: e.getAttribute('data-work-view-id'), label: (e.textContent || '').trim().slice(0, 24),
            selected: e.getAttribute('aria-selected') === 'true',
        }));
        const clickPill = (id) => {
            const p = [...document.querySelectorAll('button[role="tab"][data-work-view-id]')]
                .find((e) => e.getAttribute('data-work-view-id') === id);
            if (!p) return false; p.click(); return true;
        };
        const urlView = () => new URLSearchParams(location.search).get('work_view_id');
        const rows = () => [...document.querySelectorAll('.alloy-os-queue-row-card')];
        const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;

        // The financials CELL states what the grid decided; the card states what it rendered.
        const finCell = () => {
            const e = document.querySelector('[data-focus-panel-cell-key="financials"]');
            if (!e) return null;
            return {
                readiness: e.getAttribute('data-focus-panel-cell-readiness'),
                subject: e.getAttribute('data-focus-panel-cell-subject'),
                reason: e.getAttribute('data-focus-panel-cell-settled-reason'),
                mounted: e.getAttribute('data-focus-panel-cell-mounted') === 'true',
            };
        };
        const finCard = () => {
            const host = document.querySelector('[data-universal-card-key="financials"]');
            if (!host) return { present: false };
            const empty = host.querySelector('[data-financials-empty]');
            const txt = (host.textContent || '');
            // DIGEST, not the figures. Enough to prove the numbers changed with the subject.
            const nums = txt.match(/[0-9][0-9,]*\\.[0-9]{2}/g) || [];
            let h = 0;
            for (const n of nums) { for (let i = 0; i < n.length; i += 1) { h = ((h << 5) - h + n.charCodeAt(i)) | 0; } }
            return {
                present: true,
                cardSubject: host.getAttribute('data-card-subject'),
                emptyClass: empty ? empty.getAttribute('data-financials-empty') : null,
                figureCount: nums.length,
                figureDigest: nums.length ? String(h) : null,
                hasZeroOnly: nums.length > 0 && nums.every((n) => /^0\\.00$/.test(n)),
            };
        };
        const snap = (label) => ({
            label,
            view: urlView(),
            pill: (pills().find((p) => p.selected) || {}).id || null,
            subject: bodySubject(),
            cell: finCell(),
            card: finCard(),
        });

        const all = pills();
        const by = (re) => all.find((p) => new RegExp(re, 'i').test(p.label)) || null;
        const waitlist = by('waitlist'), allView = by('^all');
        if (!waitlist || !allView) return { skipped: 'pills_missing', pills: all };

        const steps = [];
        const record = async (label) => {
            // Watch for a KNOWN -> UNKNOWN regression across the settle window, not only at its end.
            const seen = [];
            for (let i = 0; i * 300 < settleMs; i += 1) {
                await new Promise((r) => setTimeout(r, 300));
                const s = snap(label);
                const k = JSON.stringify([s.subject, s.card.emptyClass, s.card.figureDigest]);
                if (!seen.length || seen[seen.length - 1].k !== k) seen.push({ k, t: i * 300, s });
            }
            const final = snap(label);
            const classes = seen.map((x) => x.s.card.emptyClass);
            const becameKnown = seen.findIndex((x) => x.s.card.emptyClass == null && x.s.card.figureCount > 0);
            const regressed = becameKnown >= 0 && seen.slice(becameKnown).some((x) => x.s.card.emptyClass === 'loading');
            steps.push({ ...final, classSequence: classes, KNOWN_TO_UNKNOWN: regressed, frames: seen.length });
            return final;
        };

        const selectRow = async (i) => { const r = rows(); if (r.length > i) { r[i].click(); return true; } return false; };

        // 1 — direct load baseline on Waitlist, first subject
        clickPill(waitlist.id); await new Promise((r) => setTimeout(r, 7000));
        await selectRow(0); const s1 = await record('waitlist_subjectA');
        // 2 — subject switch within one view
        await selectRow(1); const s2 = await record('waitlist_subjectB');
        // 3 — back to the first subject
        await selectRow(0); const s3 = await record('waitlist_subjectA_again');
        // 4 — RAPID A then B: the late A financials answer must not reshape B
        await selectRow(1); await new Promise((r) => setTimeout(r, 150)); await selectRow(2);
        const s4 = await record('rapid_A_then_C');
        // 5 — return-to-visited lens with cached financials truth
        clickPill(allView.id); await new Promise((r) => setTimeout(r, 7000));
        await selectRow(0); const s5 = await record('all_subject0');
        clickPill(waitlist.id); await new Promise((r) => setTimeout(r, 7000));
        const s6 = await record('return_waitlist_cached');

        const finReqs = (window.__gc.reqs || []).filter((r) => r.path.indexOf('/financials/card') !== -1)
            .map((r) => { const m = r.path.match(/customer_id=([0-9a-f-]{36})/); return { at: r.at, payer: m ? m[1] : null }; });
        const digests = {};
        for (const s of steps) if (s.card.figureDigest) (digests[s.card.figureDigest] ||= []).push(s.subject);
        const crossSubject = Object.entries(digests).filter(([, subs]) => new Set(subs).size > 1);

        return {
            steps,
            payerRequests: finReqs,
            distinctPayers: [...new Set(finReqs.map((r) => r.payer).filter(Boolean))].length,
            VIOLATION_card_subject_mismatch: steps.filter((s) => s.card.present && s.card.cardSubject && s.subject && s.card.cardSubject !== s.subject).length,
            VIOLATION_cell_subject_mismatch: steps.filter((s) => s.cell && s.cell.subject && s.subject && s.cell.subject !== s.subject).length,
            VIOLATION_known_to_unknown: steps.filter((s) => s.KNOWN_TO_UNKNOWN).length,
            VIOLATION_shared_figures_across_subjects: crossSubject.length,
            VIOLATION_zero_while_loading: steps.filter((s) => s.card.emptyClass === 'loading' && s.card.figureCount > 0).length,
            stuckLoading: steps.filter((s) => s.card.emptyClass === 'loading').map((s) => s.label),
        };
    })(${STEP_SETTLE_MS})`);

    console.log(`[GATEC] ${JSON.stringify(out)}`);
});
