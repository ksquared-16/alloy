import { test } from "@playwright/test";

/**
 * SLICE C — WHEN THE OPERATOR SCROLLS OVER THE LEDGER, WHAT MOVES?
 *
 * The chain measurement showed the intended scroller inert (929px of content in a 929px box, because
 * an ancestor carries min-height:auto and refuses to shrink) while the "belt-and-braces" floor is the
 * one element that can scroll (423px showing 1199px). That explains the layout, but not yet the
 * operator's experience: a non-scrollable ancestor normally passes a wheel through to the floor.
 *
 * So this asks the browser rather than the stylesheet. It records scrollTop on EVERY link in the
 * chain, sends a real wheel over the ledger content where the operator's pointer would be, and
 * reports which link moved - if any. Then it tries the floor directly, which separates "nothing can
 * scroll" from "the wheel never reaches the thing that can".
 */
test("slice C — which element the wheel moves", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(13_000);

    /*
     * PRE-DEPLOY VERIFICATION. When SLICE_C_FIX=1 the candidate rule is injected into the live page
     * before the measurement, so the rule can be proven right or wrong without spending a deploy
     * cycle on a guess. This is NOT the deployed certification — that still has to run on the served
     * build — but a rule that fails here would never have been worth deploying.
     */
    if (process.env.SLICE_C_FIX === "1") {
        await page.addStyleTag({
            content: `.alloy-accounts-account-card [data-financials-surface-role="floor"] .alloy-os-billing--detail,
                      .alloy-accounts-account-card [data-financials-surface-role="floor"] .alloy-os-billing--detail > .alloy-os-ucard {
                          display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
                      }`,
        });
    }

    const prep = await page.evaluate(`(async () => {
        const nav = document.querySelector('[data-adminv2-sidebar-modal-nav="financials"]');
        if (!nav) return { skipped: 'no_nav' };
        nav.click(); await new Promise((r) => setTimeout(r, 6500));
        if (document.querySelectorAll('[data-financials-account-row]').length < 2) {
            const tab = [...document.querySelectorAll('button,a')].find((e) => /^accounts$/i.test((e.textContent || '').trim()));
            if (tab) { tab.click(); await new Promise((r) => setTimeout(r, 6500)); }
        }
        const rows = [...document.querySelectorAll('[data-financials-account-row]')];
        if (rows.length < 2) return { skipped: 'no_rows' };
        const pick = rows.find((r) => r.getAttribute('data-financials-account-truth') === 'known') || rows[1];
        pick.click();
        await new Promise((r) => setTimeout(r, 9000));
        const sc = document.querySelector('[data-financials-detail-scroll]');
        if (!sc) return { skipped: 'no_scroller' };
        /*
         * THE CENTRE OF THE SCROLLER'S OWN VISIBLE BOX.
         *
         * A first version aimed at a ledger row and offset down by up to 200px. Once the candidate
         * rule bounds the scroller to ~153px that point lands BELOW it, on a different element, and
         * the wheel legitimately does nothing — which would have read as the fix failing. Aim at the
         * box the operator is actually scrolling.
         */
        const r = sc.getBoundingClientRect();
        return {
            ok: true,
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
            scrollerRect: { top: Math.round(r.top), h: Math.round(r.height) },
        };
    })()`);
    if (!(prep as Record<string, unknown>).ok) { console.log(`[WHEEL] ${JSON.stringify(prep)}`); return; }

    // A REAL wheel from Playwright at the operator's pointer position — not a synthetic event.
    const p = prep as { x: number; y: number };
    await page.mouse.move(p.x, p.y);
    const before = await page.evaluate(`(() => {
        const sc = document.querySelector('[data-financials-detail-scroll]');
        const chain = []; let el = sc;
        for (let i = 0; i < 16 && el && el !== document.documentElement; i += 1) { chain.push(el.scrollTop); el = el.parentElement; }
        window.__chainBefore = chain;
        return chain;
    })()`);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(700);
    const out = await page.evaluate(`(() => {
        const sc = document.querySelector('[data-financials-detail-scroll]');
        const after = []; const info = []; let el = sc;
        for (let i = 0; i < 16 && el && el !== document.documentElement; i += 1) {
            after.push(el.scrollTop);
            info.push({
                i, tag: el.tagName.toLowerCase(),
                data: [...el.attributes].filter((a) => a.name.indexOf('data-financials') === 0)
                    .map((a) => a.name.replace('data-financials-', 'f:')).join(' ').slice(0, 44),
                scrollH: el.scrollHeight, clientH: el.clientHeight,
                canScroll: el.scrollHeight > el.clientHeight + 1,
            });
            el = el.parentElement;
        }
        const before = window.__chainBefore || [];
        const moved = info.filter((x, i) => (after[i] || 0) !== (before[i] || 0));
        // Now try the one element that CAN scroll, directly.
        const floor = info.find((x) => x.canScroll);
        let floorEl = sc; for (let i = 0; i < (floor ? floor.i : 0); i += 1) floorEl = floorEl.parentElement;
        const floorBefore = floorEl ? floorEl.scrollTop : null;
        if (floorEl) floorEl.scrollTop = 500;
        const floorAfter = floorEl ? floorEl.scrollTop : null;
        return {
            REAL_WHEEL_MOVED_ANYTHING: moved.length > 0,
            movedLinks: moved.map((m) => ({ i: m.i, data: m.data, canScroll: m.canScroll })),
            before, after,
            scrollableLink: floor || null,
            FLOOR_DIRECT_SCROLL_WORKS: floorBefore !== floorAfter,
            floorBefore, floorAfter,
            chain: info,
        };
    })()`);
    console.log(`[WHEEL] ${JSON.stringify(out)}`);
});
