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
 * Read by rendered control. `data-process-action` / `data-process-action-group` mark each one
 * as having come from `projectProcessCardCommands`, so provenance is checkable from the DOM
 * rather than asserted — see `processCommandProvenance` below.
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

/** The projected commands, with the attribute that says where each one came from. */
async function processCommandProvenance(page: Page) {
    return page.$$eval(
        '[data-fp-grid-area="business_process"] .alloy-os-process__work-actions button',
        (nodes) =>
            nodes.map((n) => ({
                label: (n.textContent ?? "").trim(),
                action: n.getAttribute("data-process-action"),
                group: n.getAttribute("data-process-action-group"),
                haspopup: n.getAttribute("aria-haspopup"),
            })),
    );
}

test("the visible commands are the Process card's projected commands", async ({ page }) => {
    await openPanel(page);
    const rows = await processCommandProvenance(page);
    console.log("PROCESS COMMAND PROVENANCE:", JSON.stringify(rows));
    test.skip(rows.length === 0, "this subject's process card presents no commands");

    // Every control on the process card's action row is a projected command, not a
    // neighbouring surface's button that happens to render beside them.
    for (const row of rows) {
        expect(
            row.action ?? row.group,
            `no projected-command identity on "${row.label}"`,
        ).toBeTruthy();
    }

    // The Tour control is the GROUP, and it declares itself a menu trigger.
    const tour = rows.find((r) => r.group === "tour");
    expect(tour, `no grouped Tour control in ${JSON.stringify(rows)}`).toBeTruthy();
    expect(tour!.haspopup, "the Tour control must be a real menu trigger").toBe("menu");
});

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
 * NOT COVERED HERE: opening the Tour menu and invoking "Send invitation".
 *
 * The trigger is real now — it carries `aria-haspopup="menu"` and Radix's handlers, which the
 * test above asserts — and pressing Enter on it DOES open the menu. What follows is a
 * pre-existing defect: mounting any Radix overlay inside a Focus Panel card throws
 * "Maximum update depth exceeded", and the card drops to its render boundary.
 *
 * It is not this branch's. The same loop reproduces on `Recent activity ▾` in this very card
 * and on `Manage ▾` outside the Focus Panel entirely — both unchanged in `staging`, both
 * untouched here. A control that could never open was hiding it.
 *
 * Asserting around that would certify a crash as a pass, so the gap stays visible. The identity
 * contract those clicks would demonstrate is covered where it lives, in
 * `tests/surfaces/processCardCommandIdentity.test.ts`.
 */
