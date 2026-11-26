import { test } from "@playwright/test";

/**
 * GATE R — WHY DOES A WORK VIEW PILL THROW THE OPERATOR TO /workspace?
 *
 * The reliability session recorded six FULL DOCUMENT navigations, none of them the probe's doing,
 * each landing on /workspace with the Work Unit gone. That is the operator's "random refresh".
 *
 * Before calling it a defect I have to know what the resolver INTENDED. `resolveSelectWorkViewAction`
 * legitimately returns `navigate` for a view hosted on a different Work Unit, and that is a surface
 * movement, not a reset. The production trace `__ALLOY_WV_CLICK_TRACE__` records the resolved
 * actionKind, so the question is answerable directly rather than by inference:
 *
 *   actionKind 'in-page'  a LENS move — must never leave the Work Unit. A full navigation is a defect.
 *   actionKind 'navigate' intended surface movement — but the destination must be the TARGET,
 *                         not /workspace with no rows.
 *
 * Either way, landing on the workspace landing page loses the operator's place.
 */
test("gate R pill navigation", async ({ page }) => {
    test.setTimeout(900_000);
    await page.addInitScript(`(() => { window.__tok = Math.random().toString(36).slice(2); })()`);
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(11_000);

    const units = await page.evaluate(`(() => { const s={}; return [...document.querySelectorAll('a[href*="/workspace/work-unit/"]')].map((a)=>a.getAttribute('href')).filter((h)=>h&&!s[h]&&(s[h]=1)).slice(0,4); })()`) as string[];
    const out: unknown[] = [];

    for (const href of units) {
        await page.goto(href, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(10_000);
        const before = await page.evaluate(`(() => ({
            tok: window.__tok,
            url: location.pathname + location.search,
            pills: [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].map((e) => ({ id: e.getAttribute('data-work-view-id'), label: (e.textContent||'').trim().slice(0,18), sel: e.getAttribute('aria-selected')==='true' })),
            rows: document.querySelectorAll('.alloy-os-queue-row-card').length,
            traceLen: (window.__ALLOY_WV_CLICK_TRACE__ || []).length,
        }))()`) as { tok: string; url: string; pills: Array<{ id: string; label: string; sel: boolean }>; rows: number; traceLen: number };

        if (before.pills.length < 2) { out.push({ href, skipped: "too_few_pills", pills: before.pills.length }); continue; }
        const target = before.pills.find((p) => !p.sel) || before.pills[1];

        await page.evaluate(`((id) => { const p=[...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e)=>e.getAttribute('data-work-view-id')===id); if(p) p.click(); })(${JSON.stringify(target.id)})`);
        await page.waitForTimeout(8000);

        let after: Record<string, unknown>;
        try {
            after = await page.evaluate(`(() => ({
                tok: window.__tok,
                url: location.pathname + location.search,
                rows: document.querySelectorAll('.alloy-os-queue-row-card').length,
                pills: document.querySelectorAll('button[role="tab"][data-work-view-id]').length,
                trace: (window.__ALLOY_WV_CLICK_TRACE__ || []).slice(-3).map((x) => ({ intent: x.intentWorkViewId, kind: x.actionKind, noop: x.noop, current: x.currentWorkViewId, unit: x.currentWorkUnitId, href: x.href, lensIds: Array.isArray(x.surfaceLensIds) ? x.surfaceLensIds.length : null })),
            }))()`) as Record<string, unknown>;
        } catch (e) { after = { unreadable: String(e).slice(0, 60) }; }

        const fullNav = after.tok !== undefined && after.tok !== before.tok;
        out.push({
            href,
            clickedPill: target.id, clickedLabel: target.label,
            pillsBefore: before.pills.length, rowsBefore: before.rows,
            urlBefore: before.url, urlAfter: after.url,
            rowsAfter: after.rows, pillsAfter: after.pills,
            FULL_DOCUMENT_NAVIGATION: fullNav,
            LANDED_ON_WORKSPACE: String(after.url || "").startsWith("/workspace") && !String(after.url || "").includes("work-unit"),
            // The trace survives only a client navigation; a full nav wipes it, which is itself a tell.
            traceAfter: after.trace ?? "WIPED_BY_FULL_NAV",
        });
    }
    console.log(`[PILLNAV] ${JSON.stringify({ units: units.length, out })}`);
});
