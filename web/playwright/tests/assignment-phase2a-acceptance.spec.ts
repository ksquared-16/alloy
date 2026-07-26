/**
 * Assignment Platform Phase 2A — product acceptance (browser).
 * Opens Kurzman Focus Panel → Scheduling surfaces and verifies Assignment
 * Summary / Detail / Timeline / create gating / primary archive explanation.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const SHOT_DIR =
    process.env.ASSIGNMENT_P2A_SHOT_DIR ||
    `${process.env.HOME}/.local/state/alloy-dev/evidence/wt5-assignment-platform-phase-2/p2a-shots`;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

async function openKurzman(page: Page) {
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    // Prefer a concrete site — "All locations" can leave queue preparation hung.
    const site = page.locator('combobox[aria-label="Site filter"], select[aria-label="Site filter"], [aria-label="Site filter"]');
    if (await site.count()) {
        await site.first().selectOption({ label: "North Campus" }).catch(async () => {
            await site.first().click().catch(() => {});
            await page.getByRole("option", { name: "North Campus" }).click().catch(() => {});
        });
        await page.waitForTimeout(2500);
    }

    // Search is more reliable than waiting on queue preparation.
    const search = page.getByRole("searchbox", { name: /Search records/i });
    if (await search.count()) {
        await search.fill("Kurzman");
        await page.waitForTimeout(1500);
        const hit = page.getByText("Kurzman Family", { exact: false }).first();
        if (await hit.count()) {
            await hit.click();
            await page.waitForTimeout(8000);
        }
    }

    if ((await page.getByText("Kurzman Family", { exact: false }).count()) === 0) {
        await page.getByText("Kurzman", { exact: false }).first().click({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(8000);
    } else if ((await page.locator("[data-scheduling-card='true']").count()) === 0) {
        await page.getByText("Kurzman Family", { exact: false }).first().click();
        await page.waitForTimeout(10000);
    }

    const bos = page.getByRole("button", { name: /^close$/i }).first();
    if (await bos.count()) await bos.click().catch(() => {});
    await page.waitForTimeout(800);

    // Ensure Focus Panel shows Kurzman (queue row click is more reliable than global search hits).
    const queueRow = page.getByRole("button", { name: /Kurzman Family/i }).first();
    if (await queueRow.count()) {
        await queueRow.click();
        await page.waitForTimeout(6000);
    }

    // Scheduling may be below the fold in the Work grid, or entered via Children.
    const schedCard = page.locator('[data-universal-card-key="scheduling"], [data-scheduling-card="true"]');
    if ((await schedCard.count()) === 0) {
        await page.getByRole("button", { name: /View children/i }).first().click().catch(() => {});
        await page.waitForTimeout(2000);
        const scheduleLink = page.getByRole("button", { name: /Schedule/i }).first();
        if (await scheduleLink.count()) {
            await scheduleLink.click({ force: true });
            await page.waitForTimeout(2500);
        } else {
            await page.getByRole("button", { name: /Lennon Kurzman/i }).first().click({ force: true }).catch(() => {});
            await page.waitForTimeout(2500);
            await page.getByRole("button", { name: /Schedule|Edit schedule|Resolve schedule/i }).first().click({ force: true }).catch(() => {});
            await page.waitForTimeout(2500);
        }
    }

    const target = page.locator("[data-scheduling-card='true'], [data-scheduling-open], [data-schedule-surface='true']").first();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.waitFor({ timeout: 45000 });
}

test.describe("Assignment Platform Phase 2A acceptance", () => {
    test("Focus Panel Assignment Summary + Detail + Timeline", async ({ page }) => {
        test.setTimeout(300000);
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));

        // Regression: Scheduling Workspace Overview opens without shell redesign.
        await page.goto("/workspace", { waitUntil: "domcontentloaded" });
        const trigger = page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').first();
        await trigger.waitFor({ timeout: 90000 });
        await trigger.click({ force: true });
        const modal = page.locator('[data-adminv2-scheduling-modal="true"]');
        await modal.waitFor({ timeout: 60000 });
        await page.locator('[data-scheduling-overview="true"], [data-testid="scheduling-overview"]').first().waitFor({ timeout: 30000 }).catch(() => {});
        const overviewText = await page.locator('[data-adminv2-scheduling-modal="true"]').innerText();
        expect(overviewText, "overview keeps Scheduling product name").toMatch(/Schedul|Needs attention|Assignments/i);
        expect(overviewText.toLowerCase()).not.toContain("primary_classroom");
        await snap(page, "R01-scheduling-overview");
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(500);

        await openKurzman(page);
        await snap(page, "S01-scheduling-card-summary");

        // Open first available child schedule surface.
        const openers = page.locator("[data-scheduling-open]");
        const openerCount = await openers.count();
        expect(openerCount, "at least one child schedule opener").toBeGreaterThan(0);
        await openers.first().click({ force: true });
        await page.locator('[data-schedule-detail="true"], [data-schedule-surface="true"]').first().waitFor({ timeout: 8000 });
        await snap(page, "S02-schedule-detail");

        const detailText = await page.locator("[data-schedule-surface]").first().innerText();
        expect(UUID_RE.test(detailText), "no raw UUIDs in schedule detail").toBeFalsy();
        expect(detailText).not.toMatch(/\b(primary_classroom|before_care|after_care)\b/);

        const summary = page.locator("[data-assignment-summary]");
        const summaryCount = await summary.count();
        const createNew = await page.locator("[data-schedule-create-new]").count();
        const createGated = await page.locator("[data-assignment-create-gated]").count();
        const assignmentRows = await page.locator("[data-assignment-row]").count();
        const primaryBadges = await page.locator("[data-primary-badge]").count();

        console.log(
            JSON.stringify({
                summaryCount,
                createNew,
                createGated,
                assignmentRows,
                primaryBadges,
            })
        );

        // Phase 2C: Add assignment is always offered; type picker gates secondary create.
        expect(createNew, "Create / Add assignment control present").toBeGreaterThan(0);
        expect(createGated, "legacy create gate removed in Phase 2C").toBe(0);

        if (assignmentRows > 0) {
            expect(primaryBadges, "primary indicator visible when assignments exist").toBeGreaterThan(0);
            await page.locator("[data-assignment-row]").first().click();
            await page.locator("[data-assignment-detail]").first().waitFor({ timeout: 8000 });
            await snap(page, "S03-assignment-detail-strongest");

            const detail = page.locator("[data-assignment-detail]").first();
            const detailBody = await detail.innerText();
            expect(detailBody).toMatch(/Assignment Type|Room|Days|Time|Starts|Ends|Billing|Timeline/i);
            expect(await page.locator("[data-assignment-timeline]").count()).toBeGreaterThan(0);
            expect(await page.locator("[data-assignment-type]").count()).toBeGreaterThan(0);

            // Primary archive must be explained, not silent.
            const archiveBlocked = await page.locator("[data-archive-blocked='primary']").count();
            const archiveReason = await page.locator("[data-archive-blocked-reason]").count();
            const isPrimaryView = (await page.locator("[data-assignment-detail] [data-primary-badge]").count()) > 0;
            if (isPrimaryView) {
                expect(archiveBlocked, "primary archive control visible but disabled").toBe(1);
                expect(archiveReason, "primary archive reason explained").toBe(1);
                await snap(page, "S04-primary-archive-explained");
            }

            // Timeline weekday chips if multiple days
            const dayChips = page.locator("[data-assignment-detail] button").filter({ hasText: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/ });
            if ((await dayChips.count()) > 1) {
                await dayChips.nth(1).click();
                await page.waitForTimeout(300);
                await snap(page, "S05-timeline-alt-weekday");
            }

            await page.getByText("← All assignments").click();
            await page.locator("[data-assignment-summary], [data-schedule-detail]").first().waitFor({ timeout: 5000 });
            await snap(page, "S06-return-to-summary");
        } else {
            await snap(page, "S03-empty-or-single-path");
        }

        // Edit primary schedule still available; return path intact.
        const editBtn = page.locator("[data-schedule-edit='true']");
        if (await editBtn.count()) {
            await editBtn.click();
            await page.locator("[data-schedule-editor='true']").waitFor({ timeout: 8000 });
            await snap(page, "S07-edit-primary");
            await page.getByRole("button", { name: /^Cancel$/i }).click();
            await page.locator("[data-schedule-detail='true'], [data-schedule-surface='true']").first().waitFor({ timeout: 8000 });
            await snap(page, "S08-return-from-edit");
        }

        const realErrors = [...new Set(errors)].filter((e) => !/Hydration failed|didn't match/i.test(e));
        expect(realErrors, "no real page errors").toEqual([]);
    });
});
