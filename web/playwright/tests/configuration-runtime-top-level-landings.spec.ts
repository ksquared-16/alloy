import * as path from "path";
import { config as loadEnv } from "dotenv";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const VIEWPORTS = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "laptop", width: 1366, height: 768 },
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
    await expect(page.getByTestId(testId)).toBeVisible({ timeout: 60_000 });
}

test.describe("configuration-runtime-top-level-landings", () => {
    test("Organization and Locations stay dense, equal-height, and responsive", async ({ page }, testInfo) => {
        test.setTimeout(600_000);
        if (!managedStorageState) await ensureAdminPlaywrightSession(page);

        for (const viewport of VIEWPORTS) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });

            await openRoute(page, "/settings/organization", "organization-configuration-page");
            const domains = page.locator('[data-testid^="organization-domain-"]');
            await expect(domains).toHaveCount(9);
            await expectEqualHeights(domains);
            await expectNoClippedContent(domains);
            await expect(page.getByTestId("organization-consumers")).toBeVisible();
            await expect(page.getByTestId("organization-distribution")).toBeVisible();

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

            await openRoute(page, "/settings/locations", "locations-fleet-landing");
            await expect(page.getByTestId("locations-fleet-posture")).toBeVisible();
            await expect(page.getByTestId("locations-fleet-search")).toBeVisible();
            await expect(page.getByTestId("locations-fleet-show-inactive")).toBeVisible();
            await expect(page.getByTestId("locations-fleet-add-location")).toBeVisible();

            const locationTiles = page.locator('[data-testid^="locations-fleet-tile-"]');
            expect(await locationTiles.count()).toBeGreaterThan(0);
            await expectEqualHeights(locationTiles);
            await expectNoClippedContent(locationTiles);
            await expect(page.getByTestId("locations-fleet-attention-list")).toBeVisible();
            await expect(page.getByTestId("locations-fleet-summary")).toBeVisible();

            const fleetSurfaceBox = await page.getByTestId("locations-fleet-surface").boundingBox();
            const fleetSummaryBox = await page.getByTestId("locations-fleet-supporting-summary").boundingBox();
            expect(fleetSurfaceBox).not.toBeNull();
            expect(fleetSummaryBox).not.toBeNull();
            expect(fleetSummaryBox?.x ?? 0).toBeGreaterThan(
                (fleetSurfaceBox?.x ?? 0) + (fleetSurfaceBox?.width ?? 0) - 1,
            );

            const fleetScroll = page.getByTestId("locations-fleet-scroll");
            expect(
                await fleetScroll.evaluate((element) => ({
                    overflowY: getComputedStyle(element).overflowY,
                    maxHeight: getComputedStyle(element).maxHeight,
                })),
            ).toMatchObject({ overflowY: "auto" });

            const locationsGrid = page.getByTestId("locations-fleet-grid");
            expect(
                await locationsGrid.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
            ).toBe(true);

            await page.screenshot({
                path: testInfo.outputPath(`locations-${viewport.name}.png`),
                fullPage: true,
                animations: "disabled",
            });

            if (viewport.name === "desktop") {
                await locationTiles.first().click();
                await expect(page.getByTestId("locations-selected-location")).toBeVisible({
                    timeout: 60_000,
                });
            }
        }
    });
});
