import { test } from "@playwright/test";

/**
 * HUMAN-QA INCIDENT — THREE AUTHORITIES THAT MUST NOT COLLAPSE INTO ONE.
 *
 * Reported on current staging: the Work View moved off Waitlist with no operator gesture; clicking
 * back to Waitlist did not reliably take; and on All, the queue rows appeared to change according to
 * which row was selected. Those are three different contract violations, and this probe is built to
 * tell them apart rather than to confirm any one of them.
 *
 * Selectors are the ones the shell actually publishes, read off the deployed DOM rather than guessed:
 * work-view pills are role=tab buttons carrying data-work-view-id and aria-selected, and a queue row
 * carries its subject as data-entity-id. An earlier pass invented attributes and reported a queue of
 * nulls, which would have read as "membership never changes" for the wrong reason.
 *
 * Every pushState and replaceState is wrapped BEFORE the app loads and keeps a stack, so a Work View
 * change that no operator asked for is attributed to the writer rather than inferred after the fact.
 *
 * PRIVACY. Opaque ids, counts, labels and timings only.
 */
const IDLE_MS = Number(process.env.NAV_IDLE_MS ?? "45000");

const HARNESS = `
    const pills = () => [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].map((e) => ({
        id: e.getAttribute('data-work-view-id'),
        label: (e.textContent || '').trim().slice(0, 24),
        selected: e.getAttribute('aria-selected') === 'true',
    }));
    const selectedPill = () => (pills().find((p) => p.selected) || {}).id || null;
    const queue = () => [...document.querySelectorAll('.alloy-os-queue-row-card')]
        .map((e) => e.getAttribute('data-entity-id'));
    const activeRow = () => {
        const r = document.querySelector('.alloy-os-queue-row-card[data-queue-row-active="true"]');
        return r ? r.getAttribute('data-entity-id') : null;
    };
    const subject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
    const snap = () => ({
        url: location.pathname + location.search,
        view: selectedPill(),
        queue: queue(),
        n: queue().length,
        active: activeRow(),
        subject: subject(),
    });
    const clickPill = (id) => {
        const p = [...document.querySelectorAll('button[role="tab"][data-work-view-id]')]
            .find((e) => e.getAttribute('data-work-view-id') === id);
        if (p) { p.click(); return true; }
        return false;
    };
`;

test("journey A — work view stability under idle settlement", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.addInitScript(`(() => {
        const writes = [];
        const wrap = (kind, orig) => function (state, title, url) {
            try {
                writes.push({
                    at: Math.round(performance.now()), kind: kind,
                    url: String(url == null ? location.href : url),
                    stack: (new Error().stack || "").split("\\n").slice(2, 6).join(" | ").slice(0, 400),
                });
            } catch (e) { /* diagnostics are never load-bearing */ }
            return orig.apply(this, arguments);
        };
        history.pushState = wrap("push", history.pushState);
        history.replaceState = wrap("replace", history.replaceState);
        window.__nav = { writes: writes };
    })()`);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(15_000);

    const out = await page.evaluate(`(async (idleMs) => {
        ${HARNESS}
        const all = pills();
        // The reported journey starts on Waitlist. Resolve it by LABEL, because the view id is a
        // tenant-authored key and hard-coding one would silently measure a different view.
        const waitlist = all.find((p) => /waitlist/i.test(p.label));
        if (!waitlist) return { skipped: 'no_waitlist_pill', pills: all };
        clickPill(waitlist.id);
        await new Promise((r) => setTimeout(r, 6000));
        const rows = [...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 2) return { skipped: 'no_rows_on_waitlist', pills: pills(), snap: snap() };
        const afterView = snap();
        const t0 = performance.now();
        rows[1].click();

        const timeline = []; let prev = null;
        for (let i = 0; i * 250 < idleMs; i += 1) {
            await new Promise((r) => setTimeout(r, 250));
            const s = snap();
            const k = JSON.stringify([s.url, s.view, s.queue, s.subject]);
            if (k !== prev) { timeline.push({ t: Math.round(performance.now() - t0), ...s }); prev = k; }
        }
        const drifted = timeline.filter((x) => x.view !== waitlist.id);
        return {
            waitlistId: waitlist.id, pills: all, afterView, timeline,
            VIOLATION_view_drifted: drifted.length > 0,
            driftedTo: drifted.map((d) => ({ t: d.t, view: d.view })),
            writes: (window.__nav.writes || []).map((x) => ({ rel: x.at - Math.round(t0), kind: x.kind, url: x.url, stack: x.stack })),
        };
    })(${IDLE_MS})`);
    console.log(`[A] ${JSON.stringify(out)}`);
});

test("journey C — queue membership under subject selection", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(15_000);

    const out = await page.evaluate(`(async () => {
        ${HARNESS}
        const all = pills();
        // "All" is the view the operator reported the queue changing under.
        const allView = all.find((p) => /^all/i.test(p.label));
        if (!allView) return { skipped: 'no_all_pill', pills: all };
        clickPill(allView.id);
        await new Promise((r) => setTimeout(r, 8000));

        const observations = [{ step: 'after_view_click', ...snap() }];
        for (let i = 1; i <= 3; i += 1) {
            const rows = [...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length <= i) break;
            rows[i].click();
            await new Promise((r) => setTimeout(r, 7000));
            observations.push({ step: 'after_select_row_' + i, ...snap() });
        }
        const base = observations[0].queue;
        const membershipChanged = observations.some((o) => JSON.stringify([...o.queue].sort()) !== JSON.stringify([...base].sort()));
        const orderChanged = observations.some((o) => JSON.stringify(o.queue) !== JSON.stringify(base));
        const viewChanged = observations.some((o) => o.view !== observations[0].view);
        return {
            allViewId: allView.id, observations,
            VIOLATION_membership_changed: membershipChanged,
            VIOLATION_order_changed: orderChanged,
            VIOLATION_view_changed_by_subject: viewChanged,
        };
    })()`);
    console.log(`[C] ${JSON.stringify(out)}`);
});

test("journey B — does a work view click reliably take", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(15_000);

    const out = await page.evaluate(`(async () => {
        ${HARNESS}
        const all = pills();
        const byLabel = (re) => (all.find((p) => re.test(p.label)) || {}).id || null;
        const seq = [byLabel(/waitlist/i), byLabel(/^all/i), byLabel(/waitlist/i), byLabel(/enrolled/i), byLabel(/waitlist/i)];
        if (seq.some((x) => !x)) return { skipped: 'missing_pill', pills: all };
        const results = [];
        for (const want of seq) {
            const t0 = performance.now();
            clickPill(want);
            let ackAt = null, urlAt = null, queueAt = null;
            const q0 = JSON.stringify(queue());
            for (let i = 0; i < 80; i += 1) {
                await new Promise((r) => setTimeout(r, 125));
                const t = Math.round(performance.now() - t0);
                if (ackAt == null && selectedPill() === want) ackAt = t;
                if (urlAt == null && (location.search.indexOf(want) !== -1)) urlAt = t;
                if (queueAt == null && JSON.stringify(queue()) !== q0) queueAt = t;
                if (ackAt != null && queueAt != null && t > ackAt + 2500) break;
            }
            await new Promise((r) => setTimeout(r, 2500));
            const s = snap();
            results.push({
                want, ackAt, urlAt, queueAt,
                settledView: s.view,
                TOOK: s.view === want,
                n: s.n, subject: s.subject,
            });
        }
        return { results, VIOLATION_click_did_not_take: results.filter((r) => !r.TOOK).length };
    })()`);
    console.log(`[B] ${JSON.stringify(out)}`);
});
