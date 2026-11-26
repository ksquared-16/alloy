import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/workspace-v3-operational-command-center/mockups/baseline",
);

const ENROLLMENT_WU_PATH = "/workspace/work-unit/enrollment-pipeline";
const NEW_LEADS_SLUG = "new-leads";

async function resolveFocusPanelRecordUrl(page: import("@playwright/test").Page): Promise<string | null> {
    const slugRes = await page.request.get(
        `/api/admin/work-units/by-slug/${encodeURIComponent(NEW_LEADS_SLUG)}`,
    );
    if (slugRes.ok()) {
        const slugJson = (await slugRes.json()) as { work_unit_id?: string };
        const workUnitId = slugJson.work_unit_id?.trim();
        if (workUnitId) {
            const queuesRes = await page.request.get(
                `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?limit=1`,
            );
            if (queuesRes.ok()) {
                const queuesJson = (await queuesRes.json()) as {
                    lanes?: Array<{ items?: Array<{ id?: string }> }>;
                };
                for (const lane of queuesJson.lanes ?? []) {
                    const first = lane.items?.[0]?.id?.trim();
                    if (first) {
                        return `/workspace/work-unit/${NEW_LEADS_SLUG}/${first}`;
                    }
                }
            }
        }
    }

    const searchRes = await page.request.get("/api/admin/global-search?q=household&limit=20");
    if (searchRes.ok()) {
        const searchJson = (await searchRes.json()) as {
            results?: Array<{ entity_type?: string; id?: string }>;
        };
        const opp = searchJson.results?.find((r) => r.entity_type === "opportunity" && r.id);
        if (opp?.id) {
            return `/workspace/work-unit/${NEW_LEADS_SLUG}/${opp.id}`;
        }
    }

    return null;
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Workspace ↔ Work Unit continuity baselines (System 5)", () => {
    test("captures current Workspace, Work Unit, Queue, and Focus Panel", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        // 1 — Current Workspace
        await page.goto("/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(
            page
                .locator(
                    '[data-workspace-org-title="true"], [data-ws-business-process-grid], [data-adminv2-workspace-root-shell="true"]',
                )
                .first(),
        ).toBeVisible({ timeout: 120_000 });
        await page.waitForTimeout(2500);
        await page.screenshot({
            path: path.join(screenshotDir, "01-workspace-current-system5.png"),
            fullPage: true,
            animations: "disabled",
        });

        // 2 — Current Work Unit (System 5 context bar + operational mode)
        await page.goto(ENROLLMENT_WU_PATH, { waitUntil: "domcontentloaded", timeout: 120_000 });
        if (!page.url().includes("/work-unit/")) {
            const enrollmentTile = page.locator('[data-ws-business-process-tile="true"]').first();
            if (await enrollmentTile.isVisible().catch(() => false)) {
                await enrollmentTile.click();
                await page.waitForURL(/\/workspace\/work-unit\//, { timeout: 120_000 });
            }
        }
        await expect(page.locator('[data-ws-surface="work_unit"]')).toBeVisible({ timeout: 90_000 });

        const contextBar = page.locator(
            '[data-alloy-os-work-unit-context="true"], [data-work-unit-operational-header="true"]',
        );
        await expect(contextBar.first()).toBeVisible({ timeout: 90_000 });

        await page.waitForTimeout(2000);
        await page.screenshot({
            path: path.join(screenshotDir, "02-work-unit-system5-context.png"),
            fullPage: true,
            animations: "disabled",
        });

        // 3 — Queue (condensed operational mode)
        const queueHeader = page.locator('[data-alloy-os-queue-header="true"]').first();
        const queueBlock = page.locator('[data-testid="queue-block"]').first();
        await expect(queueHeader.or(queueBlock)).toBeVisible({ timeout: 60_000 });
        await queueHeader.or(queueBlock).scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        await page.screenshot({
            path: path.join(screenshotDir, "03-work-unit-queue-system5.png"),
            fullPage: false,
            animations: "disabled",
        });

        // 4 — Focus Panel split (New Leads WU — canonical operator entry)
        await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(page.locator('[data-ws-surface="work_unit"]')).toBeVisible({ timeout: 90_000 });
        await expect(page.locator('[data-alloy-os-work-unit-context="true"]')).toBeVisible({ timeout: 90_000 });

        const queueRow = page
            .locator(
                '[data-queue-row-interactive="true"], [data-queue-row-runtime-path="layout-runtime-queue-row-view"], [data-alloy-os-compressed-queue-row="true"]',
            )
            .first();
        await queueRow.waitFor({ state: "visible", timeout: 120_000 }).catch(() => undefined);

        let focusPanelCaptured = false;
        if (await queueRow.isVisible().catch(() => false)) {
            await queueRow.click();
            await page.waitForTimeout(2500);
        } else {
            const focusPanelRecordUrl = await resolveFocusPanelRecordUrl(page);
            if (focusPanelRecordUrl) {
                await page.goto(focusPanelRecordUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
                await page.waitForTimeout(4000);
            }
        }

        const focusPanelHeader = page.locator('[data-alloy-os-focus-panel-header="true"]');
        if (await focusPanelHeader.isVisible().catch(() => false)) {
            await expect(page.locator("html")).toHaveAttribute("data-alloy-os-runtime-split", "true", {
                timeout: 90_000,
            });
            await page.waitForTimeout(1500);
            await page.screenshot({
                path: path.join(screenshotDir, "04-work-unit-focus-panel-split-system5.png"),
                fullPage: true,
                animations: "disabled",
            });

            await focusPanelHeader.first().scrollIntoViewIfNeeded();
            await page.screenshot({
                path: path.join(screenshotDir, "05-focus-panel-universal-cards-system5.png"),
                fullPage: false,
                animations: "disabled",
            });
            focusPanelCaptured = true;
        }

        if (!focusPanelCaptured) {
            test.info().annotations.push({
                type: "warning",
                description:
                    "Focus Panel split not captured — ensure new-leads queue has rows and NEXT_PUBLIC_ALLOY_OS_RUNTIME=1",
            });
        }
    });
});
