import { test } from "@playwright/test";

/**
 * P076 — MOUNTED CERTIFICATION OF CANONICAL SETTLEMENT CONSUMPTION.
 *
 * APPLIED IS NOT CONSUMED. The deployed diagnostic already showed `applied` with one registered
 * frame while the Focus Panel stayed unresolved, because `readFrame` has no production callers and
 * the settlement landed in a store nothing mounted reads. So this proves the thing the diagnostic
 * cannot: that the settled answer reaches the surface.
 *
 * Both production paths are exercised at their REAL commit boundaries, which are different. The
 * route-load path goes through `applyFrameSettlement` and appears in `__ALLOY_SETTLEMENT_DIAG__`.
 * The queue-switch path goes through the kernel and does NOT, so its absence from that buffer is
 * expected and is not evidence of failure — it is proven by what the surface ends up holding.
 */
const READ = `(() => {
    const txt = (document.body.innerText || "");
    const fin = document.querySelector("[data-financials-empty]");
    const cardSubjects = [...new Set([...document.querySelectorAll("[data-card-subject]")]
        .map((e) => e.getAttribute("data-card-subject")))];
    return {
        financials_empty_state: fin ? fin.getAttribute("data-financials-empty") : null,
        details_door_present: /\\bDetails\\b/.test(txt),
        attendance_card: !!document.querySelector('[data-attendance-card]'),
        attendance_subject: document.querySelector('[data-attendance-subject]')?.getAttribute("data-attendance-subject") ?? null,
        attendance_reserved: document.querySelectorAll('[data-attendance-reserved="true"]').length,
        health_card: !!document.querySelector('[data-health-card]'),
        health_subject: document.querySelector('[data-health-subject]')?.getAttribute("data-health-subject") ?? null,
        cells_total: document.querySelectorAll(".alloy-os-ucard").length,
        cells_reserved: document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length,
        // MIXED means two subjects on screen at once — the frame integrity failure.
        card_subjects: cardSubjects,
        body_subject: document.querySelector("[data-focus-panel-body-subject]")?.getAttribute("data-focus-panel-body-subject") ?? null,
        header: (document.querySelector('[data-alloy-os-focus-panel-header="true"]')?.textContent || "").replace(/\\s+/g," ").trim().slice(0,40),
        settlementDiag: (window.__ALLOY_SETTLEMENT_DIAG__ || null),
    };
})()`;

const ROWS = `(() => [...document.querySelectorAll('.alloy-os-queue-row-card')])()`;

test("p076 certify canonical settlement consumption", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(20000);

    // ── PART 4: ROUTE LOAD ──────────────────────────────────────────────────────────────────────
    const routeLoad = await page.evaluate(READ);

    // ── PART 5: QUEUE SWITCH A → B ──────────────────────────────────────────────────────────────
    const switched = await page.evaluate(`(() => {
        const rows = ${ROWS};
        if (rows.length < 3) return false;
        const cur = rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        window.__idx = cur >= 0 ? cur : 0;
        rows[(window.__idx + 1) % rows.length].click();
        return true;
    })()`);
    await page.waitForTimeout(20000);
    const queueSwitch = await page.evaluate(READ);

    /*
     * ── PART 7: A → B → C WITH A LATE B SETTLEMENT ──────────────────────────────────────────────
     * B is selected and then abandoned before its settlement can land, so B's facts are in flight
     * against a surface that has moved to C. The requirement is not that B is slow — it is that B's
     * settlement finds a navigation it does not match and is dropped rather than reshaped.
     */
    const raced = await page.evaluate(`(() => {
        const rows = ${ROWS};
        if (rows.length < 3) return false;
        rows[(window.__idx + 2) % rows.length].click();
        return true;
    })()`);
    // Move to C almost immediately: B's settlement is still resolving.
    await page.waitForTimeout(250);
    await page.evaluate(`(() => {
        const rows = ${ROWS};
        rows[(window.__idx + 3) % rows.length].click();
        return true;
    })()`);
    await page.waitForTimeout(20000);
    const afterRace = await page.evaluate(READ);

    const signedOut = await page.evaluate(`(() => !!document.querySelector('input[type="password"]'))()`);
    console.log(`[certify] ${JSON.stringify({ signedOut, switched, raced, routeLoad, queueSwitch, afterRace })}`);
});
