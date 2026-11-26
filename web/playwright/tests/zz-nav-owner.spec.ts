import { test } from "@playwright/test";

/**
 * THE OWNER, read out of the production trace rather than inferred.
 *
 * `__ALLOY_WV_CLICK_TRACE__` records every work-view click that survived the resolver: its intent,
 * the resolved action kind, and crucially the `currentWorkViewId` the resolver compared against. It
 * is pushed AFTER the `noop` early return, so a click with no entry is a click the resolver refused
 * — which makes the absence itself the evidence.
 */
test("nav owner", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(15_000);

    const out = await page.evaluate(`(async () => {
        const pills = () => [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].map((e) => ({
            id: e.getAttribute('data-work-view-id'), label: (e.textContent || '').trim().slice(0, 24),
        }));
        const click = (id) => {
            const p = [...document.querySelectorAll('button[role="tab"][data-work-view-id]')]
                .find((e) => e.getAttribute('data-work-view-id') === id);
            if (!p) return false; p.click(); return true;
        };
        const queue = () => [...document.querySelectorAll('.alloy-os-queue-row-card')].length;
        const urlView = () => new URLSearchParams(location.search).get('work_view_id');
        const all = pills();
        const wl = all.find((p) => /waitlist/i.test(p.label));
        const av = all.find((p) => /^all/i.test(p.label));
        if (!wl || !av) return { skipped: 'pills_missing', all };

        const steps = [];
        for (const v of [wl, av, wl]) {
            const before = (window.__ALLOY_WV_CLICK_TRACE__ || []).length;
            const nBefore = queue(), uBefore = urlView();
            click(v.id);
            await new Promise((r) => setTimeout(r, 6000));
            const tr = (window.__ALLOY_WV_CLICK_TRACE__ || []).slice(before);
            steps.push({
                want: v.id, label: v.label,
                nBefore, nAfter: queue(), urlBefore: uBefore, urlAfter: urlView(),
                traced: tr.length,
                // No entry means the resolver returned noop before the trace push.
                RESOLVER_REFUSED: tr.length === 0,
                entries: tr.map((x) => ({
                    intent: x.intentWorkViewId, actionKind: x.actionKind,
                    currentWorkViewId: x.currentWorkViewId, attentionLens: x.attentionLens,
                    lensIds: Array.isArray(x.surfaceLensIds) ? x.surfaceLensIds.length : null,
                })),
            });
        }
        return { pills: all, steps, fullTrace: (window.__ALLOY_WV_CLICK_TRACE__ || []).map((x) => ({
            intent: x.intentWorkViewId, kind: x.actionKind, current: x.currentWorkViewId, lens: x.attentionLens,
        })) };
    })()`);
    console.log(`[OWNER] ${JSON.stringify(out)}`);
});
