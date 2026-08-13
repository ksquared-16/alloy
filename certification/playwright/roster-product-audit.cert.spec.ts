import { test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * ROSTER PRODUCT AUDIT — Stage 1 evidence, not a certification.
 *
 * Drives the four Assignments Work tabs the way a director would and records what
 * the product actually shows: payload shape and size, latency, what is on screen,
 * and what a date/site change costs. Nothing here asserts a verdict; the point is
 * to make the Stage 1 product recommendation falsifiable against real browser
 * behaviour instead of a reading of the source.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "roster-product-audit");
const SETTLE = 120_000;
const SCHEDULING = "[data-adminv2-scheduling-workspace]";
const TODDLER = "00000000-0000-4000-8000-000000000013";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));
const shot = (page: Page, name: string) =>
    page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

type Net = { url: string; ms: number; bytes: number; status: number };

function trackNetwork(page: Page): Net[] {
    const calls: Net[] = [];
    const started = new Map<string, number>();
    page.on("request", (r) => started.set(r.url(), Date.now()));
    page.on("response", async (r) => {
        const u = r.url();
        if (!u.includes("/api/admin/")) return;
        const t0 = started.get(u) ?? Date.now();
        let bytes = 0;
        try {
            bytes = (await r.body()).byteLength;
        } catch {
            /* streamed/aborted */
        }
        calls.push({ url: u.replace(/^https?:\/\/[^/]+/, ""), ms: Date.now() - t0, bytes, status: r.status() });
    });
    return calls;
}

async function openWorkspace(page: Page, workView: string) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate((view) => {
        sessionStorage.setItem(
            "alloy.assignments.workspace.deeplink",
            JSON.stringify({ mode: "work", workView: view }),
        );
    }, workView);
    await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();
    await page.locator(SCHEDULING).waitFor({ timeout: SETTLE });
}

async function pickSite(page: Page, name: string) {
    const sitePicker = page.locator('button[aria-label="Site"]').first();
    await sitePicker.click();
    await page.locator("[role=option]", { hasText: name }).first().click();
    await page.waitForTimeout(3000);
}

function log(label: string, payload: unknown) {
    console.log(`[AUDIT ${label}] ${JSON.stringify(payload, null, 2)}`);
}

test("roster product audit — daily roster", async ({ page }) => {
    const net = trackNetwork(page);
    await openWorkspace(page, "daily_roster");
    await pickSite(page, "Riverside");
    await page.locator("[data-daily-roster]").waitFor({ timeout: SETTLE });
    await page.waitForTimeout(2500);
    await shot(page, "01-daily-roster-default");

    // What the surface renders, per room, as the operator sees it.
    const rooms = await page.evaluate(() =>
        [...document.querySelectorAll("[data-roster-room]")].map((el) => ({
            roomId: el.getAttribute("data-roster-room"),
            state: el.getAttribute("data-roster-state"),
            text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        })),
    );
    log("daily-roster-rooms", rooms);

    const header = await page
        .locator("[data-daily-roster] header")
        .first()
        .evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim());
    log("daily-roster-header", header);

    // Controls actually present on the surface.
    const controls = await page.evaluate(() => ({
        prevDay: !!document.querySelector("[data-roster-prev-day]"),
        nextDay: !!document.querySelector("[data-roster-next-day]"),
        datePicker: !!document.querySelector("[data-roster-date]"),
        todayButton: !!document.querySelector("[data-roster-today]"),
        weekToggle: !!document.querySelector("[data-roster-range]"),
        lensToggle: !!document.querySelector("[data-roster-lens]"),
        openAttendance: !!document.querySelector("[data-roster-open-attendance]"),
        manageAssignment: !!document.querySelector("[data-roster-manage-assignment]"),
        unroomed: !!document.querySelector("[data-roster-unroomed]"),
    }));
    log("daily-roster-controls", controls);

    // Job 2 — "who is in this room today?" Target the room that actually has
    // people; expanding an empty room proves nothing about the answer's shape.
    const toggle = page.locator(`[data-roster-room-toggle="${TODDLER}"]`);
    if (await toggle.count()) {
        await toggle.click();
        await page.waitForTimeout(800);
        await shot(page, "02-daily-roster-room-expanded");
        const expanded = await page.evaluate((id) => {
            const room = document.querySelector(`[data-roster-room="${id}"]`);
            return {
                children: [...(room?.querySelectorAll("[data-roster-child]") ?? [])].map((n) =>
                    (n.textContent ?? "").replace(/\s+/g, " ").trim(),
                ),
                staff: [...(room?.querySelectorAll("[data-roster-staff]") ?? [])].map((n) =>
                    (n.textContent ?? "").replace(/\s+/g, " ").trim(),
                ),
            };
        }, TODDLER);
        log("daily-roster-room-expanded", expanded);
    }

    // Date movement cost — next day, then a big jump.
    const before = net.length;
    const t0 = Date.now();
    await page.locator("[data-roster-next-day]").click();
    await page.waitForTimeout(3000);
    log("daily-roster-next-day", {
        wallMs: Date.now() - t0,
        newCalls: net.slice(before).map((c) => `${c.status} ${c.ms}ms ${c.bytes}b ${c.url}`),
    });
    await shot(page, "03-daily-roster-next-day");

    const afterNext = await page.evaluate(() =>
        [...document.querySelectorAll("[data-roster-room]")].map((el) => ({
            state: el.getAttribute("data-roster-state"),
            text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
        })),
    );
    log("daily-roster-after-next-day", afterNext);

    // Does room expansion survive the date change, or does context reset?
    const expansionAfterDate = await page.evaluate((id) => {
        const el = document.querySelector(`[data-roster-room="${id}"]`);
        return {
            stillExpanded: !!el?.querySelector("[data-roster-child], [data-roster-staff]"),
            toggleLabel: (el?.querySelector("[data-roster-room-toggle]")?.textContent ?? "").trim(),
        };
    }, TODDLER);
    log("expansion-survives-date-change", expansionAfterDate);

    log("network-all", net.map((c) => `${c.status} ${c.ms}ms ${c.bytes}b ${c.url}`));
});

test("roster product audit — assignments roster tab", async ({ page }) => {
    const net = trackNetwork(page);
    await openWorkspace(page, "roster");
    await pickSite(page, "Riverside");
    await page.waitForTimeout(4000);
    await shot(page, "10-roster-tab-assignments");

    const views = await page.evaluate(() =>
        [...document.querySelectorAll("[data-assignment-roster-view]")].map((el) => ({
            view: el.getAttribute("data-assignment-roster-view"),
            text: (el.textContent ?? "").trim(),
        })),
    );
    log("roster-tab-views", views);

    const roomBoard = page.locator('[data-assignment-roster-view="rooms"]');
    if (await roomBoard.count()) {
        await roomBoard.click();
        await page.waitForTimeout(3500);
        await shot(page, "11-roster-tab-room-board");
        const board = await page.evaluate(() => ({
            rooms: [...document.querySelectorAll("[data-scheduling-roster-room]")].map((el) =>
                (el.textContent ?? "").replace(/\s+/g, " ").trim(),
            ),
            cells: [...document.querySelectorAll("[data-scheduling-roster-cell]")]
                .slice(0, 12)
                .map((el) => ({
                    key: el.getAttribute("data-scheduling-roster-cell"),
                    state: el.getAttribute("data-cell-state"),
                    text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
                })),
        }));
        log("roster-tab-room-board", board);

        const firstRoom = page.locator("[data-scheduling-roster-room]").first();
        if (await firstRoom.count()) {
            await firstRoom.click();
            await page.waitForTimeout(1500);
            await shot(page, "12-roster-tab-room-detail");
            const detail = await page.evaluate(() => {
                const el = document.querySelector("[data-scheduling-room-detail]");
                return el ? (el.textContent ?? "").replace(/\s+/g, " ").trim() : null;
            });
            log("roster-tab-room-detail", detail);
        }
    }

    log("network-all", net.map((c) => `${c.status} ${c.ms}ms ${c.bytes}b ${c.url}`));
});

test("roster product audit — attendance tab and overview", async ({ page }) => {
    const net = trackNetwork(page);
    await openWorkspace(page, "attendance");
    await pickSite(page, "Riverside");
    await page.waitForTimeout(4000);
    await shot(page, "20-attendance-tab");

    const attendance = await page.evaluate(() => ({
        controls: {
            date: !!document.querySelector("[data-attendance-date]"),
            prev: !!document.querySelector("[data-attendance-prev-day]"),
            next: !!document.querySelector("[data-attendance-next-day]"),
        },
        rooms: [...document.querySelectorAll("[data-attendance-room-card]")].map((el) =>
            (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        ),
    }));
    log("attendance-tab", attendance);

    await openWorkspace(page, "overview");
    await page.waitForTimeout(3500);
    await shot(page, "21-overview-tab");
    const overview = await page.evaluate(() =>
        (document.querySelector("[data-scheduling-section]")?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 1600),
    );
    log("overview-tab", overview);

    // Where does the workspace live in navigation?
    const nav = await page.evaluate(() =>
        [...document.querySelectorAll("[data-adminv2-sidebar-modal-nav]")].map((el) => ({
            key: el.getAttribute("data-adminv2-sidebar-modal-nav"),
            label: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        })),
    );
    log("sidebar-nav", nav);

    const tabs = await page.evaluate(() =>
        [...document.querySelectorAll("[data-scheduling-tab], [data-scheduling-mode]")].map((el) => ({
            attr: el.getAttribute("data-scheduling-tab") ?? el.getAttribute("data-scheduling-mode"),
            label: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        })),
    );
    log("workspace-tabs", tabs);

    log("network-all", net.map((c) => `${c.status} ${c.ms}ms ${c.bytes}b ${c.url}`));
});
