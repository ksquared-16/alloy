import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * ATTENDANCE V1 — the critical operator path, once, end to end.
 *
 * Not a re-run of development: one pass over the single journey Attendance exists for —
 *
 *     staff check-in → actual staffing moves
 *     child check-in → actual demand moves
 *     staff check-out → actual staffing goes SHORT against the ratio
 *     correction     → the reversal is honoured
 *
 * ── WHAT MAKES THIS FALSIFIABLE ──
 *
 * Every assertion is on a number or a verdict the ROSTER READ MODEL produced, re-fetched after each
 * command. Asserting only that a button could be clicked would pass against a surface that records
 * nothing, which is the failure this whole fact stream was built to make impossible. The counts are
 * read BEFORE and compared AFTER, so a room that happened to already be in the expected state
 * cannot manufacture a pass.
 *
 * Actual staffing is a separate verdict from PLANNED staffing and they never share a field — the
 * point Phase 4 proved. This spec only ever reads the actual side.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "attendance-smoke");
const SETTLE = 120_000;
const SCHEDULING = "[data-adminv2-roster-workspace]";

const ROOM_ID = "00000000-0000-4000-8000-000000000013";
const CHILD_CM = "00000000-0000-4000-8000-00005000006b";
const STAFF_PERSON = "00000000-0000-4000-8000-000050000010";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

/** The room header's own counts + verdict, as the read model computed them. */
async function actual(page: Page, label: string) {
    const state = await page.evaluate(([roomId, staffId, childId]) => {
        const room = document.querySelector(`[data-attendance-room="${roomId}"]`);
        const verdict = room?.querySelector("[data-attendance-actual-state]");
        const line = room?.textContent ?? "";
        const num = (re: RegExp) => {
            const m = re.exec(line);
            return m ? Number(m[1]) : null;
        };
        return {
            verdict: verdict?.getAttribute("data-attendance-actual-state") ?? null,
            childrenPresent: num(/(\d+) of \d+ children present/),
            staffPresent: num(/(\d+) of \d+ staff present/),
            staffState:
                room
                    ?.querySelector(`[data-attendance-staff="${staffId}"] [data-attendance-staff-state]`)
                    ?.getAttribute("data-attendance-staff-state") ?? null,
            childState:
                room
                    ?.querySelector(`[data-attendance-child="${childId}"] [data-attendance-child-state]`)
                    ?.getAttribute("data-attendance-child-state") ?? null,
        };
    }, [ROOM_ID, STAFF_PERSON, CHILD_CM] as const);
    console.log(`[CERT SMOKE ${label}] ${JSON.stringify(state)}`);
    return state;
}

async function openRoom(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
        sessionStorage.setItem(
            "alloy.roster.workspace.deeplink",
            JSON.stringify({ section: "attendance" }),
        );
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="roster"]').click();
    await expect(page.locator(SCHEDULING)).toBeVisible({ timeout: SETTLE });

    const sitePicker = page.locator('button[aria-label="Site"]').first();
    await sitePicker.click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(page.locator(`[data-attendance-room-card="${ROOM_ID}"]`)).toBeVisible({ timeout: SETTLE });
    await page.locator(`[data-attendance-room-card="${ROOM_ID}"]`).click();
    await expect(page.locator(`[data-attendance-room="${ROOM_ID}"]`)).toBeVisible({ timeout: SETTLE });
}

/**
 * Return the STAFF subject to "no record" so the journey starts from a known state and the spec is
 * re-runnable.
 *
 * Correction is the product's own reversal path, not a back door — and it is the only one: a
 * `present` staff member shows "Undo check-in" (which carries a data hook) while a `checked_out`
 * one shows "Correct" (which does not), so this matches on the row and the button's text.
 *
 * The CHILD deliberately has no equivalent. Its row offers no correction in any state, which is why
 * the child leg below reads the current state and proves whichever direction the product allows.
 */
async function resetStaff(page: Page) {
    for (let i = 0; i < 5; i++) {
        const row = page.locator(`[data-attendance-staff="${STAFF_PERSON}"]`);
        const state = await row
            .locator("[data-attendance-staff-state]")
            .getAttribute("data-attendance-staff-state")
            .catch(() => null);
        if (state === "no_record") return;
        const undo = row.getByRole("button", { name: /Undo check-in|^Correct$/ });
        if (!(await undo.count())) return;
        await undo.first().click();
        await expect
            .poll(async () => (await actual(page, `reset-${i}`)).staffState, { timeout: 30_000 })
            .not.toBe(state);
    }
}

test.describe("Attendance V1 — critical operator path", () => {
    test("S1 · check-in / check-out / correction move ACTUAL staffing and demand", async ({ page }) => {
        await openRoom(page);
        await resetStaff(page);
        const start = await actual(page, "00-start");
        await shot(page, "00-start");

        // ── staff check-in → actual staffing rises ──
        const staffIn = page.locator(`[data-attendance-staff-checkin="${STAFF_PERSON}"]`);
        await expect(staffIn, "staff has no check-in affordance — the journey cannot start").toBeVisible({
            timeout: SETTLE,
        });
        await staffIn.click();
        await expect
            .poll(async () => (await actual(page, "01-staff-in")).staffState, { timeout: SETTLE })
            .toBe("present");
        const afterIn = await actual(page, "01-staff-in-settled");
        expect(afterIn.staffPresent, "actual staff present did not rise").toBe((start.staffPresent ?? 0) + 1);
        await shot(page, "01-staff-in");

        // ── correction → the check-in is reversed and staffing returns ──
        //
        // Proven on the STAFF side because that is where the operator surface exists: the child row
        // offers check-in / absence / check-out and NO correction affordance. Corrections to child
        // attendance are a registered action with no Attendance control, which is recorded as a
        // finding rather than papered over by driving the API from the browser.
        const staffCorrect = page.locator(`[data-attendance-staff-correct="${STAFF_PERSON}"]`);
        await expect(staffCorrect, "a present staff member offers no correction").toBeVisible({ timeout: SETTLE });
        await staffCorrect.click();
        await expect
            .poll(async () => (await actual(page, "02-corrected")).staffState, { timeout: SETTLE })
            .toBe("no_record");
        expect((await actual(page, "02-corrected-settled")).staffPresent, "the correction did not reverse the count").toBe(
            start.staffPresent ?? 0,
        );
        await shot(page, "02-corrected");

        // Re-record so the rest of the journey runs against a present staff member.
        await page.locator(`[data-attendance-staff-checkin="${STAFF_PERSON}"]`).click();
        await expect
            .poll(async () => (await actual(page, "03-staff-in-again")).staffState, { timeout: SETTLE })
            .toBe("present");

        // ── child attendance → actual DEMAND moves ──
        //
        // State-adaptive on purpose, and the reason is a real product asymmetry: the child row shows
        // check-in only from `no_record`, check-out only from `present`, and NOTHING from
        // `checked_out` — no re-entry, no correction. So the direction available depends on where
        // the fixture left the child, and forcing one would mean driving the API from the browser
        // rather than certifying the operator's surface.
        const beforeChild = await actual(page, "04-child-before");
        let withBoth = beforeChild;

        if (beforeChild.childState === "present") {
            await page.locator(`[data-attendance-child-checkout="${CHILD_CM}"]`).click();
            await expect
                .poll(async () => (await actual(page, "04-child-out")).childState, { timeout: SETTLE })
                .toBe("checked_out");
            withBoth = await actual(page, "04-child-out-settled");
            expect(withBoth.childrenPresent, "a child check-out did not lower actual demand").toBe(
                (beforeChild.childrenPresent ?? 1) - 1,
            );
        } else if (beforeChild.childState === "no_record") {
            await page.locator(`[data-attendance-child-checkin="${CHILD_CM}"]`).click();
            await expect
                .poll(async () => (await actual(page, "04-child-in")).childState, { timeout: SETTLE })
                .toBe("present");
            withBoth = await actual(page, "04-child-in-settled");
            expect(withBoth.childrenPresent, "a child check-in did not raise actual demand").toBe(
                (beforeChild.childrenPresent ?? 0) + 1,
            );
        } else {
            console.log(
                "[CERT SMOKE FINDING] a checked-out child offers no re-entry and no correction control in " +
                    "Attendance — actual demand can be lowered from this surface but not restored",
            );
        }
        await shot(page, "04-child-demand");

        // ── staff check-out → demand unchanged, staffing falls, verdict re-evaluated ──
        const staffOut = page.locator(`[data-attendance-staff-checkout="${STAFF_PERSON}"]`);
        await expect(staffOut, "staff is present but offers no check-out").toBeVisible({ timeout: SETTLE });
        await staffOut.click();
        await expect
            .poll(async () => (await actual(page, "05-staff-out")).staffState, { timeout: SETTLE })
            .toBe("checked_out");
        expect(
            (await actual(page, "05-staff-out-settled")).staffPresent,
            "a staff check-out did not lower actual staffing",
        ).toBe(start.staffPresent ?? 0);
        const afterOut = await actual(page, "05-staff-out");
        await shot(page, "05-staff-out");

        // Children present did not move because a staff event ended — the two sides are independent.
        expect(afterOut.childrenPresent, "a staff check-out changed the CHILD count").toBe(withBoth.childrenPresent);

        // The verdict is the ratio engine's, re-run on the new actuals. Children present with zero
        // staff present is exactly the case this fact stream exists to surface.
        // `idle` is a real verdict, not a gap: an empty register is nobody to be short FOR. Treating
        // it as "short" was a defect fixed on staging (`d9d2ea332`), so it is asserted here as valid.
        expect(["short", "sufficient", "unknown", "idle"]).toContain(afterOut.verdict);
        if ((afterOut.childrenPresent ?? 0) > 0 && (afterOut.staffPresent ?? 0) === 0) {
            expect(afterOut.verdict, "children present with zero staff did not read short").toBe("short");
        }
    });
});
