import { test } from "@playwright/test";

/**
 * SLICE C — WHY THE ACCOUNT DETAILS LEDGER CANNOT BE SCROLLED.
 *
 * The operator reports that the selected account's Details ledger extends past the viewport and
 * normal scrolling will not reach the rest of it.
 *
 * The CSS already intends a bounded flex scroller, and data-financials-surface-role=floor is present
 * in the live DOM, so the rules ought to match. Reading more source would only produce another
 * plausible story; this measures the mounted layout instead. It walks the ancestor chain from the
 * ledger content up to the shell and reports, for each link, what it actually computes to and
 * whether it can scroll — then performs a real wheel scroll and reports whether scrollTop moved.
 *
 * It also distinguishes CONTENT CLIPPED from CONTENT NEVER RENDERED, because repairing scrolling
 * would be the wrong fix for missing rows.
 *
 * PRIVACY: geometry, computed styles, counts. No names and no money.
 */
test("slice C — details scroll ownership", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(13_000);

    const out = await page.evaluate(`(async () => {
        const nav = document.querySelector('[data-adminv2-sidebar-modal-nav="financials"]');
        if (!nav) return { skipped: 'no_financials_nav' };
        nav.click(); await new Promise((r) => setTimeout(r, 6500));
        if (document.querySelectorAll('[data-financials-account-row]').length < 2) {
            const tab = [...document.querySelectorAll('button,a')].find((e) => /^accounts$/i.test((e.textContent || '').trim()));
            if (tab) { tab.click(); await new Promise((r) => setTimeout(r, 6500)); }
        }
        const rows = [...document.querySelectorAll('[data-financials-account-row]')];
        if (rows.length < 2) return { skipped: 'no_rows', n: rows.length };

        // Prefer an account the rail marks as having real activity — a long ledger is the case
        // the operator described, and a known_zero account may have nothing to scroll.
        const withTruth = rows.find((r) => r.getAttribute('data-financials-account-truth') === 'known') || rows[1];
        withTruth.click();
        await new Promise((r) => setTimeout(r, 9000));

        const scroller = document.querySelector('[data-financials-detail-scroll]');
        const ledgerRows = document.querySelectorAll('[data-financials-row-group], [data-financials-ledger-row]').length;
        if (!scroller) return { skipped: 'no_detail_scroll_container', ledgerRows };

        const describe = (el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {
                tag: el.tagName.toLowerCase(),
                cls: (el.className || '').toString().slice(0, 58),
                data: [...el.attributes].filter((a) => a.name.indexOf('data-financials') === 0 || a.name.indexOf('data-adminv2') === 0)
                    .map((a) => a.name.replace('data-financials-', 'f:') + '=' + (a.value || '').slice(0, 18)).join(' ').slice(0, 96),
                display: cs.display, position: cs.position,
                height: cs.height, minHeight: cs.minHeight, maxHeight: cs.maxHeight,
                flex: cs.flex, overflowY: cs.overflowY,
                rectH: Math.round(r.height),
                scrollH: el.scrollHeight, clientH: el.clientHeight,
                canScroll: el.scrollHeight > el.clientHeight + 1,
            };
        };

        // The chain from the scroller up to the document, which is where the owner must be.
        const chain = [];
        let el = scroller;
        for (let i = 0; i < 16 && el && el !== document.documentElement; i += 1) {
            chain.push(describe(el));
            el = el.parentElement;
        }

        // A REAL scroll attempt on the intended owner.
        const before = scroller.scrollTop;
        scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 300));
        const afterWheel = scroller.scrollTop;
        // And a direct programmatic scroll, which separates "cannot scroll" from "wheel intercepted".
        scroller.scrollTop = 600;
        await new Promise((r) => setTimeout(r, 300));
        const afterDirect = scroller.scrollTop;

        // Which ancestor, if any, is ACTUALLY scrollable — the real owner versus the intended one.
        const scrollableAncestors = chain.filter((c) => c.canScroll && c.overflowY !== 'visible');

        return {
            ledgerRows,
            intendedScroller: describe(scroller),
            WHEEL_MOVED: afterWheel !== before,
            DIRECT_MOVED: afterDirect !== before,
            before, afterWheel, afterDirect,
            CONTENT_EXCEEDS_VIEWPORT: scroller.scrollHeight > scroller.clientHeight + 1,
            scrollableAncestorCount: scrollableAncestors.length,
            chain,
            viewport: { w: window.innerWidth, h: window.innerHeight },
        };
    })()`);
    console.log(`[SCROLL] ${JSON.stringify(out)}`);
});
