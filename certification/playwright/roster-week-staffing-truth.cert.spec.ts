import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * ROSTER PRODUCT AUDIT, pass 3 — does the WEEK board tell the truth about staffing?
 *
 * The cert tenant already contains the decisive case without any mutation: children
 * are assigned to Toddler Room A from 2026-01-05, but the only staff assignment
 * starts 2026-08-01. Any week in July therefore has expected children and ZERO
 * scheduled staff.
 *
 * The read model computes `staffingSufficiency` for exactly this. This pass reads
 * what the API says for that week and what the board renders for the same cells,
 * side by side. If they disagree, the week surface is not a staffing surface.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "roster-product-audit");
const SETTLE = 120_000;
const SCHEDULING = "[data-adminv2-scheduling-workspace]";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const TODDLER = "00000000-0000-4000-8000-000000000013";
const PAST_WEEK = "2026-07-06"; // Monday, before the staff assignment starts

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));
const shot = (page: Page, name: string) =>
    page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const log = (label: string, payload: unknown) =>
    console.log(`[AUDIT ${label}] ${JSON.stringify(payload, null, 2)}`);

test("roster product audit — week board vs the staffing verdict it is served", async ({ page }) => {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
        sessionStorage.setItem(
            "alloy.assignments.workspace.deeplink",
            JSON.stringify({ mode: "work", workView: "roster" }),
        );
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();
    await page.locator(SCHEDULING).waitFor({ timeout: SETTLE });
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    // Wait for the surface, not for a clock. This host runs at load 30+ and every
    // fixed sleep in this file was eventually short enough to snapshot a
    // half-loaded board and assert about it.
    await expect(page.locator("[data-roster-range]")).toBeVisible({ timeout: SETTLE });

    // What the API serves for the week the staff assignment does not cover.
    const api = await page.evaluate(
        async ([site, week, room]) => {
            const res = await fetch(
                `/api/admin/scheduling?view=roster&site_location_id=${site}&week_of=${week}`,
            );
            const json = await res.json();
            const roster = json.roster ?? json;
            const target = (roster.rooms ?? []).find(
                (r: { roomId: string }) => r.roomId === room,
            );
            return {
                siteVerdict: roster.staffingSufficiency ?? null,
                weekLabel: roster.weekLabel,
                room: target
                    ? {
                          roomName: target.roomName,
                          health: target.health,
                          cells: target.cells.map(
                              (c: Record<string, unknown>) => ({
                                  day: c.dayLabel,
                                  occupancy: c.occupancy,
                                  requiredStaff: c.requiredStaff,
                                  scheduledStaffCount: c.scheduledStaffCount,
                                  staffingSufficiency: c.staffingSufficiency,
                                  ratioLabel: c.ratioLabel,
                                  tone: c.tone,
                                  state: c.state ?? null,
                              }),
                          ),
                      }
                    : null,
            };
        },
        [RIVERSIDE, PAST_WEEK, TODDLER] as const,
    );
    log("api-week-of-2026-07-06", api);

    // What the BOARD renders for the same week.
    await page.locator('[data-roster-range-option="week"]').click();
    await expect(page.locator(`[data-scheduling-roster-room="${TODDLER}"]`)).toBeVisible({
        timeout: SETTLE,
    });

    // Jump straight to the week, never by counting clicks: the label lags the fetch,
    // so a "click prev until it reads July" loop silently settles on the wrong week
    // and then asserts confidently about it. It settled on Jul 20 once and the
    // failure looked like a product bug.
    await page.locator("[data-week-picker-trigger]").first().click();
    await page.locator(`[data-week-picker-option="${PAST_WEEK}"]`).click();
    await expect(page.locator("[data-roster-week-label]").first()).toHaveText(/Jul 6/, {
        timeout: SETTLE,
    });

    // And wait for the week's DATA, not just its label: the label is set from the
    // request that was asked for, the cells from the one that came back.
    const toddlerCells = page.locator(`[data-scheduling-roster-cell^="${TODDLER}:"]`);
    await expect(toddlerCells).toHaveCount(5, { timeout: SETTLE });
    await expect(toddlerCells.first()).toHaveAttribute("data-cell-scheduled-staff", "0", {
        timeout: SETTLE,
    });
    await shot(page, "40-week-board-july");

    const board = await page.evaluate((room) => {
        const cells = [...document.querySelectorAll(`[data-scheduling-roster-cell^="${room}:"]`)].map(
            (el) => ({
                key: el.getAttribute("data-scheduling-roster-cell"),
                state: el.getAttribute("data-cell-state"),
                staffing: el.getAttribute("data-cell-staffing"),
                scheduledStaff: el.getAttribute("data-cell-scheduled-staff"),
                rendered: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
            }),
        );
        const header = document.querySelector(`[data-scheduling-roster-room="${room}"]`);
        return {
            weekLabel: (
                document.querySelector("[data-roster-week-label]")?.textContent ?? ""
            ).trim(),
            roomStaffing:
                header
                    ?.querySelector("[data-scheduling-roster-room-staffing]")
                    ?.getAttribute("data-scheduling-roster-room-staffing") ?? null,
            roomHeader: (header?.textContent ?? "").replace(/\s+/g, " ").trim(),
            cells,
        };
    }, TODDLER);
    log("board-rendered-july", board);

    // ── The assertion this spec exists for ────────────────────────────────────
    //
    // The read model, the API and the board must agree. They did not: the API
    // answered `short` for all five days while the board rendered a
    // capacity-derived "Healthy" chip and the words "1 staff" — the room's
    // staffing DEMAND, presented where an operator reads supply.
    expect(board.weekLabel).toContain("Jul 6");
    expect(api.room?.cells.map((c) => c.staffingSufficiency)).toEqual([
        "short",
        "short",
        "short",
        "short",
        "short",
    ]);

    // Every rendered day carries the served verdict, not just the demand number.
    expect(board.cells).toHaveLength(5);
    for (const cell of board.cells) {
        expect(cell.staffing).toBe("short");
        expect(cell.scheduledStaff).toBe("0");
        expect(cell.rendered).toContain("0 of 1 staff");
    }

    // The room rolls up short, and nothing on the row claims the room is fine.
    expect(board.roomStaffing).toBe("short");
    expect(board.roomHeader).toContain("Short");
    expect(board.roomHeader).not.toContain("Healthy");
});
