import { test } from "@playwright/test";

/**
 * P076 MOUNTED PROOF — DID THE SETTLEMENT ACTUALLY REACH THE FOCUS PANEL?
 *
 * The deterministic tests prove the lifecycle accepts a settlement addressed with the REQUESTED
 * lens. They cannot prove the deployed page addresses it that way, because the composer needs a
 * database. This reads the only thing that settles it: what the operator's Focus Panel shows.
 *
 * `applyFrameSettlement`'s outcome is discarded by `ProvisioningSettlementSeed` and recorded
 * nowhere observable, so `no_frame` cannot be read directly off the deployed build. It does not
 * need to be. The capability cards are the settlement's payload and have no other source: Financials
 * can only leave `data-financials-empty="loading"` if the patch was applied. So the card states ARE
 * the settlement outcome, and a Financials card still reading `loading` after quiescence is the
 * defect reproducing.
 *
 * Navigation is ordinary and visible — the operator's own route — because the defect is specific to
 * the lens the URL carries, and constructing a URL by hand is exactly how a test can accidentally
 * supply the explicit lens that hides it.
 */
test("p076 mounted settlement proof", async ({ page }) => {
    test.setTimeout(240_000);

    // No ?work_view_id: this is the defective path, where the slug implies the view.
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(15000);

    /*
     * TWO PATHS, AND ONLY ONE OF THEM IS WHAT #1250 REPAIRS.
     *
     * The frame is registered by the ROUTE SEGMENT (page.tsx) and settled by its Suspense boundary,
     * so the lens identity defect belongs to ROUTE LOAD. A queue-row switch moves attention without
     * re-rendering the route, so it never registers a new frame and its settlement travels a
     * different path entirely. Measuring only the click would answer the wrong question about this
     * repair — so the route-load state is captured BEFORE any click.
     */
    const readState = () => {
        const txt = (document.body.innerText || "");
        const fin = document.querySelector("[data-financials-empty]");
        return {
            financials_empty_state: fin ? fin.getAttribute("data-financials-empty") : null,
            financials_still_loading: fin?.getAttribute("data-financials-empty") === "loading",
            details_door_present: /\bDetails\b/.test(txt),
            attendance_card: !!document.querySelector('[data-attendance-card]'),
            attendance_subject: document.querySelector('[data-attendance-subject]')?.getAttribute("data-attendance-subject") ?? null,
            health_card: !!document.querySelector('[data-health-card]'),
            health_subject: document.querySelector('[data-health-subject]')?.getAttribute("data-health-subject") ?? null,
            cells_total: document.querySelectorAll(".alloy-os-ucard").length,
            cells_reserved: document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length,
            card_subject: document.querySelector("[data-card-subject]")?.getAttribute("data-card-subject") ?? null,
        };
    };
    const onRouteLoad = await page.evaluate(`(${readState.toString()})()`);

    // Select a record through the visible queue, as an operator would.
    await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 2) return false;
        const cur = rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        rows[cur>=0?(cur+1)%rows.length:1].click();
        return true;
    })()`);
    // Generous: the question is whether the settlement EVER arrives, not how fast.
    await page.waitForTimeout(20000);

    const out = await page.evaluate(() => {
        const txt = (document.body.innerText || "");
        const fin = document.querySelector("[data-financials-empty]");
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            // FINANCIALS — "loading" is the defect; absent or any settled state is the repair.
            financials_empty_state: fin ? fin.getAttribute("data-financials-empty") : null,
            financials_card_present: !!document.querySelector(".alloy-os-financials, [data-financials-empty]"),
            financials_still_loading: fin?.getAttribute("data-financials-empty") === "loading",
            details_door_present: /\bDetails\b/.test(txt),
            // ATTENDANCE / HEALTH — reserved means the cell is still honestly UNKNOWN.
            attendance_card: !!document.querySelector('[data-attendance-card]'),
            attendance_reserved: document.querySelectorAll('[data-attendance-reserved="true"]').length,
            attendance_subject: document.querySelector('[data-attendance-subject]')?.getAttribute("data-attendance-subject") ?? null,
            health_card: !!document.querySelector('[data-health-card]'),
            health_subject: document.querySelector('[data-health-subject]')?.getAttribute("data-health-subject") ?? null,
            // Whole-panel geometry, for context on what else settled.
            cells_total: document.querySelectorAll(".alloy-os-ucard").length,
            cells_reserved: document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length,
            card_subject: document.querySelector("[data-card-subject]")?.getAttribute("data-card-subject") ?? null,
            /*
             * THE DIRECT SETTLEMENT OUTCOME. No inference: this is what applyFrameSettlement actually
             * returned, with how many frames were registered when it arrived. no_frame with zero
             * frames and no_frame with registered frames are different defects with different owners.
             */
            settlementDiag: (window as unknown as { __ALLOY_SETTLEMENT_DIAG__?: unknown[] })
                .__ALLOY_SETTLEMENT_DIAG__ ?? null,
        };
    });
    console.log(`[mounted] ${JSON.stringify({ routeLoad: onRouteLoad, afterClick: out })}`);
});
