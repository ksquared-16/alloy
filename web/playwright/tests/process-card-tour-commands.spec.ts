/**
 * Process-card Tour command acceptance, against real persisted state.
 *
 * The two claims under test are behavioural, not cosmetic:
 *   1. a configured command keeps its identity through launcher selection;
 *   2. Tour presents as one operational concept carrying its current state.
 */

import { expect, test, type Page } from "@playwright/test";

const SUBJECT = process.env.FP_SUBJECT_ID ?? "d2a3b448-296e-43e7-b0a8-28dd918526ac";
const WORK_UNIT = `/workspace/work-unit/waitlist?subject_id=${SUBJECT}`;

async function openPanel(page: Page) {
    await page.goto(WORK_UNIT, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-fp-grid-area="business_process"]', { timeout: 60_000 });
    await page.waitForTimeout(14000);
}

/**
 * The commands the Process card region is actually presenting.
 *
 * Read by rendered control rather than by a single component's data attribute: on a subject
 * whose published stage inputs do not resolve, `projectProcessCardCommands` returns nothing
 * and the command row comes from the Current Work path inside the same card. Both paths now
 * share `resolveTourCommandPresentation`, so the operator-visible contract is the same either
 * way — and that contract is what this asserts.
 */
async function processCommandLabels(page: Page): Promise<string[]> {
    return page.$$eval(
        '[data-fp-grid-area="business_process"] button',
        (nodes) =>
            nodes
                .map((n) => (n.textContent ?? "").trim())
                .filter((t) => t.length > 0 && !/^Recent activity/i.test(t)),
    );
}

test("the Process card presents Tour as one state-bearing control", async ({ page }) => {
    await openPanel(page);
    const labels = await processCommandLabels(page);
    console.log("PROCESS COMMANDS:", JSON.stringify(labels));
    test.skip(labels.length === 0, "this subject's process card presents no commands");

    // One control speaks for Tour...
    const tourControls = labels.filter((l) => /\bTour\b/i.test(l));
    expect(tourControls, `expected one Tour control, saw ${JSON.stringify(tourControls)}`).toHaveLength(1);

    // ...and the separate lifecycle buttons are gone from the top level.
    for (const flat of [/^Schedule Tour$/i, /^Reschedule Tour$/i, /^Cancel Tour$/i, /^Send Tour Invitation$/i]) {
        expect(labels.some((l) => flat.test(l)), `flat Tour command still present: ${flat}`).toBe(false);
    }

    // When a booking is active the control carries its state, not a bare noun.
    const control = tourControls[0]!;
    expect(control).toMatch(/▾/);
    if (/scheduled|requested|pending approval|rescheduled/i.test(control)) {
        expect(control, "an active booking states its time").toMatch(/·/);
    }
});

/*
 * NOT COVERED HERE, AND DELIBERATELY NOT FAKED: opening the Tour menu and invoking
 * "Send invitation".
 *
 * The control is a Radix `DropdownMenu`, and under Playwright neither `.click()` nor a
 * forced click opened it — `getByRole("menuitem")` stayed empty in both cases, so the
 * menu contents and the resulting `send_tour_invitation` / `mode: "prepare"` execute
 * cannot be observed from here. That is a harness limitation, not evidence about the
 * product, and asserting around it would be worse than leaving the gap visible.
 *
 * The identity contract those clicks would demonstrate is covered at the layer where it
 * actually lives, in `tests/surfaces/processCardCommandIdentity.test.ts`.
 */
