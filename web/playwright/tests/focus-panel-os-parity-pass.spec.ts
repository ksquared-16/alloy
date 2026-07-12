import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

/**
 * Focus Panel OS Parity Pass — captures the in-panel depth layer, edit-ready UI,
 * Household↔Children handoff (dev harness, real components), and the live operator
 * Focus Panel header + two-mode switch (gated, authenticated).
 *
 * Dev harness captures always run. Operator captures require:
 *   PLAYWRIGHT_PARITY=1 npx playwright test focus-panel-os-parity-pass --project=chromium
 */
const LIVE = process.env.PLAYWRIGHT_PARITY === "1";
const WORK_UNIT_SLUGS = (process.env.PARITY_SLUGS || "lifecycle-lead,new-leads,leads,tours,inquiries")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const OUT = path.join(__dirname, "../../../docs/sprints/archive/06_2026/focus-panel-os-parity-pass");
const ROW_SELECTOR = "[data-alloy-os-compressed-row='true']";

async function openFirstRecord(page: Page): Promise<string | null> {
    for (const slug of WORK_UNIT_SLUGS) {
        await page
            .goto(`/workspace/work-unit/${slug}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
            .catch(() => {});
        const p0 = new URL(page.url()).pathname;
        if (p0 === "/login" || p0.startsWith("/unauthorized")) continue;
        const row = page.locator(ROW_SELECTOR).first();
        const appeared = await row.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
        if (!appeared) continue;
        await row.click();
        const panel = page.locator(".adminv2-drawer-modal-panel").first();
        const opened = await panel.waitFor({ state: "visible", timeout: 60_000 }).then(() => true).catch(() => false);
        if (opened) return slug;
    }
    return null;
}

test("parity: dev harness depth + edit + handoff captures", async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 1500 });
    await page.goto("http://localhost:3000/dev/household-card-verify", { waitUntil: "networkidle" });
    const overview = page.locator('[data-overview-composition="true"]');
    await expect(overview).toBeVisible();

    // 1. Baseline overview composition.
    await overview.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await overview.screenshot({ path: path.join(OUT, "01-overview-baseline.png") });

    // 2. Depth layer: expand Readiness, click a factor → Children raises, rest recede.
    const readiness = overview.locator('[data-universal-card-key="readiness_kpi"]').first();
    const expand = readiness.locator("button.alloy-os-ucard__action").first();
    if (await expand.count()) {
        await expand.click().catch(() => {});
        await page.waitForTimeout(250);
    }
    const schedule = overview.locator('[data-readiness-factor="schedule"]').first();
    if (await schedule.count()) {
        await schedule.scrollIntoViewIfNeeded();
        await schedule.click();
        await page.waitForTimeout(500);
        await overview.screenshot({ path: path.join(OUT, "02-depth-focus-children.png") });
    }

    // 3. Edit-ready: in the focused Children card, open the edit layer.
    const editTrigger = overview.locator("[data-children-edit-trigger]").first();
    if (await editTrigger.count()) {
        await editTrigger.scrollIntoViewIfNeeded();
        await editTrigger.click();
        await page.waitForTimeout(400);
        await overview.screenshot({ path: path.join(OUT, "03-edit-ready.png") });
    }

    // 4. Household → Children handoff: open Household, expand, click a child.
    await page.reload({ waitUntil: "networkidle" });
    const overview2 = page.locator('[data-overview-composition="true"]');
    await expect(overview2).toBeVisible();
    const household = overview2.locator('[data-universal-card-key="household"]').first();
    const hExpand = household.locator('button[data-household-action="expand"]').first();
    if (await hExpand.count()) {
        await hExpand.click().catch(() => {});
        await page.waitForTimeout(300);
        const childLink = overview2.locator("[data-household-child]").first();
        if (await childLink.count()) {
            await childLink.scrollIntoViewIfNeeded();
            await childLink.click();
            await page.waitForTimeout(500);
            await overview2.screenshot({ path: path.join(OUT, "04-household-to-children.png") });
        }
    }

    expect(true).toBe(true);
});

test.describe("parity: live operator path", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_PARITY=1 to capture the authenticated operator path");
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("operator header + two-mode switch + Work surface", async ({ page }) => {
        test.setTimeout(300_000);
        fs.mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width: 1680, height: 1050 });
        const slug = await openFirstRecord(page);
        // eslint-disable-next-line no-console -- playwright artifact
        console.log("openedSlug:", slug, "url:", page.url());
        if (!slug) {
            fs.writeFileSync(path.join(OUT, "_no-record.txt"), `No record. Tried: ${WORK_UNIT_SLUGS.join(", ")}\n`, "utf8");
            return;
        }
        const panel = page.locator(".adminv2-drawer-modal-panel").first();
        await expect(panel).toBeVisible({ timeout: 180_000 });
        await page.locator("[data-focus-panel-card-grid='true']").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(1200);

        await page.screenshot({ path: path.join(OUT, "05-operator-full-page.png") });
        await panel.screenshot({ path: path.join(OUT, "06-operator-focus-panel.png") });

        // Capture the header + mode switch region specifically (no mission, Work/Activity).
        const header = page.locator('[data-alloy-os-focus-panel-header="true"]').first();
        if (await header.count()) {
            const box = await header.boundingBox();
            if (box) {
                await page.screenshot({
                    path: path.join(OUT, "07-operator-header-modes.png"),
                    clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height + 8, 260) },
                });
            }
        }

        const modeLabels = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-focus-panel-mode-switch="true"] [role="tab"]')).map(
                (t) => t.textContent?.trim() ?? "",
            ),
        );
        const missionPresent = (await page.locator('[data-focus-panel-mission="true"]').count()) > 0;
        fs.writeFileSync(
            path.join(OUT, "_operator-state.json"),
            JSON.stringify({ slug, url: page.url(), modeLabels, missionPresent }, null, 2),
            "utf8",
        );
        expect(missionPresent).toBe(false);
    });
});
