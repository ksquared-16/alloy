import { test } from "@playwright/test";

/**
 * WHICH work-view click fails, and does a second click rescue it?
 *
 * Journey B reproduced the operator's report: the pill acknowledges in ~150ms while the URL and the
 * queue never move, leaving the previous view's rows under the new view's pill. This narrows it.
 *
 * Two questions the first run could not answer. Is the failure specific to RETURNING to a view the
 * session has already visited, or does it hit any view? And does clicking again take, which is what
 * "did not RELIABLY switch" would mean for an operator who clicks twice.
 *
 * The queue count is the honest signal, not the pill: the pill is the thing that lies.
 */
const STEPS: Array<[string, RegExp]> = [
    ["waitlist", /waitlist/i],
    ["all", /^all/i],
    ["waitlist", /waitlist/i],
    ["all", /^all/i],
    ["registration", /registration/i],
    ["waitlist", /waitlist/i],
];

test("journey B2 — which click fails and does a retry take", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(15_000);

    const out = await page.evaluate(`(async (steps) => {
        const pills = () => [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].map((e) => ({
            id: e.getAttribute('data-work-view-id'),
            label: (e.textContent || '').trim().slice(0, 24),
            selected: e.getAttribute('aria-selected') === 'true',
        }));
        const sel = () => (pills().find((p) => p.selected) || {}).id || null;
        const queue = () => [...document.querySelectorAll('.alloy-os-queue-row-card')].map((e) => e.getAttribute('data-entity-id'));
        const urlView = () => new URLSearchParams(location.search).get('work_view_id');
        const click = (id) => {
            const p = [...document.querySelectorAll('button[role="tab"][data-work-view-id]')]
                .find((e) => e.getAttribute('data-work-view-id') === id);
            if (!p) return false; p.click(); return true;
        };
        const all = pills();
        const resolve = (reSrc) => { const re = new RegExp(reSrc[0], reSrc[1]); const p = all.find((x) => re.test(x.label)); return p || null; };

        const attempt = async (view) => {
            const before = { q: JSON.stringify(queue()), url: urlView(), n: queue().length };
            const t0 = performance.now();
            click(view.id);
            let ackAt = null, urlAt = null, queueAt = null;
            for (let i = 0; i < 100; i += 1) {
                await new Promise((r) => setTimeout(r, 120));
                const t = Math.round(performance.now() - t0);
                if (ackAt == null && sel() === view.id) ackAt = t;
                if (urlAt == null && urlView() === view.id) urlAt = t;
                if (queueAt == null && JSON.stringify(queue()) !== before.q) queueAt = t;
                if (urlAt != null && queueAt != null) break;
            }
            await new Promise((r) => setTimeout(r, 3000));
            return {
                ackAt, urlAt, queueAt,
                nBefore: before.n, nAfter: queue().length,
                urlBefore: before.url, urlAfter: urlView(),
                pillSaysSelected: sel() === view.id,
                TOOK: urlView() === view.id && JSON.stringify(queue()) !== before.q,
            };
        };

        const results = [];
        const visited = {};
        for (const [name, reSrc] of steps) {
            const view = resolve(reSrc);
            if (!view) { results.push({ name, skipped: 'pill_absent' }); continue; }
            const first = await attempt(view);
            let retry = null;
            // The operator clicks again when nothing happens. Whether THAT takes is the difference
            // between an unreliable control and a dead one.
            if (!first.TOOK) retry = await attempt(view);
            results.push({
                name, viewId: view.id, label: view.label,
                returning: !!visited[view.id],
                first, retry,
            });
            visited[view.id] = true;
        }
        return {
            pills: all,
            results,
            FAILED_FIRST_CLICKS: results.filter((r) => r.first && !r.first.TOOK).length,
            FAILED_EVEN_ON_RETRY: results.filter((r) => r.retry && !r.retry.TOOK).length,
        };
    })(${JSON.stringify(STEPS.map(([n, r]) => [n, [r.source, r.flags]]).map(([n, r]) => [n, r]))})`);

    console.log(`[B2] ${JSON.stringify(out)}`);
});
