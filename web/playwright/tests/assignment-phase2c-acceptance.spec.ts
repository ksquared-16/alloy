/**
 * Assignment Platform Phase 2C — operator experience completion (browser).
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const SHOT_DIR =
    process.env.ASSIGNMENT_P2C_SHOT_DIR ||
    `${process.env.HOME}/.local/state/alloy-dev/evidence/wt5-assignment-platform-phase-2/p2c-shots`;

async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

async function openKurzman(page: Page) {
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const site = page.locator(
        'combobox[aria-label="Site filter"], select[aria-label="Site filter"], [aria-label="Site filter"]'
    );
    if (await site.count()) {
        await site
            .first()
            .selectOption({ label: "North Campus" })
            .catch(async () => {
                await site.first().click().catch(() => {});
                await page.getByRole("option", { name: "North Campus" }).click().catch(() => {});
            });
        await page.waitForTimeout(2500);
    }

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

    const queueRow = page.getByRole("button", { name: /Kurzman Family/i }).first();
    if (await queueRow.count()) {
        await queueRow.click();
        await page.waitForTimeout(6000);
    }

    const schedCard = page.locator('[data-universal-card-key="scheduling"], [data-scheduling-card="true"]');
    if ((await schedCard.count()) === 0) {
        await page.getByRole("button", { name: /View children/i }).first().click().catch(() => {});
        await page.waitForTimeout(2000);
        const scheduleLink = page.getByRole("button", { name: /Schedule/i }).first();
        if (await scheduleLink.count()) {
            await scheduleLink.click({ force: true });
            await page.waitForTimeout(2500);
        }
    }

    const target = page
        .locator("[data-scheduling-card='true'], [data-scheduling-open], [data-schedule-surface='true']")
        .first();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.waitFor({ timeout: 45000 });
}

test.describe("Assignment Platform Phase 2C acceptance", () => {
    test("Workspace + Focus Panel Assignment operator experience", async ({ page }) => {
        test.setTimeout(300000);
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));

        await page.goto("/workspace", { waitUntil: "domcontentloaded" });
        const trigger = page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').first();
        await trigger.waitFor({ timeout: 90000 });
        await trigger.click({ force: true });
        const modal = page.locator('[data-adminv2-scheduling-modal="true"]');
        await modal.waitFor({ timeout: 60000 });
        await page
            .locator('[data-scheduling-overview="true"], [data-testid="scheduling-overview"]')
            .first()
            .waitFor({ timeout: 30000 })
            .catch(() => {});
        const overviewText = await modal.innerText();
        expect(overviewText).toMatch(/Assignment attention|Missing assignments|Upcoming assignments|Schedul/i);
        await snap(page, "R01-assignment-overview");
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(500);

        await openKurzman(page);
        await snap(page, "S01-scheduling-card-summary");

        const summaryLine = page.locator("[data-scheduling-summary]").first();
        if ((await summaryLine.count()) > 0) {
            const line = await summaryLine.innerText();
            expect(line).not.toMatch(/\bfrom Aug\b|\bfrom Sep\b|Monday–Friday/);
            expect(line).toMatch(/·/);
        }

        const openers = page.locator("[data-scheduling-open]");
        expect(await openers.count(), "at least one child schedule opener").toBeGreaterThan(0);
        await openers.first().click({ force: true });
        await page.locator('[data-assignment-list="true"], [data-assignment-summary], [data-schedule-surface="true"]').first().waitFor({
            timeout: 8000,
        });
        await snap(page, "S02-assignment-list");

        expect(await page.locator("[data-assignment-create-gated]").count()).toBe(0);
        expect(await page.locator("[data-schedule-create-new]").count()).toBeGreaterThan(0);

        const assignmentRows = await page.locator("[data-assignment-row]").count();
        // Day filter sits above the list (timeline under the list was removed).
        expect(await page.locator("[data-assignment-day-filter]").count()).toBeGreaterThan(0);
        if (assignmentRows > 0) {
            await page.locator("[data-assignment-row]").first().click();
            await page.locator("[data-assignment-detail]").first().waitFor({ timeout: 8000 });
            await snap(page, "S03-assignment-detail");
            expect(await page.locator("[data-assignment-detail-grid]").count()).toBeGreaterThan(0);
            const detailText = await page.locator("[data-assignment-detail]").innerText();
            expect(detailText).toMatch(/Assignment Category|Room|Days|Time|Starts|Ends/i);

            await page.locator('[data-schedule-back="true"]').click();
            await page.locator("[data-assignment-summary], [data-assignment-list]").first().waitFor({
                timeout: 5000,
            });
        }

        // Create path: Add assignment → type picker (when types exist) or editor
        await page.locator("[data-schedule-create-new]").first().click({ force: true });
        await page.waitForTimeout(1500);
        await snap(page, "S04-create-path");
        const picker = page.locator("[data-assignment-type-picker]");
        const editor = page.locator("[data-schedule-editor]");
        const createPathOk = (await picker.count()) + (await editor.count()) > 0;
        expect(createPathOk, "create opens type picker or schedule editor").toBeTruthy();
        if ((await picker.count()) > 0) {
            const opts = page.locator("[data-assignment-type-option]");
            if ((await opts.count()) > 0) {
                await opts.first().click();
                await page.waitForTimeout(800);
                await snap(page, "S05-editor-after-type");
                expect(await page.locator("[data-schedule-editor]").count()).toBeGreaterThan(0);
            } else {
                test.info().annotations.push({
                    type: "note",
                    description: "Type picker empty — operational_assignment_types not migrated on this DB",
                });
            }
        }

        const realErrors = [...new Set(errors)].filter((e) => !/Hydration failed|didn't match/i.test(e));
        expect(realErrors, "no real page errors").toEqual([]);
    });
});
