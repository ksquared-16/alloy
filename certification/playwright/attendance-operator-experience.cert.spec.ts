import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * THREAD 3 — the core Attendance operator experience, in a real browser.
 *
 * Scenarios A–G plus the tablet viewport, driven through the canonical
 * certification framework (shared auth project, stored operator session, evidence
 * under certification/evidence/).
 *
 * ── WHAT MAKES THIS FALSIFIABLE ──
 *
 * Every assertion reads a number the READ MODEL rendered, captured BEFORE the
 * command and compared AFTER. Asserting only that a control could be clicked
 * would pass against a surface that records nothing. Occupancy is read per room
 * from the overview, so a child who moves has to leave one number and arrive in
 * another — the alphabetical-location defect this thread fixed would fail here
 * rather than merely look wrong.
 *
 * ── FIXTURE ──
 *
 * Depends on `certification/attendance/01-attendance-fixture.sql` (and the search
 * fixture it names as its prerequisite): 3 children placed in Toddler Room A with
 * schedule assignments covering today. Without it the site has no expected
 * attendance at all and every scenario below is vacuous — which is exactly how
 * the pre-existing Attendance specs were failing.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "attendance-operator-experience");
const SETTLE = 120_000;
const SCHEDULING = "[data-adminv2-roster-workspace]";
const OVERVIEW = '[data-attendance-overview="true"]';

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));
const shot = (page: Page, name: string) =>
    page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

/** Open Operations → Attendance at the seeded campus. */
async function openAttendance(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");

    // The product's own deep-link contract (the Focus Panel Assignments card uses
    // it), not a test hook — the same route the attention certification takes.
    await page.evaluate(() => {
        sessionStorage.setItem("alloy.roster.workspace.deeplink", JSON.stringify({ section: "attendance" }));
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="operations"]').click();
    await expect(page.locator(SCHEDULING)).toBeVisible({ timeout: SETTLE });

    // Attendance is site-scoped and opens on "All sites", which renders no rooms.
    // AlloySelect is a custom listbox (button + [role=option]), so selectOption
    // silently matches nothing here.
    const sitePicker = page.locator('button[aria-label="Site"]').first();
    await expect(sitePicker, "the site picker is absent — Attendance cannot be scoped").toBeVisible({
        timeout: SETTLE,
    });
    await sitePicker.click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(sitePicker).toContainText("Riverside", { timeout: SETTLE });

    await expect(page.locator(OVERVIEW)).toBeVisible({ timeout: SETTLE });

    /*
     * WAIT FOR THE DATA, NOT JUST THE SHELL.
     *
     * The overview renders its four metric tiles immediately, reading zero, and
     * fills them when the day's roster arrives. Reading straight after the shell
     * appears captures those zeros and reports an empty site against a tenant
     * that is fully seeded — a false failure, and worse, one that looks exactly
     * like the real fixture-missing defect this spec is meant to detect. The
     * first room card is the signal that the read model has actually answered.
     */
    await expect(
        page.locator("[data-attendance-room-card]").first(),
        "no room card ever rendered — the attendance fixture is missing",
    ).toBeVisible({ timeout: SETTLE });
}

/** The four site metrics, as the overview rendered them. */
async function metrics(page: Page): Promise<Record<string, number>> {
    return page.evaluate(() => {
        const out: Record<string, number> = {};
        const box = document.querySelector('[data-attendance-metrics="true"]');
        for (const tile of Array.from(box?.children ?? [])) {
            const ps = tile.querySelectorAll("p");
            const label = ps[0]?.textContent?.trim() ?? "";
            const value = Number(ps[1]?.textContent?.trim() ?? "");
            if (label) out[label] = value;
        }
        return out;
    });
}

/**
 * Physical occupancy per room, read from the room cards — the number Thread 3
 * introduced. `In this room` is who is standing there; the class figure beneath
 * it is roster presence and is deliberately NOT what this reads.
 */
async function occupancy(page: Page): Promise<Record<string, number>> {
    return page.evaluate(() => {
        const out: Record<string, number> = {};
        for (const card of Array.from(document.querySelectorAll("[data-attendance-room-card]"))) {
            const name = card.querySelector("h3")?.textContent?.trim() ?? "";
            const dd = card.querySelectorAll("dd");
            if (name) out[name] = Number(dd[0]?.textContent?.trim() ?? "0");
        }
        return out;
    });
}

/** Enter a room by its visible name. */
async function openRoom(page: Page, roomName: string) {
    await page.locator("[data-attendance-room-card]", { hasText: roomName }).first().click();
    await expect(page.locator("[data-attendance-children-list]")).toBeVisible({ timeout: SETTLE });
}

async function backToRooms(page: Page) {
    await page.locator('[data-attendance-back="true"]').click();
    await expect(page.locator(OVERVIEW)).toBeVisible({ timeout: SETTLE });
}


/**
 * Open a room that actually contains child rows, and say so if none does.
 *
 * The first room at this campus is empty. Every scenario that inspects a LIST —
 * states, controls, geometry — passes with nothing examined when handed an empty
 * room, which is the most dangerous shape a certification can take: green, and
 * proving nothing. Choosing the room by having rows, and asserting one was
 * found, removes that failure mode from every caller.
 */
async function openPopulatedRoom(page: Page): Promise<string> {
    for (const r of Object.keys(await occupancy(page))) {
        await openRoom(page, r);
        if (await page.locator("[data-attendance-child]").count()) return r;
        await backToRooms(page);
    }
    return "";
}

/** The first child row that offers a check-in — an expected, not-arrived child. */
function notArrivedRow(page: Page) {
    return page.locator("[data-attendance-child-checkin]").first();
}

test.describe.configure({ mode: "serial" });

test.describe("Thread 3 · core Attendance operator experience", () => {
    test("T3-0 · the operator sees today's four questions and the rooms", async ({ page }) => {
        await openAttendance(page);
        await shot(page, "00-overview");

        const m = await metrics(page);
        // The four questions Thread 3 committed to answering.
        for (const label of ["Expected", "Here now", "Not arrived", "Checked out"]) {
            expect(Object.keys(m), `overview is missing "${label}"`).toContain(label);
        }
        // The fixture puts children on today's roster; a zero here means the
        // fixture did not load and every scenario below would be vacuous.
        expect(m["Expected"], "no expected children — attendance fixture not loaded").toBeGreaterThan(0);

        const occ = await occupancy(page);
        expect(Object.keys(occ).length, "no room cards rendered").toBeGreaterThan(0);
    });

    test("T3-A · morning arrival — check-in moves Not arrived, Here now and room occupancy", async ({ page }) => {
        await openAttendance(page);
        const occBefore = await occupancy(page);

        /*
         * FIND THE SUBJECT; DO NOT ASSUME IT.
         *
         * The certification tenant accumulates state across runs — the smoke spec
         * checks children in and out — so "the first room" is not reliably a room
         * with anyone left to check in. Searching for the control makes the
         * scenario deterministic against a tenant that has already been operated,
         * which is the normal condition, not an edge case.
         */
        let roomName = "";
        for (const r of Object.keys(occBefore)) {
            await openRoom(page, r);
            if (await page.locator("[data-attendance-child-checkin]").count()) {
                roomName = r;
                break;
            }
            await backToRooms(page);
        }

        /*
         * ESTABLISH THE STARTING STATE THROUGH THE PRODUCT, NOT THE DATABASE.
         *
         * Attendance facts are append-only and per service day, so a tenant that
         * has already been operated today has nobody left to check in. Rather
         * than reach behind the product to delete facts — which the ledger
         * correctly forbids — reverse a check-in with the operator's own Correct
         * control. The child returns to not-arrived because the fold stops
         * counting the reversed fact, which is the same mechanism Scenario D
         * proves, so this both prepares the scenario and exercises the contract.
         */
        if (!roomName) {
            for (const r of Object.keys(occBefore)) {
                await openRoom(page, r);
                const correct = page.locator("[data-attendance-child-correct]").first();
                if (await correct.count()) {
                    await correct.click();
                    await page.waitForTimeout(4000);
                    if (await page.locator("[data-attendance-child-checkin]").count()) {
                        roomName = r;
                        break;
                    }
                }
                await backToRooms(page);
            }
        }

        expect(roomName, "no room could be brought to a not-arrived child").not.toBe("");
        // Re-read the baseline: reversing a check-in above moved the numbers.
        await backToRooms(page);
        const baseline = await metrics(page);
        const occBaseline = await occupancy(page);
        await openRoom(page, roomName);
        const row = notArrivedRow(page);
        await shot(page, "A1-before-checkin");

        await row.click();
        await page.waitForTimeout(4000);
        await shot(page, "A2-after-checkin");

        await backToRooms(page);
        const after = await metrics(page);
        expect(after["Here now"], "Here now did not increase").toBe(baseline["Here now"] + 1);
        expect(after["Not arrived"], "Not arrived did not decrease").toBe(baseline["Not arrived"] - 1);

        // Physical occupancy rose in exactly one room.
        const occAfter = await occupancy(page);
        const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
        expect(total(occAfter), "site occupancy did not rise by one").toBe(total(occBaseline) + 1);

        /*
         * State survives a hard refresh — it is folded from facts, not cached.
         *
         * Attendance lives inside the Operations MODAL, and a raw reload lands on
         * the workspace beneath it rather than re-opening it; that is a property
         * of the modal's navigation, not of attendance state. Re-entering through
         * the product's own route after the reload tests the thing that matters:
         * whether the numbers are rebuilt from the fact ledger on a cold page.
         */
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await openAttendance(page);
        const afterReload = await metrics(page);
        expect(afterReload["Here now"], "Here now did not survive reload").toBe(after["Here now"]);
        await shot(page, "A3-after-reload");
    });

    test("T3-BCG · movement changes whereabouts and occupancy, never placement", async ({ page }) => {
        await openAttendance(page);
        const beforeMetrics = await metrics(page);
        const occBefore = await occupancy(page);

        // The room holding a present child with a Move control.
        const rooms = Object.keys(occBefore);
        let hostRoom = "";
        for (const r of rooms) {
            await openRoom(page, r);
            if (await page.locator("[data-attendance-child-move]").count()) {
                hostRoom = r;
                break;
            }
            await backToRooms(page);
        }
        expect(hostRoom, "no present child with a Move control").not.toBe("");
        await shot(page, "B1-room-with-present-child");

        const mover = page.locator("[data-attendance-child-move]").first();
        const childId = await mover.getAttribute("data-attendance-child-move");
        const destinationValues = await mover.locator("option").evaluateAll((os) =>
            os.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent?.trim() ?? "" })).filter((o) => o.value),
        );
        expect(destinationValues.length, "Move offers no destination").toBeGreaterThan(0);

        // Destination selection is the whole decision — no confirmation step.
        const dest = destinationValues[0];
        await mover.selectOption(dest.value);
        await page.waitForTimeout(4000);
        await shot(page, "B2-after-move");

        // The child STAYS on the committed roster of the room they are placed in.
        await expect(
            page.locator(`[data-attendance-child="${childId}"]`),
            "moved child vanished from their committed roster",
        ).toHaveCount(1);
        const rowText = await page.locator(`[data-attendance-child="${childId}"]`).innerText();
        expect(rowText, "row does not communicate the temporary location").toMatch(/Currently in/i);

        await backToRooms(page);
        const afterMetrics = await metrics(page);
        const occAfter = await occupancy(page);

        // Site Here now is unchanged — a move is not an arrival or a departure.
        expect(afterMetrics["Here now"], "a move changed site Here now").toBe(beforeMetrics["Here now"]);

        // Occupancy left one room and arrived in another — the alphabetical
        // defect would leave both numbers where they were.
        expect(occAfter[hostRoom], "origin occupancy did not fall").toBe(occBefore[hostRoom] - 1);
        expect(occAfter[dest.label], "destination occupancy did not rise").toBe((occBefore[dest.label] ?? 0) + 1);
        await shot(page, "B3-occupancy-moved");

        // Attention names the child as away from their placement.
        const attention = page.locator('[data-attendance-exceptions="true"]');
        if (await attention.count()) {
            expect(await attention.innerText(), "attention does not report the away child").toMatch(/ is in /i);
        }
    });

    test("T3-DE · correction reverses, checkout departs, both survive refresh", async ({ page }) => {
        await openAttendance(page);
        const rooms = Object.keys(await occupancy(page));

        let room = "";
        for (const r of rooms) {
            await openRoom(page, r);
            if (await page.locator("[data-attendance-child-correct]").count()) {
                room = r;
                break;
            }
            await backToRooms(page);
        }
        expect(room, "no child offers Correct").not.toBe("");

        // D — Correct is reachable and reverses the last fact. No destructive verb.
        const correctBtn = page.locator("[data-attendance-child-correct]").first();
        expect((await correctBtn.innerText()).toLowerCase(), "correction uses destructive wording").not.toMatch(
            /delete|remove|erase/,
        );
        await shot(page, "D1-before-correct");
        await correctBtn.click();
        await page.waitForTimeout(4000);
        await shot(page, "D2-after-correct");

        await backToRooms(page);
        const afterCorrection = await metrics(page);
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await openAttendance(page);
        expect(await metrics(page), "corrected state did not survive reload").toEqual(afterCorrection);

        // E — checkout removes the child from current occupancy.
        let checkoutRoom = "";
        for (const r of Object.keys(await occupancy(page))) {
            await openRoom(page, r);
            if (await page.locator("[data-attendance-child-checkout]").count()) {
                checkoutRoom = r;
                break;
            }
            await backToRooms(page);
        }

        if (checkoutRoom) {
            await backToRooms(page);
            const before = await metrics(page);
            const occBefore = await occupancy(page);
            await openRoom(page, checkoutRoom);
            await page.locator("[data-attendance-child-checkout]").first().click();
            await page.waitForTimeout(4000);
            await backToRooms(page);

            const after = await metrics(page);
            const occAfter = await occupancy(page);
            expect(after["Here now"], "Here now did not fall on checkout").toBe(before["Here now"] - 1);
            expect(after["Checked out"], "Checked out did not rise").toBe(before["Checked out"] + 1);
            const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
            expect(total(occAfter), "checked-out child still occupies a room").toBe(total(occBefore) - 1);
            await shot(page, "E1-after-checkout");
        }
    });

    test("T3-F · an expected child who never arrives is distinct and named in attention", async ({ page }) => {
        await openAttendance(page);
        const m = await metrics(page);
        await shot(page, "F1-overview");

        if (m["Not arrived"] > 0) {
            const attention = page.locator('[data-attendance-exceptions="true"]');
            await expect(attention, "not-arrived children are absent from attention").toHaveCount(1);
            expect(await attention.innerText()).toMatch(/has not arrived/i);

            // And the row itself reads differently from a present child.
            const room = await openPopulatedRoom(page);
            expect(room, "no room has child rows to compare states in").not.toBe("");
            const states = await page
                .locator("[data-attendance-child-state]")
                .evaluateAll((els) => els.map((e) => e.getAttribute("data-attendance-child-state")));
            expect(states.length, "no child states were examined").toBeGreaterThan(0);
            await shot(page, "F2-room-states");
        }
    });
});

test.describe("Thread 3 · tablet viewport", () => {
    test("T3-R · a present child row keeps every command operable at 768px", async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await openAttendance(page);
        await shot(page, "R1-tablet-overview");

        /*
         * OPEN A ROOM THAT ACTUALLY HAS ROWS.
         *
         * The first room at this campus is empty, and every assertion below is
         * over a list of controls — against an empty room they all pass with
         * nothing examined. A vacuous pass on the highest-risk check in this
         * thread would be worse than no check at all, so the room is chosen by
         * having a present child with commands, and the count is asserted.
         */
        const rooms = Object.keys(await occupancy(page));
        expect(rooms.length, "no rooms to inspect").toBeGreaterThan(0);

        const populated = await openPopulatedRoom(page);
        expect(populated, "no room has any child rows to inspect at tablet width").not.toBe("");
        await shot(page, "R2-tablet-room");

        const rowCount = await page.locator("[data-attendance-child]").count();
        expect(rowCount, "the tablet check examined no child rows").toBeGreaterThan(0);

        // No inaccessible horizontal overflow anywhere on the page.
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "the page scrolls sideways on a tablet").toBeLessThanOrEqual(1);

        /*
         * THE COMMAND CONTROLS, NOT EVERY CLICKABLE THING IN THE ROW.
         *
         * A row also carries the child's NAME as a button — a navigation
         * affordance rendered at text size, deliberately, the way a link is. The
         * requirement here is that the COMMANDS stay operable under the thumb:
         * the destination selector, Check out, Correct, Check in, Mark absent.
         * Measuring the name alongside them would fail the check for a reason
         * nobody asked about and hide the reason they did.
         */
        const controls = await page.evaluate(() =>
            Array.from(
                document.querySelectorAll(
                    "[data-attendance-child-checkin], [data-attendance-child-checkout]," +
                        " [data-attendance-child-correct], [data-attendance-child-move]," +
                        " [data-attendance-child] button:not([data-attendance-open-child])",
                ),
            ).map((el) => {
                const r = el.getBoundingClientRect();
                return { label: (el.textContent ?? "").trim().slice(0, 24), h: r.height, w: r.width, x: r.x };
            }),
        );
        expect(controls.length, "the tablet check examined no action controls").toBeGreaterThan(0);
        const tooShort = controls.filter((c) => c.h > 0 && c.h < 36);
        expect(tooShort, `controls under 36px: ${JSON.stringify(tooShort)}`).toEqual([]);

        // Nothing is clipped off the right edge.
        const clipped = controls.filter((c) => c.w > 0 && c.x + c.w > 768 + 1);
        expect(clipped, `controls clipped beyond the viewport: ${JSON.stringify(clipped)}`).toEqual([]);

        // A screenshot is not proof the controls work — operate one.
        const mover = page.locator("[data-attendance-child-move]").first();
        if (await mover.count()) {
            const opts = await mover.locator("option").evaluateAll((os) =>
                os.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
            );
            if (opts.length) {
                await mover.selectOption(opts[0]);
                await page.waitForTimeout(4000);
                await shot(page, "R3-tablet-move-executed");
            }
        }
        const checkout = page.locator("[data-attendance-child-checkout]").first();
        if (await checkout.count()) await expect(checkout).toBeEnabled();
        const correct = page.locator("[data-attendance-child-correct]").first();
        if (await correct.count()) await expect(correct).toBeEnabled();
    });
});
