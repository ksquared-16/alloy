import * as path from "path";
import { config as loadEnv } from "dotenv";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const VIEWPORTS = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "laptop", width: 1366, height: 768 },
    { name: "wide", width: 1728, height: 1000 },
] as const;
const CONFIGURATION_DIRECT_LINKS = [
    "/settings/commercial",
    "/settings/users-roles",
    "/organization/communications",
    "/settings/entities",
    "/settings/processes",
    "/settings/surfaces",
    "/admin/workflows",
    "/settings/calculations",
    "/settings/fields",
    "/settings/statuses",
] as const;
const managedStorageState = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();

test.use(managedStorageState ? { storageState: managedStorageState } : {});

async function expectEqualHeights(objects: Locator) {
    const heights = await objects.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(heights.length).toBeGreaterThan(0);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
}

async function expectNoClippedContent(objects: Locator) {
    const clipped = await objects.evaluateAll((elements) =>
        elements
            .filter((element) => element.scrollHeight > element.clientHeight + 2)
            .map((element) => element.getAttribute("data-testid")),
    );
    expect(clipped).toEqual([]);
}

async function openRoute(page: Page, path: string, testId: string) {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?.*)?$`), {
        timeout: 120_000,
    });
    await expect(page.getByRole("progressbar", { name: "Preparing workspace" })).toHaveCount(0, {
        timeout: 120_000,
    });
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: 60_000 });
}

test.describe("configuration-runtime-top-level-landings", () => {
    test("Organization catalog and Locations collection remain responsive", async ({ page }, testInfo) => {
        test.setTimeout(600_000);
        if (!managedStorageState) await ensureAdminPlaywrightSession(page);
        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];
        page.on("console", (message) => {
            if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("requestfailed", (request) => {
            const errorText = request.failure()?.errorText ?? "";
            if (errorText === "net::ERR_ABORTED") return;
            failedRequests.push(`${request.method()} ${request.url()} ${errorText}`);
        });

        for (const viewport of VIEWPORTS) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });

            await openRoute(page, "/organization", "organization-configuration-page");
            const domains = page.locator('[data-testid^="organization-domain-"]');
            await expect(domains).toHaveCount(9);
            await expectEqualHeights(domains);
            await expectNoClippedContent(domains);
            await expect(page.getByTestId("organization-consumers")).toBeVisible({ timeout: 60_000 });
            await expect(page.getByTestId("organization-distribution")).toBeVisible({ timeout: 60_000 });

            const organizationGrid = page.getByTestId("organization-configuration-domains");
            expect(
                await organizationGrid.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
            ).toBe(true);

            if (viewport.name === "desktop") {
                const lastDomain = await domains.last().boundingBox();
                expect(lastDomain).not.toBeNull();
                expect((lastDomain?.y ?? 0) + (lastDomain?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
            }

            await page.screenshot({
                path: testInfo.outputPath(`organization-${viewport.name}.png`),
                fullPage: true,
                animations: "disabled",
            });

            await openRoute(page, "/settings/locations", "locations-landing");
            await expect(page.getByTestId("locations-collection-posture")).toBeVisible();
            await expect(page.getByTestId("locations-operational-summary")).toBeVisible();
            await expect(page.getByTestId("locations-attention-list")).toBeVisible();
            await expect(page.getByTestId("locations-search")).toBeVisible();
            await expect(page.getByTestId("locations-show-inactive")).toBeVisible();
            await expect(page.getByTestId("locations-add-location")).toBeVisible();
            const attentionActions = page.locator(
                'button[data-testid^="locations-attention-"]:not([data-testid="locations-attention-toggle"])',
            );
            expect(await attentionActions.count()).toBeLessThanOrEqual(5);
            if (await page.getByTestId("locations-attention-toggle").isVisible()) {
                await expect(attentionActions).toHaveCount(5);
            }

            const signalCards = page.locator(
                '[data-testid="locations-readiness"], [data-testid="locations-attention-summary"], [data-testid="locations-inventory"]',
            );
            await expect(signalCards).toHaveCount(3);
            await expectEqualHeights(signalCards);
            await expectNoClippedContent(signalCards);

            const locationRows = page.locator('[data-testid^="locations-row-"]');
            expect(await locationRows.count()).toBeGreaterThan(0);
            await expectNoClippedContent(locationRows);
            await expect(locationRows.last()).toBeVisible();
            await expect(page.getByTestId("locations-list")).toHaveAttribute("data-scroll-mode", "natural");

            const contentColumn = page.getByTestId("locations-content-column");
            const landing = page.getByTestId("locations-landing");
            const [contentBox, landingBox] = await Promise.all([contentColumn.boundingBox(), landing.boundingBox()]);
            expect(contentBox).not.toBeNull();
            expect(landingBox).not.toBeNull();
            expect(Math.abs((contentBox?.width ?? 0) - (landingBox?.width ?? 0))).toBeLessThanOrEqual(40);
            expect(Math.abs((contentBox?.x ?? 0) - (landingBox?.x ?? 0))).toBeLessThanOrEqual(24);

            const summaryBox = await page.getByTestId("locations-operational-summary").boundingBox();
            const attentionBox = await page.getByTestId("locations-attention-list").boundingBox();
            const listBox = await page.getByTestId("locations-list-card").boundingBox();
            expect(summaryBox).not.toBeNull();
            expect(attentionBox).not.toBeNull();
            expect(listBox).not.toBeNull();
            expect(listBox?.y ?? 0).toBeGreaterThan((summaryBox?.y ?? 0) + (summaryBox?.height ?? 0) - 1);
            expect(Math.abs((listBox?.y ?? 0) - (attentionBox?.y ?? 0))).toBeLessThanOrEqual(1);
            if (viewport.width >= 1366) {
                expect((listBox?.width ?? 0) / (attentionBox?.width ?? Infinity)).toBeGreaterThan(1.5);
                expect((listBox?.width ?? Infinity) / (attentionBox?.width ?? 1)).toBeLessThan(2.25);
            }
            const rowHeights = await locationRows.evaluateAll((rows) =>
                rows.map((row) => row.getBoundingClientRect().height),
            );
            expect(Math.min(...rowHeights)).toBeGreaterThanOrEqual(68);
            expect(Math.max(...rowHeights)).toBeLessThanOrEqual(80);
            expect(await landing.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

            await page.screenshot({
                path: testInfo.outputPath(`locations-${viewport.name}.png`),
                fullPage: true,
                animations: "disabled",
            });

            if (viewport.name === "desktop") {
                expect(
                    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2),
                ).toBe(true);
                await locationRows.first().click();
                await expect(page.getByTestId("locations-selected-location")).toBeVisible({
                    timeout: 60_000,
                });
            }
        }

        for (const path of CONFIGURATION_DIRECT_LINKS) {
            const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
            expect(response?.status() ?? 500).toBeLessThan(400);
            await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?.*)?$`), {
                timeout: 120_000,
            });
            await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
        }

        expect(consoleErrors).toEqual([]);
        expect(failedRequests).toEqual([]);
    });
});
