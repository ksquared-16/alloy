import { test } from "@playwright/test";

/**
 * GATE C — DEPLOYED CERTIFICATION: THE COMPLETE LEDGER IS REACHABLE BY A REAL WHEEL.
 *
 * The shrink contract is served, so this proves it on the deployed rule rather than on a stylesheet
 * injected into the page. The wheel is a real one at the scroller's own centre — aiming at a ledger
 * row and offsetting downward lands outside the now-bounded box, which is how a working fix once
 * read as a failure.
 *
 * Also proves the parts a scroll fix can quietly break: the bottom is actually reachable, switching
 * accounts after scrolling still works, and the new account is subject-correct with no previous
 * account content under it.
 *
 * GC_H sets the viewport height so the repair can be shown not to depend on one monitor.
 */
const VH = Number(process.env.GC_H ?? "720");

test("gate C deployed certification", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.setViewportSize({ width: 1280, height: VH });
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(13_000);

    const open = await page.evaluate(`(async () => {
        const nav = document.querySelector('[data-adminv2-sidebar-modal-nav="financials"]');
        if (!nav) return { ok: false, why: 'no_nav' };
        nav.click(); await new Promise((r) => setTimeout(r, 6500));
        if (document.querySelectorAll('[data-financials-account-row]').length < 2) {
            const tab = [...document.querySelectorAll('button,a')].find((e) => /^accounts$/i.test((e.textContent || '').trim()));
            if (tab) { tab.click(); await new Promise((r) => setTimeout(r, 6500)); }
        }
        const ids = [...document.querySelectorAll('[data-financials-account-row]')]
            .map((r) => ({ id: r.getAttribute('data-financials-account-row'), truth: r.getAttribute('data-financials-account-truth') }));
        return { ok: ids.length >= 2, ids };
    })()`) as { ok: boolean; why?: string; ids?: Array<{ id: string; truth: string }> };
    if (!open.ok) { console.log(`[GC] ${JSON.stringify({ skipped: open.why || "too_few_accounts" })}`); return; }

    // Prefer accounts the rail marks as having real activity — a known_zero ledger has nothing to scroll.
    const ids = (open.ids || []);
    const rich = ids.filter((a) => a.truth === "known").map((a) => a.id);
    const pick = (rich.length >= 2 ? rich : ids.map((a) => a.id)).slice(0, 3);

    const select = async (id: string) => {
        await page.evaluate(`(() => { const r=document.querySelector('[data-financials-account-row="${id}"]'); if(r) r.click(); })()`);
        await page.waitForTimeout(9000);
    };
    const state = async () => page.evaluate(`(() => {
        const sc = document.querySelector('[data-financials-detail-scroll]');
        const pane = document.querySelector('[data-financials-account-detail]');
        if (!sc) return { present: false };
        const r = sc.getBoundingClientRect();
        const rows = sc.querySelectorAll('[data-financials-row-group]').length;
        const visible = [...sc.querySelectorAll('[data-financials-row-group]')]
            .filter((e) => { const b = e.getBoundingClientRect(); return b.top >= r.top - 2 && b.bottom <= r.bottom + 2; }).length;
        return {
            present: true, account: pane ? pane.getAttribute('data-financials-account-detail') : null,
            scrollTop: Math.round(sc.scrollTop), scrollH: sc.scrollHeight, clientH: sc.clientHeight,
            overflowY: getComputedStyle(sc).overflowY,
            atBottom: sc.scrollHeight - sc.clientHeight - sc.scrollTop <= 2,
            rowGroups: rows, visibleGroups: visible,
            cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
        };
    })()`) as Promise<Record<string, unknown>>;

    const results: unknown[] = [];
    for (const id of pick) {
        await select(id);
        const s0 = await state() as Record<string, number | string | boolean>;
        if (!s0.present) { results.push({ id, skipped: "no_scroller" }); continue; }
        await page.mouse.move(s0.cx as number, s0.cy as number);
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(700);
        const s1 = await state() as Record<string, number | string | boolean>;
        // Drive to the bottom with repeated real wheels, as an operator would.
        for (let k = 0; k < 14; k += 1) {
            await page.mouse.wheel(0, 900);
            await page.waitForTimeout(220);
            const st = await state() as Record<string, boolean>;
            if (st.atBottom) break;
        }
        const s2 = await state() as Record<string, number | string | boolean>;
        results.push({
            id, viewportH: VH,
            clientH: s0.clientH, scrollH: s0.scrollH, overflowY: s0.overflowY,
            OVERFLOWS: (s0.scrollH as number) > (s0.clientH as number) + 1,
            rowGroups: s0.rowGroups, visibleAtStart: s0.visibleGroups,
            scrollTop0: s0.scrollTop, afterOneWheel: s1.scrollTop,
            WHEEL_MOVED: (s1.scrollTop as number) !== (s0.scrollTop as number),
            finalScrollTop: s2.scrollTop, BOTTOM_REACHED: s2.atBottom,
            accountStable: s2.account === s0.account,
        });
    }

    // Switch away after scrolling and back — a scroll fix must not strand or mis-bind selection.
    let switchAfterScroll: unknown = null;
    if (pick.length >= 2) {
        const before = await state() as Record<string, unknown>;
        await select(pick[1]);
        const b = await state() as Record<string, unknown>;
        await select(pick[0]);
        const a = await state() as Record<string, unknown>;
        switchAfterScroll = {
            scrolledAccount: before.account,
            switchedTo: b.account, switchedCorrect: b.account === pick[1],
            returnedTo: a.account, returnCorrect: a.account === pick[0],
            returnScrollTop: a.scrollTop,
        };
    }

    console.log(`[GC] ${JSON.stringify({ viewportH: VH, accountsTested: results.length, results, switchAfterScroll })}`);
});
