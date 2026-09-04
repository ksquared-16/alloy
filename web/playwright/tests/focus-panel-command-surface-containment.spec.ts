/**
 * Focus Panel command-surface containment, measured in a real browser.
 *
 * Geometry and stacking are the claims here, and neither survives a JSDOM stand-in: the defect
 * this guards was a cell whose `opacity`/`filter` opened a stacking context, which only a real
 * layout engine reports. `elementFromPoint` over the middle of the command surface is the
 * assertion that matters — it returned the depth scrim, which is what "the command opened
 * behind its own backdrop, greyed out" is in DOM terms.
 *
 * Skips rather than fails when the subject presents no Tour command: this asserts the HOST, and
 * a tenant fixture without that command has nothing to say about it.
 */

import { expect, test, type Page } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

const SUBJECT = process.env.FP_SUBJECT_ID ?? "d2a3b448-296e-43e7-b0a8-28dd918526ac";
const WORK_UNIT = `/workspace/work-unit/waitlist?subject_id=${SUBJECT}`;
/** The card lands 22px below the canvas top; allow that much slack at either edge. */
const EDGE_TOLERANCE_PX = 24;

const MEASURE = `(() => {
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
    const grid = document.querySelector('[data-focus-panel-card-grid="true"]');
    let scroller = grid ? grid.parentElement : null;
    while (scroller) { const st = getComputedStyle(scroller);
        if (st.overflowY === 'auto' || st.overflowY === 'scroll') break; scroller = scroller.parentElement; }
    const cell = document.querySelector('[data-fp-elevated="true"]');
    const card = cell ? cell.querySelector('.alloy-os-ucard') : null;
    const scrim = document.querySelector('[data-fp-depth-scrim="true"]');
    const surface = document.querySelector('[data-work-action-surface="communications_composer"]');
    // The PRIMARY command action, not merely the lowest button: the body scrolls, so a control
    // inside it can sit lower than the footer without the footer being lost.
    let footer = null;
    if (card) { const send = Array.from(card.querySelectorAll('button'))
        .find((b) => b.offsetParent !== null && /^send$/i.test((b.textContent || '').trim()));
        footer = send ? rect(send) : null; }
    const innerScrollers = [];
    if (card) for (const n of Array.from(card.querySelectorAll('*'))) { const st = getComputedStyle(n);
        if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 2)
            innerScrollers.push({ scrollH: n.scrollHeight, clientH: n.clientHeight }); }
    let onTop = null;
    if (surface) { const r = surface.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2);
        const y = Math.round(Math.max(2, Math.min(r.top + r.height / 2, window.innerHeight - 5)));
        const el = document.elementFromPoint(x, y);
        onTop = { isScrim: el ? el.getAttribute('data-fp-depth-scrim') === 'true' : null,
                  insideCard: card ? card.contains(el) : false }; }
    const cellStyle = cell ? getComputedStyle(cell) : null;
    return {
        raisedKey: grid ? grid.getAttribute('data-fp-elevated-key') : null,
        requestedKey: grid ? grid.getAttribute('data-fp-elevated-requested') : null,
        surfaceMounted: !!surface,
        panel: rect(scroller), card: rect(card), footer, onTop, innerScrollers,
        cardZ: card ? Number(getComputedStyle(card).zIndex) : null,
        scrimZ: scrim ? Number(getComputedStyle(scrim).zIndex) : null,
        cellOpacity: cellStyle ? cellStyle.opacity : null,
        cellFilter: cellStyle ? cellStyle.filter : null,
        pageScrollable: document.scrollingElement.scrollHeight > window.innerHeight + 2,
    };
})`;

async function openSendTourInvitation(page: Page): Promise<boolean> {
    await page.goto(WORK_UNIT, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-fp-grid-area="business_process"]', { timeout: 120_000 });
    // The command row is projected after the card settles; count only once it has had the chance.
    await page
        .waitForSelector('[data-fp-grid-area="business_process"] [data-process-action-group="tour"]', {
            timeout: 120_000,
        })
        .catch(() => {});
    await page.waitForTimeout(2500);
    const tour = page.locator('[data-fp-grid-area="business_process"] [data-process-action-group="tour"]').first();
    if ((await tour.count()) === 0) return false;
    await tour.click({ force: true });
    await page.waitForTimeout(900);
    const invite = page.locator('[data-process-action="send_tour_invitation"]').first();
    if ((await invite.count()) === 0) return false;
    await invite.click({ force: true });
    await page
        .waitForSelector('[data-work-action-surface="communications_composer"]', { timeout: 120_000 })
        .catch(() => {});
    await page.waitForTimeout(7000);
    return true;
}

/**
 * `maxScrollRegions` — how many scrolling regions the command surface may own at this size.
 *
 * At a normal desktop height there is exactly one, and it is the right one: the message body,
 * which is the only part that grows without bound as the operator types.
 *
 * At 720px the composer's own fixed chrome — recipients, channel, subject, toolbar, sticky
 * footer — measures ~340px against ~240px of column, so the column scrolls too however small the
 * body gets. That second region is the composer's shape, not the host's, and removing it means
 * redesigning the composer. Two is therefore admissible HERE and nowhere else; a third region, or
 * a page-level scroll, is the nesting this contract exists to catch.
 */
for (const vp of [
    { name: "normal desktop", width: 1680, height: 1050, maxScrollRegions: 1 },
    { name: "short desktop", width: 1680, height: 720, maxScrollRegions: 2 },
]) {
    test(`Send Tour Invitation is contained by the Focus Panel at ${vp.name}`, async ({ page }) => {
        test.setTimeout(600_000);
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

        await ensureAdminPlaywrightSession(page);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const opened = await openSendTourInvitation(page);
        test.skip(!opened, "this subject's Process card presents no Tour invitation command");

        const m = (await page.evaluate(`${MEASURE}()`)) as Record<string, never> & Record<string, any>;
        console.log(`COMMAND SURFACE @ ${vp.name}:`, JSON.stringify(m));

        expect(m.surfaceMounted, "the composer never mounted").toBe(true);

        // ── The command is raised, so the scrim has something to be behind ──
        expect(m.raisedKey, "depth activated with nothing raised").toBeTruthy();
        expect(m.cellOpacity, "the raised cell must not be receded").toBe("1");
        expect(m.cellFilter, "a filter on the raised cell would trap it below the scrim").toBe("none");

        // ── Layering: above its own backdrop, and hit-testable ──────────────
        expect(m.cardZ).toBeGreaterThan(m.scrimZ);
        expect(m.onTop?.isScrim, "the command surface is painted UNDER the depth scrim").toBe(false);
        expect(m.onTop?.insideCard, "the topmost element over the composer is outside the card").toBe(true);

        // ── Containment: inside the visible Focus Panel work region ─────────
        expect(m.card.top).toBeGreaterThanOrEqual(m.panel.top - EDGE_TOLERANCE_PX);
        expect(m.card.bottom).toBeLessThanOrEqual(m.panel.bottom + EDGE_TOLERANCE_PX);
        expect(m.footer, "the command surface showed no Send control").not.toBeNull();
        // Inside its own card — `overflow: hidden` means anything past this edge is CLIPPED,
        // which is how a viewport-sized cap lost the Send button on a 760px-tall window.
        expect(m.footer.bottom, "the Send control is clipped by its own card").toBeLessThanOrEqual(
            m.card.bottom,
        );
        expect(m.footer.bottom, "the Send control fell below the visible panel").toBeLessThanOrEqual(
            m.panel.bottom,
        );

        // ── Scroll: one intentional region, and never the page ──────────────
        expect(m.pageScrollable, "the command surface forced a page-level scroll").toBe(false);
        expect(
            m.innerScrollers.length,
            `more scrolling regions than this size admits: ${JSON.stringify(m.innerScrollers)}`,
        ).toBeLessThanOrEqual(vp.maxScrollRegions);

        // ── Escape returns to the Process card ──────────────────────────────
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1200);
        const closed = (await page.evaluate(`${MEASURE}()`)) as Record<string, any>;
        expect(closed.raisedKey, "the command surface did not close").toBeNull();
        expect(
            await page.locator('[data-fp-grid-area="business_process"] [data-process-action-group="tour"]').count(),
        ).toBeGreaterThan(0);

        // The Radix stabilization this surface depends on must stay intact.
        const loops = errors.filter((e) => /Maximum update depth/i.test(e));
        expect(loops, `render loop reported: ${JSON.stringify(loops)}`).toEqual([]);
    });
}
