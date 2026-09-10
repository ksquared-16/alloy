import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * THREAD 4 — absence, vacation and closures, in a real browser.
 *
 * ── WHAT THIS HAS TO PROVE, AND WHY A SCREENSHOT WOULD NOT ──
 *
 * Every assertion below reads a number or a state the READ MODEL rendered,
 * captured BEFORE the command and compared AFTER, and the decisive ones survive a
 * full page reload. A spec that only clicked the controls would pass against a
 * surface that authored nothing and remembered it in React state — which is
 * precisely the failure mode a feature like this invites, because "she looks
 * absent now" is indistinguishable from "she IS recorded as not expected" until
 * you refresh.
 *
 * The scenario the whole architecture turns on is D: a child marked away who
 * walks in anyway must read as HERE and NOT EXPECTED. If the plan swallowed the
 * fact she would be invisible to ratios and evacuation; if the fact erased the
 * plan the operator would lose the one signal that something unexpected happened.
 *
 * ── IT PUTS EVERYTHING BACK ──
 *
 * The certification tenant is shared and long-lived, so each scenario reverses
 * itself through the operator's own controls — never through the database, which
 * the append-only ledger correctly forbids. That makes the spec re-runnable, and
 * it also proves something worth proving: the loop closes. A plan can be
 * withdrawn, a closure can be reopened, and the day returns to what it was.
 *
 * ── FIXTURE ──
 *
 * Depends on `certification/attendance/01-attendance-fixture.sql`, as Thread 3
 * does: children placed in a room at Riverside with schedules covering today.
 * Without it every scenario here is vacuous, so T4-0 fails closed on it rather
 * than reporting a cheerful green against an empty site.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "attendance-absence-closures");
const SETTLE = 120_000;
const SCHEDULING = "[data-adminv2-roster-workspace]";
const OVERVIEW = '[data-attendance-overview="true"]';
/** Long enough for the command to commit and the day to be re-read. */
const COMMAND = 5000;

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));
const shot = (page: Page, name: string) =>
    page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

async function openAttendance(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
        sessionStorage.setItem("alloy.roster.workspace.deeplink", JSON.stringify({ section: "attendance" }));
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="operations"]').click();
    await expect(page.locator(SCHEDULING)).toBeVisible({ timeout: SETTLE });

    const sitePicker = page.locator('button[aria-label="Site"]').first();
    await expect(sitePicker, "the site picker is absent — Attendance cannot be scoped").toBeVisible({ timeout: SETTLE });
    await sitePicker.click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(sitePicker).toContainText("Riverside", { timeout: SETTLE });
    await expect(page.locator(OVERVIEW)).toBeVisible({ timeout: SETTLE });

    // Wait for the DATA, not the shell: the tiles render zeros before the day
    // arrives, and reading those zeros looks exactly like the missing-fixture
    // defect this spec exists to detect.
    await expect(
        page.locator("[data-attendance-room-card]").first(),
        "no room card ever rendered — the attendance fixture is missing",
    ).toBeVisible({ timeout: SETTLE });
}

/** The site metric tiles, as rendered. */
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

async function roomNames(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-attendance-room-card]")).map(
            (c) => c.querySelector("h3")?.textContent?.trim() ?? "",
        ),
    );
}

async function openRoom(page: Page, roomName: string) {
    await page.locator("[data-attendance-room-card]", { hasText: roomName }).first().click();
    await expect(page.locator("[data-attendance-children-list]")).toBeVisible({ timeout: SETTLE });
}

async function backToRooms(page: Page) {
    await page.locator('[data-attendance-back="true"]').click();
    await expect(page.locator(OVERVIEW)).toBeVisible({ timeout: SETTLE });
}

/**
 * A room that actually contains child rows.
 *
 * The first room at this campus is empty, and a scenario that inspects a LIST
 * passes with nothing examined when handed it — green, and proving nothing. The
 * caller asserts a room was found, so an empty campus fails loudly instead.
 */
async function openPopulatedRoom(page: Page): Promise<string> {
    for (const r of await roomNames(page)) {
        await openRoom(page, r);
        if (await page.locator("[data-attendance-child]").count()) return r;
        await backToRooms(page);
    }
    return "";
}

/**
 * Leave the day open before a scenario that depends on it.
 *
 * A previous run that failed between closing and reopening would otherwise leave
 * this tenant shut for good, and every scenario after it would fail for a reason
 * that looks like a product defect and is not.
 */
async function ensureDayOpen(page: Page) {
    const reopen = page.locator('[data-attendance-reopen-site="true"]');
    if (await reopen.count()) {
        await reopen.click();
        await page.waitForTimeout(COMMAND);
        await expect(page.locator('[data-attendance-closed="true"]')).toHaveCount(0, { timeout: SETTLE });
    }
}

/** How the day reads for one child, straight off the rendered chip. */
async function dayState(page: Page, childId: string): Promise<string> {
    return page.evaluate((id) => {
        const row = document.querySelector(`[data-attendance-child="${id}"]`);
        const chip = row?.querySelector("[data-attendance-child-day]");
        return chip?.getAttribute("data-attendance-child-day") ?? "";
    }, childId);
}

async function chipText(page: Page, childId: string): Promise<string> {
    return page.evaluate((id) => {
        const row = document.querySelector(`[data-attendance-child="${id}"]`);
        return row?.querySelector("[data-attendance-child-day]")?.textContent?.trim() ?? "";
    }, childId);
}

/**
 * A child who is expected, has not arrived, and whom nobody has explained — the
 * subject every scenario needs. Found rather than assumed, because the tenant is
 * shared and has already been operated on by other specs.
 */
async function findUnexplainedChild(page: Page): Promise<{ room: string; childId: string }> {
    for (const room of await roomNames(page)) {
        await openRoom(page, room);
        /*
         * "Unexplained" is `not_arrived`, NOT a missing day attribute.
         *
         * Every scheduled child now carries a reading — an ordinary child reads
         * `not_arrived` — so filtering for an absent attribute matched nobody and
         * reported an empty site against a fully seeded one. An empty attribute is
         * accepted too, for a row rendered before the projection answered.
         */
        const ids = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-attendance-child]"))
                .filter((row) => {
                    const day =
                        row.querySelector("[data-attendance-child-day]")?.getAttribute("data-attendance-child-day") ?? "";
                    return (
                        !!row.querySelector("[data-attendance-child-checkin]") &&
                        !!row.querySelector("[data-attendance-child-absent]") &&
                        (day === "" || day === "not_arrived")
                    );
                })
                .map((row) => row.getAttribute("data-attendance-child") ?? ""),
        );
        if (ids.length) return { room, childId: ids[0] };
        await backToRooms(page);
    }
    return { room: "", childId: "" };
}

/** Say a child will not be in, for a reason, through the operator's own control. */
async function markAway(page: Page, childId: string, reasonKey: string) {
    await page.locator(`[data-attendance-child-absent="${childId}"]`).selectOption(reasonKey);
    await page.waitForTimeout(COMMAND);
}

test.describe.configure({ mode: "serial" });

test.describe("Thread 4 · absence, vacation and closures", () => {
    test("T4-0 · the day is populated, so nothing below is vacuous", async ({ page }) => {
        await openAttendance(page);
        await ensureDayOpen(page);
        await shot(page, "00-overview");

        const m = await metrics(page);
        expect(m["Expected"], "no expected children — attendance fixture not loaded").toBeGreaterThan(0);
        expect((await roomNames(page)).length, "no room cards rendered").toBeGreaterThan(0);

        const found = await findUnexplainedChild(page);
        expect(found.childId, "no expected, unexplained child to plan an absence for").not.toBe("");
    });

    test("T4-A · a sick call stops a child reading as an unexplained missing arrival", async ({ page }) => {
        await openAttendance(page);
        const before = await metrics(page);
        const { room, childId } = await findUnexplainedChild(page);
        expect(childId).not.toBe("");
        void room;
        const childName = await page.evaluate(
            (id) =>
                document
                    .querySelector(`[data-attendance-child="${id}"]`)
                    ?.querySelector("button, span")
                    ?.textContent?.trim() ?? "",
            childId,
        );
        expect(childName, "the child row rendered no name").not.toBe("");
        await shot(page, "A1-before-absence");

        await markAway(page, childId, "illness");
        await shot(page, "A2-after-absence");

        // The child's own row says why.
        expect(await dayState(page, childId)).toBe("known_away");
        expect(await chipText(page, childId)).toBe("Off sick");

        await backToRooms(page);
        const after = await metrics(page);
        // The number that starts phone calls went DOWN by exactly one, and the
        // count of children nobody expects went up. A feature that only changed
        // the chip would leave both untouched.
        expect(after["Not arrived"]).toBe(before["Not arrived"] - 1);
        expect(after["Away"] ?? 0).toBeGreaterThan(0);
        expect(after["Expected"]).toBe(before["Expected"]);

        // And SHE is no longer on the list of children to chase. Named, because
        // other children may legitimately still be missing.
        expect(await page.evaluate(() => document.body.innerText)).not.toContain(`${childName} has not arrived`);
    });

    test("T4-B · the plan survives a reload — it was authored, not remembered", async ({ page }) => {
        await openAttendance(page);
        let room = "";
        let childId = "";
        for (const r of await roomNames(page)) {
            await openRoom(page, r);
            const ids = await page.evaluate(() =>
                Array.from(document.querySelectorAll("[data-attendance-child]"))
                    .filter(
                        (row) =>
                            row.querySelector("[data-attendance-child-day]")?.getAttribute("data-attendance-child-day") ===
                            "known_away",
                    )
                    .map((row) => row.getAttribute("data-attendance-child") ?? ""),
            );
            if (ids.length) {
                room = r;
                childId = ids[0];
                break;
            }
            await backToRooms(page);
        }
        expect(childId, "T4-A left no planned absence to reload").not.toBe("");

        // A full navigation, not a re-render: nothing of the previous page's
        // state survives this, so what comes back came from the server.
        await openAttendance(page);
        await openRoom(page, room);
        expect(await dayState(page, childId)).toBe("known_away");
        await shot(page, "B1-after-reload");
    });

    test("T4-C · a child who attends her own sick day is HERE and visibly unexpected", async ({ page }) => {
        await openAttendance(page);
        let room = "";
        let childId = "";
        for (const r of await roomNames(page)) {
            await openRoom(page, r);
            const ids = await page.evaluate(() =>
                Array.from(document.querySelectorAll("[data-attendance-child]"))
                    .filter(
                        (row) =>
                            row.querySelector("[data-attendance-child-day]")?.getAttribute("data-attendance-child-day") ===
                                "known_away" && row.querySelector("[data-attendance-child-checkin]"),
                    )
                    .map((row) => row.getAttribute("data-attendance-child") ?? ""),
            );
            if (ids.length) {
                room = r;
                childId = ids[0];
                break;
            }
            await backToRooms(page);
        }
        expect(childId, "no planned-away child was available to arrive").not.toBe("");

        await backToRooms(page);
        const before = await metrics(page);
        await openRoom(page, room);

        await page.locator(`[data-attendance-child-checkin="${childId}"]`).click();
        await page.waitForTimeout(COMMAND);
        await shot(page, "C1-attended-despite-plan");

        /*
         * BOTH HALVES, OR THIS FEATURE IS UNSAFE.
         *
         * She is physically here — so she must count for occupancy — and nobody
         * expected her, which is the thing the operator needs told.
         */
        expect(await dayState(page, childId)).toBe("attended_despite_plan");
        expect((await chipText(page, childId)).toLowerCase()).toContain("here");

        await backToRooms(page);
        const after = await metrics(page);
        expect(after["Here now"]).toBe(before["Here now"] + 1);
        expect(await page.evaluate(() => document.body.innerText)).toContain("was not expected");

        /*
         * PUT IT BACK — through the product, never the database. Reversing the
         * arrival returns her to not-arrived (the fold stops counting a reversed
         * fact), and the plan is then withdrawn, which is Scenario D's claim.
         */
        await openRoom(page, room);
        const correct = page.locator(`[data-attendance-child-correct="${childId}"]`);
        if (await correct.count()) {
            await correct.click();
            await page.waitForTimeout(COMMAND);
        }
    });

    test("T4-D · a withdrawn plan puts the child back on the expected roster", async ({ page }) => {
        await openAttendance(page);
        let room = "";
        let childId = "";
        for (const r of await roomNames(page)) {
            await openRoom(page, r);
            const ids = await page.evaluate(() =>
                Array.from(document.querySelectorAll("[data-attendance-child-expected-again]")).map(
                    (b) => b.getAttribute("data-attendance-child-expected-again") ?? "",
                ),
            );
            if (ids.length) {
                room = r;
                childId = ids[0];
                break;
            }
            await backToRooms(page);
        }
        expect(childId, "no planned absence was available to withdraw").not.toBe("");

        await backToRooms(page);
        const before = await metrics(page);
        await openRoom(page, room);

        await page.locator(`[data-attendance-child-expected-again="${childId}"]`).click();
        await page.waitForTimeout(COMMAND);
        await shot(page, "D1-after-withdrawal");

        /*
         * The state is NOT "still away with a note on it". A cancellation would
         * have made this child's day undeterminable; a revision makes her
         * ordinary again — expected, and missed if she does not arrive.
         */
        expect(await dayState(page, childId)).not.toBe("known_away");
        await expect(page.locator(`[data-attendance-child-absent="${childId}"]`)).toBeVisible();

        await backToRooms(page);
        const after = await metrics(page);
        expect(after["Not arrived"]).toBe(before["Not arrived"] + 1);
    });

    test("T4-E · one closure closes the day, and the day can be reopened", async ({ page }) => {
        await openAttendance(page);
        await ensureDayOpen(page);
        const before = await metrics(page);
        expect(before["Expected"]).toBeGreaterThan(0);
        await shot(page, "E1-before-closure");

        await page.locator('[data-attendance-close-site="true"]').selectOption("holiday_closure");
        await page.waitForTimeout(COMMAND);
        await shot(page, "E2-closed");

        // Said ONCE, at the top — not as a screen full of children who appear to
        // have failed to turn up.
        const banner = page.locator('[data-attendance-closed="true"]');
        await expect(banner, "the closure was authored but the day does not say it is closed").toBeVisible({
            timeout: SETTLE,
        });
        await expect(banner).toContainText("Public holiday");

        const closed = await metrics(page);
        expect(closed["Not arrived"]).toBe(0);
        expect(closed["Away"]).toBe(closed["Expected"]);

        // Every child, from one authored statement — not one row per child.
        const room = await openPopulatedRoom(page);
        expect(room, "no room at this campus has any children — the assertion below would be vacuous").not.toBe("");
        const states = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-attendance-child-day]")).map((c) =>
                c.getAttribute("data-attendance-child-day"),
            ),
        );
        expect(states.length).toBeGreaterThan(0);
        // A child who ARRIVED on a closed day reads `attended_despite_plan`, and
        // that is correct for her — the day is still shut. Both are closure
        // readings; what must not appear is an ordinary expected child.
        expect(states.every((s) => s === "closed" || s === "attended_despite_plan")).toBe(true);
        await backToRooms(page);

        /*
         * AND OPEN AGAIN. A closure that cannot be undone through the product
         * would leave a real nursery unable to correct a mistake, and would leave
         * this tenant shut for every spec that follows.
         */
        await page.locator('[data-attendance-reopen-site="true"]').click();
        await page.waitForTimeout(COMMAND);
        await shot(page, "E3-reopened");

        await expect(page.locator('[data-attendance-closed="true"]')).toHaveCount(0, { timeout: SETTLE });
        const reopened = await metrics(page);
        expect(reopened["Expected"]).toBe(before["Expected"]);
        expect(reopened["Not arrived"]).toBe(before["Not arrived"]);
    });
});
