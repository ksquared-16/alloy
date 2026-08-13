import { test, type Page } from "@playwright/test";
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
    await page.waitForTimeout(3000);

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
    await page.locator('[data-assignment-roster-view="rooms"]').click();
    await page.waitForTimeout(2500);
    for (let i = 0; i < 6; i += 1) {
        await page.locator("[data-week-picker-prev]").first().click();
        await page.waitForTimeout(1200);
        const label = await page.locator("[data-roster-week-label]").first().textContent();
        if (label && label.includes("Jul 6")) break;
    }
    await page.waitForTimeout(2000);
    await shot(page, "40-week-board-july");

    const board = await page.evaluate((room) => {
        const cells = [...document.querySelectorAll(`[data-scheduling-roster-cell^="${room}:"]`)].map(
            (el) => ({
                key: el.getAttribute("data-scheduling-roster-cell"),
                state: el.getAttribute("data-cell-state"),
                rendered: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
            }),
        );
        const header = document.querySelector(`[data-scheduling-roster-room="${room}"]`);
        return {
            weekLabel: (
                document.querySelector("[data-roster-week-label]")?.textContent ?? ""
            ).trim(),
            roomHeader: (header?.textContent ?? "").replace(/\s+/g, " ").trim(),
            cells,
        };
    }, TODDLER);
    log("board-rendered-july", board);
});
