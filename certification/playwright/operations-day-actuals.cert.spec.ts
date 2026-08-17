import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * UX-4 — THE DAY ROSTER SHOWS WHAT IS HAPPENING, NOT ONLY WHAT WAS PLANNED.
 *
 * The load-bearing proof is one room at one instant holding two opposite verdicts:
 *
 *     PLANNED   staff 1 / required 1   →  sufficient
 *     ACTUAL    staff 0 / required 1   →  short
 *
 * Demand is identical on both sides by fixture design — both populations land in the same ratio
 * tier — so the only thing separating the verdicts is SUPPLY. That makes this a clean negative
 * control rather than an artefact of the ratio curve, and it is the state a surface showing only
 * expectation physically cannot represent.
 *
 * ── WHY THE ASSERTIONS ARE ON DATA MARKERS ──
 *
 * Prose would pass against a card that printed the right words next to the wrong numbers. Every
 * count and verdict is asserted through the attribute the card publishes it under, so a
 * transposition — actual read into the expected column, scheduled staff standing in for present
 * staff — fails here rather than looking plausible.
 *
 * Fixtures: `certification/fixtures/operations-day-actuals.sql` (idempotent by deterministic
 * identity; the fact tables are append-only by trigger and nothing is deleted).
 */

const SHOTS = path.join(__dirname, "..", "evidence", "operations-day-actuals");
const SETTLE = 180_000;

const SITE_NAME = "UX4 Campus";
const OPERATING = "fbc40000-0000-4000-8000-00000000000a";
const IDLE = "fbc40000-0000-4000-8000-00000000000d";
const UNKNOWN = "fbc40000-0000-4000-8000-00000000000e";

const OPERATIONS_NAV = '[data-adminv2-sidebar-modal-nav="operations"]';
const SHELL = '[data-adminv2-operations-workspace="true"]';
const BAND = '[data-roster-control-band="true"]';

const room = (id: string) => `[data-roster-room="${id}"]`;

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

/** Open Operations, put it on the fixture's own campus, Day × Rooms. */
async function openUx4Day(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(OPERATIONS_NAV).click();
    await expect(page.locator(SHELL)).toBeVisible({ timeout: SETTLE });

    await page.locator('button[aria-label="Site"]').first().click();
    const siteOption = page.locator("[role=option]", { hasText: SITE_NAME }).first();
    await expect(siteOption, "the fixture campus must be selectable").toBeVisible({ timeout: SETTLE });
    await siteOption.click();
    await expect(page.locator(SHELL)).toContainText(SITE_NAME, { timeout: SETTLE });

    await page.locator('[data-roster-range-option="day"]').click();
    await page.locator('[data-roster-lens-option="rooms"]').click();
    await expect(page.locator(room(OPERATING))).toBeVisible({ timeout: SETTLE });
}

/** Read one room's published numbers and verdicts. */
async function readRoom(page: Page, roomId: string) {
    const el = page.locator(room(roomId));
    // Wait for the card and its comparison block before reading. `getAttribute` does not auto-wait,
    // so reading straight after navigation captured whatever existed at that instant — an assertion
    // that fails for a reason other than its claim.
    await expect(el).toBeVisible({ timeout: SETTLE });
    await expect(el.locator('[data-roster-room-compare="true"]')).toBeVisible({ timeout: SETTLE });
    const attr = async (name: string) =>
        (await el.locator(`[${name}]`).first().getAttribute(name)) ?? null;
    return {
        expectedChildren: await attr("data-roster-children-count"),
        childrenHere: await attr("data-roster-children-present"),
        scheduledStaff: await attr("data-roster-staff-count"),
        staffHere: await attr("data-roster-staff-present"),
        requiredPlanned: await attr("data-roster-required"),
        requiredActual: await attr("data-roster-required-actual"),
        planned: await el.locator("[data-roster-planned-state]").getAttribute("data-roster-planned-state"),
        actual: await el.locator("[data-roster-actual-state]").getAttribute("data-roster-actual-state"),
        /** The card's DOMINANT state — accent, header chip, sentence. */
        headline: await el.getAttribute("data-roster-state"),
        headlineChip: await el.locator("[data-roster-room-state]").first().getAttribute("data-roster-room-state"),
        headlineLabel: (await el.locator("[data-roster-room-state]").first().innerText()).trim(),
        accent: (await el.getAttribute("class")) ?? "",
    };
}

// ═══ 1–10 — the operating room, and the two verdicts at once ═════════════════════════════════
test("1–10 — the operating room shows expected beside actual, and both verdicts at once", async ({
    page,
}) => {
    await openUx4Day(page);

    // 1 — Operations opened on Roster.
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-mode", "work");
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "roster");

    const r = await readRoom(page, OPERATING);

    // 2–5 — the four counts, each from its own marker.
    expect(r.expectedChildren, "expected Children").toBe("2");
    expect(r.childrenHere, "Children here now").toBe("1");
    expect(r.scheduledStaff, "scheduled Staff").toBe("1");
    expect(r.staffHere, "Staff here now").toBe("0");

    // 6–7 — demand, planned and actual. Equal here BY DESIGN: identical tier, so only supply differs.
    expect(r.requiredPlanned, "planned required Staff").toBe("1");
    expect(r.requiredActual, "actual required Staff").toBe("1");

    // 8–9 — the verdicts.
    expect(r.planned, "planned staffing").toBe("sufficient");
    expect(r.actual, "actual staffing").toBe("short");

    /*
     * 10 — SIMULTANEOUSLY, ON THE SAME CARD.
     *
     * Asserted as co-visibility inside one room element, not as two readings taken in sequence: a
     * surface that showed planned, then actual after a refresh, would satisfy 8 and 9 and still fail
     * the thing an operator needs, which is seeing the contradiction at a glance.
     */
    const card = page.locator(room(OPERATING));
    await expect(card.locator('[data-roster-planned-state="sufficient"]')).toBeVisible();
    await expect(card.locator('[data-roster-actual-state="short"]')).toBeVisible();

    /*
     * ── THE HEADLINE FOLLOWS THE ACTUAL STATE ──
     *
     * This is the visual half of the same claim, and it is asserted separately because the previous
     * build satisfied every assertion above while leading with a green "Staffed" chip, a green accent
     * and "1 of 1 staff scheduled". The comparison block was right and the card was still lying: on a
     * DAY the operator reads the accent and the chip first, and those said the room was fine.
     *
     * Day headline = actual. Week headline = planned. Planned stays visible as the comparison half —
     * asserted below, so this can never be satisfied by simply deleting the plan.
     */
    expect(r.headline, "the card's dominant state is the ACTUAL one").toBe("short");
    expect(r.headlineChip, "the header chip is the actual verdict").toBe("short");
    expect(r.headlineLabel, "and it says so in words").toBe("Short");
    expect(r.headlineLabel, "a room that is actually short never reads Staffed").not.toBe("Staffed");
    // The left accent is the attention token, not the met-state token.
    expect(r.accent, "accent is attention, not pine").toContain("border-l-alloy-gold-dark");
    expect(r.accent).not.toContain("border-l-[#00A283]");

    // …and the PLAN is still legible beside it, in words, not only in an attribute.
    await expect(card.getByText("Planned staffing")).toBeVisible();
    await expect(card.getByText("Actual staffing")).toBeVisible();
    const plannedChip = card.locator("[data-roster-planned-state]");
    const actualChip = card.locator("[data-roster-actual-state]");
    await expect(plannedChip, "Planned still says Sufficient").toHaveText("Staffed");
    await expect(actualChip, "Actual says Short").toHaveText("Short");
    // The sentence under the room name speaks the present tense, not the schedule.
    await expect(card).toContainText("right now");

    await page.screenshot({ path: path.join(SHOTS, "1-operating-room.png"), fullPage: true });
    await card.screenshot({ path: path.join(SHOTS, "2-planned-sufficient-actual-short.png") });
});

// ═══ 11 — expected-but-not-arrived is not counted present ════════════════════════════════════
test("11 — an expected Child who has not arrived is not counted as here", async ({ page }) => {
    await openUx4Day(page);
    const r = await readRoom(page, OPERATING);

    /*
     * Two children are expected and one is present, so Bo is in Expected and not in Here now.
     *
     * Bo deliberately has NO attendance fact at all — not even an `absence`. "Has not arrived yet"
     * and "was marked absent" are different states, and the silent one is the one a present-count
     * is most likely to get wrong.
     */
    expect(Number(r.expectedChildren)).toBe(2);
    expect(Number(r.childrenHere)).toBe(1);
    expect(Number(r.expectedChildren) - Number(r.childrenHere), "exactly one expected child absent").toBe(1);

    await page.screenshot({ path: path.join(SHOTS, "3-expected-vs-here-now.png"), fullPage: true });
});

// ═══ 12–13 — idle and unknown stay neutral ═══════════════════════════════════════════════════
test("12+13 — idle and unknown-ratio rooms stay neutral, never green", async ({ page }) => {
    await openUx4Day(page);

    // 12 — IDLE: nobody expected, nobody here. Must not read as a healthy staffed room.
    const idle = await readRoom(page, IDLE);
    expect(idle.expectedChildren).toBe("0");
    expect(idle.childrenHere).toBe("0");
    expect(idle.planned, "an empty room is not Sufficient").not.toBe("sufficient");
    expect(idle.actual, "an empty room is not Sufficient").not.toBe("sufficient");
    // The headline moved to actual — the neutral states must have moved with it, not gone green.
    expect(idle.headline, "an empty room's dominant state stays neutral").not.toBe("sufficient");
    expect(idle.headlineLabel).not.toBe("Staffed");
    expect(idle.accent, "no pine accent on a room nobody is in").not.toContain("border-l-[#00A283]");
    await page.locator(room(IDLE)).screenshot({ path: path.join(SHOTS, "4-idle-room.png") });

    /*
     * 13 — UNKNOWN: a room with a real population and no resolvable ratio.
     *
     * This is the state that most tempts a green chip, because nothing is visibly wrong. The
     * platform cannot say whether it is staffed, and saying "Sufficient" would be a claim the
     * operator cannot see through.
     */
    const unknown = await readRoom(page, UNKNOWN);
    expect(Number(unknown.expectedChildren), "the unknown room is populated").toBeGreaterThan(0);
    expect(unknown.requiredPlanned, "no ratio resolves").toBe("unknown");
    expect(unknown.planned).toBe("unknown");
    expect(unknown.actual, "an unresolvable room is never Sufficient").not.toBe("sufficient");
    expect(unknown.headline, "and neither is its headline").not.toBe("sufficient");
    expect(unknown.headlineLabel).not.toBe("Staffed");
    expect(unknown.accent, "no pine accent where the platform cannot tell").not.toContain(
        "border-l-[#00A283]",
    );
    await page.locator(room(UNKNOWN)).screenshot({ path: path.join(SHOTS, "5-unknown-room.png") });
});

// ═══ 14 — Attendance receives the same site, date and room ═══════════════════════════════════
test("14 — Open Attendance carries site, service date and room, and stays in Operations", async ({
    page,
}) => {
    await openUx4Day(page);

    // The org's service date arrives asynchronously; reading it immediately captures "". The UX-3
    // control-band spec learned the same thing — a poll, not an assumption.
    await expect
        .poll(async () => page.locator('[data-roster-date="true"]').inputValue(), { timeout: SETTLE })
        .not.toBe("");
    const dateBefore = await page.locator('[data-roster-date="true"]').inputValue();
    const urlBefore = page.url();
    // The full context the operator is standing in, captured before the trip.
    const rangeBefore = await page.locator("[data-roster-range]").getAttribute("data-roster-range");
    const lensBefore = await page.locator("[data-roster-lens]").getAttribute("data-roster-lens");
    expect(rangeBefore).toBe("day");
    expect(lensBefore).toBe("rooms");

    const open = page.locator(room(OPERATING)).locator(`[data-roster-open-attendance="${OPERATING}"]`);
    await expect(open, "Attendance handoff is offered on today's roster").toBeVisible({ timeout: SETTLE });
    await open.click();

    // Same workspace — the handoff is a section change, not a navigation.
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "attendance", {
        timeout: SETTLE,
    });
    expect(page.url()).toBe(urlBefore);
    await expect(page.locator(SHELL)).toContainText(SITE_NAME);

    // The SAME room, and Attendance renders the same canonical facts it was handed.
    await expect(page.locator(`[data-attendance-room="${OPERATING}"]`)).toBeVisible({ timeout: SETTLE });

    /*
     * ── AND BACK. THE WHOLE CONTEXT, NOT JUST THE ROUTE ──
     *
     * This is the leg that failed. The date was correct on the way in and empty on the way back,
     * because `day` and `serverToday` lived inside `RosterSurface` — which the workspace unmounts to
     * show Attendance. Site, range and lens survived only because they were already workspace state;
     * the day was the one piece of Roster context that was not.
     *
     * Asserted as EQUALITY to the value captured before the trip, not merely as "non-empty": a
     * remount that silently resolves the org's today would look identical on a day when the operator
     * happened to be on today, and would lose them on any other day.
     */
    await page.locator('[data-workspace-mode-sections="roster"] button', { hasText: "Roster" })
        .first()
        .click();
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "roster", {
        timeout: SETTLE,
    });

    await expect(page.locator(SHELL), "site survived the round trip").toContainText(SITE_NAME);
    expect(await page.locator('[data-roster-date="true"]').inputValue(), "service date").toBe(dateBefore);
    expect(
        await page.locator("[data-roster-range]").getAttribute("data-roster-range"),
        "Roster range",
    ).toBe(rangeBefore);
    expect(
        await page.locator("[data-roster-lens]").getAttribute("data-roster-lens"),
        "Roster lens",
    ).toBe(lensBefore);
    // Room context — the room handed to Attendance is the room Roster comes back focused on.
    await expect(page.locator(room(OPERATING)), "room context").toBeVisible({ timeout: SETTLE });
    // …and the card is still telling the truth it told before the trip.
    await expect(page.locator(room(OPERATING))).toHaveAttribute("data-roster-state", "short");

    await page.screenshot({ path: path.join(SHOTS, "6-attendance-handoff.png"), fullPage: true });
});

// ═══ 15–16 — Week stays planning, and the band stays put ═════════════════════════════════════
test("15+16 — Week shows no actual attendance, and the control band does not move", async ({ page }) => {
    await openUx4Day(page);

    const dayBox = await page.locator(BAND).boundingBox();
    expect(dayBox).not.toBeNull();

    await page.locator('[data-roster-range-option="week"]').click();
    await expect(page.locator("[data-roster-range]")).toHaveAttribute("data-roster-range", "week", {
        timeout: SETTLE,
    });

    /*
     * 15 — WEEK IS PLANNING. There is no actual attendance in the future, and a zero there would
     * read as "nobody came" rather than "this has not happened yet". The here-now markers are the
     * Day card's; Week must publish none of them.
     */
    await expect(page.locator("[data-roster-children-present]")).toHaveCount(0);
    await expect(page.locator("[data-roster-staff-present]")).toHaveCount(0);
    await expect(page.locator("[data-roster-actual-state]")).toHaveCount(0);
    // …and the health band answers the planning question, not the operating one.
    await expect(page.locator(SHELL)).not.toContainText("Children here now");

    // 16 — the UX-3 band held its position across the range change.
    const weekBox = await page.locator(BAND).boundingBox();
    expect(weekBox).not.toBeNull();
    expect(Math.abs(weekBox!.x - dayBox!.x), "band moved horizontally").toBeLessThanOrEqual(4);
    expect(Math.abs(weekBox!.y - dayBox!.y), "band moved vertically").toBeLessThanOrEqual(4);

    await page.screenshot({ path: path.join(SHOTS, "7-week-planning.png"), fullPage: true });
});
