import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * The roster must never show one campus's rooms under another campus's name.
 *
 * Found live during the Roster V1 audit: the day roster header read
 * "Northwind — Riverside Campus" while the cards below were Lakeside's rooms
 * (Infant Room B, Toddler Room B, Pre-K Room B). Switching site fires a roster
 * request per site; the header renders the newly chosen name immediately from
 * workspace state, but `DailyRoster` had no stale-response guard, so whichever
 * request finished last won the cards.
 *
 * This is the worst failure this surface can have. Every other defect makes the
 * operator work harder; this one answers "who is supposed to be here" with a
 * confident, well-formatted lie.
 *
 * The spec switches back and forth deliberately — one switch can pass by luck.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "roster-product-audit");
const SETTLE = 120_000;
const SCHEDULING = "[data-adminv2-scheduling-workspace]";

const RIVERSIDE_SITE_ID = "00000000-0000-4000-8000-000000000010";

/** Riverside owns the "A" rooms, Lakeside the "B" rooms. Disjoint by construction. */
const SITES = {
    riverside: {
        match: "Riverside",
        rooms: [
            "00000000-0000-4000-8000-000000000012", // Infant Room A
            "00000000-0000-4000-8000-000000000013", // Toddler Room A
            "00000000-0000-4000-8000-000000000014", // Preschool Room A
        ],
    },
    lakeside: {
        match: "Lakeside",
        rooms: [
            "00000000-0000-4000-8000-000000000015", // Infant Room B
            "00000000-0000-4000-8000-000000000016", // Toddler Room B
            "00000000-0000-4000-8000-000000000017", // Pre-K Room B
        ],
    },
} as const;

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function switchSiteAndRead(page: Page, site: (typeof SITES)[keyof typeof SITES]) {
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: site.match }).first().click();

    // Wait for one of THIS site's rooms — never a fixed sleep, which is exactly
    // how a half-switched surface gets snapshotted and asserted about.
    await expect(page.locator(`[data-roster-room="${site.rooms[0]}"]`)).toBeVisible({
        timeout: SETTLE,
    });

    return page.evaluate(() => {
        const surface = document.querySelector("[data-daily-roster]");
        return {
            header: (surface?.querySelector("header")?.textContent ?? "")
                .replace(/\s+/g, " ")
                .trim(),
            roomIds: [...(surface?.querySelectorAll("[data-roster-room]") ?? [])].map((el) =>
                el.getAttribute("data-roster-room"),
            ),
        };
    });
}

test("day roster never renders one site's rooms under another site's name", async ({ page }) => {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
        sessionStorage.setItem(
            "alloy.assignments.workspace.deeplink",
            JSON.stringify({ mode: "work", workView: "daily_roster" }),
        );
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();
    await page.locator(SCHEDULING).waitFor({ timeout: SETTLE });
    await page.locator("[data-daily-roster]").waitFor({ timeout: SETTLE });

    // Riverside → Lakeside → Riverside. The name and the rooms must agree every time.
    for (const key of ["riverside", "lakeside", "riverside"] as const) {
        const site = SITES[key];
        const seen = await switchSiteAndRead(page, site);
        console.log(`[CERT site-switch ${key}] ${JSON.stringify(seen)}`);

        expect(seen.header).toContain(site.match);
        // Every rendered room belongs to the named site, and none belongs to the other.
        const other = key === "riverside" ? SITES.lakeside : SITES.riverside;
        for (const id of seen.roomIds) {
            expect(site.rooms).toContain(id);
            expect(other.rooms).not.toContain(id);
        }
        expect(seen.roomIds.length).toBeGreaterThan(0);
    }

    await page.screenshot({ path: path.join(SHOTS, "50-site-switch-final.png"), fullPage: true });
});

/**
 * The same defect, forced rather than waited for.
 *
 * The loop above only catches the bug when the race window happens to be open —
 * with the guard removed it failed on a cold server and passed three times on a
 * warm one. That is not a test, it is a coin. So: switch site twice without
 * waiting for the first response, guaranteeing two roster requests in flight,
 * and require the surface to settle on the LAST site chosen.
 */
test("a second site switch mid-flight wins — the first response cannot overwrite it", async ({
    page,
}) => {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
        sessionStorage.setItem(
            "alloy.assignments.workspace.deeplink",
            JSON.stringify({ mode: "work", workView: "daily_roster" }),
        );
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();
    await page.locator(SCHEDULING).waitFor({ timeout: SETTLE });
    await page.locator("[data-daily-roster]").waitFor({ timeout: SETTLE });

    // Hold RIVERSIDE's roster response back — by site id, not by "the first request
    // we see". The workspace already fires a roster request for its default site on
    // mount, so a first-request-wins delay is spent before the test even clicks and
    // the race is never created. That version passed with the guard removed.
    let riversideHeld = false;
    await page.route("**/api/admin/roster**", async (route) => {
        const url = route.request().url();
        if (!riversideHeld && url.includes(RIVERSIDE_SITE_ID)) {
            riversideHeld = true;
            await new Promise((r) => setTimeout(r, 5000));
        }
        await route.continue();
    });

    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    // Do NOT wait — switch again while Riverside's request is still parked.
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Lakeside" }).first().click();

    // Lakeside was chosen last, so Lakeside must be what renders — after the
    // delayed Riverside response has certainly arrived.
    await expect(page.locator(`[data-roster-room="${SITES.lakeside.rooms[0]}"]`)).toBeVisible({
        timeout: SETTLE,
    });
    await page.waitForTimeout(6000);

    const settled = await page.evaluate(() => {
        const surface = document.querySelector("[data-daily-roster]");
        return {
            header: (surface?.querySelector("header")?.textContent ?? "")
                .replace(/\s+/g, " ")
                .trim(),
            roomIds: [...(surface?.querySelectorAll("[data-roster-room]") ?? [])].map((el) =>
                el.getAttribute("data-roster-room"),
            ),
        };
    });
    console.log(`[CERT site-switch raced] ${JSON.stringify(settled)}`);

    expect(settled.header).toContain("Lakeside");
    expect(settled.roomIds.length).toBeGreaterThan(0);
    for (const id of settled.roomIds) {
        expect(SITES.lakeside.rooms).toContain(id);
        expect(SITES.riverside.rooms).not.toContain(id);
    }
});

test("day roster resolves today from the org, and offers a way back to it", async ({ page }) => {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
        sessionStorage.setItem(
            "alloy.assignments.workspace.deeplink",
            JSON.stringify({ mode: "work", workView: "daily_roster" }),
        );
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();
    await page.locator(SCHEDULING).waitFor({ timeout: SETTLE });
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(page.locator(`[data-roster-room="${SITES.riverside.rooms[0]}"]`)).toBeVisible({
        timeout: SETTLE,
    });

    // The service date comes from the org, never `new Date().toISOString()`.
    const serverToday = await page.evaluate(async () => {
        const res = await fetch(
            "/api/admin/roster?site_location_id=00000000-0000-4000-8000-000000000010",
        );
        const json = await res.json();
        return json.todayYmd as string;
    });
    const dateInput = page.locator("[data-roster-date]");
    await expect(dateInput).toHaveValue(serverToday);

    // No Today control while already on today — it would be a no-op affordance.
    await expect(page.locator("[data-roster-today]")).toHaveCount(0);

    // Move away, and it appears and returns.
    await page.locator("[data-roster-next-day]").click();
    await expect(dateInput).not.toHaveValue(serverToday);
    await expect(page.locator("[data-roster-today]")).toBeVisible({ timeout: SETTLE });
    await page.locator("[data-roster-today]").click();
    await expect(dateInput).toHaveValue(serverToday);
});
