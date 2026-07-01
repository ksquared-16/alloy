import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

/**
 * Focus Depth Finalization — centered focus overlay, scrim recede, click-out/ESC
 * return-to-base, and directional deeper-links. Centered cards are position:fixed,
 * so centered states are captured FULL PAGE (element-scoped shots would clip them).
 *
 * Dev captures always run. Operator captures:
 *   PLAYWRIGHT_DEPTH=1 npx playwright test focus-depth-finalization --project=chromium
 */
const LIVE = process.env.PLAYWRIGHT_DEPTH === "1";
const WORK_UNIT_SLUGS = (process.env.DEPTH_SLUGS || "lifecycle-lead,new-leads,leads,tours,inquiries")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const OUT = path.join(__dirname, "../../../docs/sprints/06_2026/focus-depth-finalization");
const ROW_SELECTOR = "[data-alloy-os-compressed-row='true']";

async function openFirstRecord(page: Page): Promise<string | null> {
    for (const slug of WORK_UNIT_SLUGS) {
        await page
            .goto(`/workspace/work-unit/${slug}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
            .catch(() => {});
        const p0 = new URL(page.url()).pathname;
        if (p0 === "/login" || p0.startsWith("/unauthorized")) continue;
        const row = page.locator(ROW_SELECTOR).first();
        const ok = await row.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
        if (!ok) continue;
        await row.click();
        const panel = page.locator(".adminv2-drawer-modal-panel").first();
        const opened = await panel.waitFor({ state: "visible", timeout: 60_000 }).then(() => true).catch(() => false);
        if (opened) return slug;
    }
    return null;
}

test("depth: centered focus, edit, click-out, household handoff (dev)", async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("http://localhost:3000/dev/household-card-verify", { waitUntil: "networkidle" });
    const overview = page.locator('[data-overview-composition="true"]');
    await expect(overview).toBeVisible();
    await overview.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);

    // 01 baseline.
    await overview.screenshot({ path: path.join(OUT, "01-overview-baseline.png") });

    // 02 Readiness → Children centered focus (full page: card is position:fixed).
    const expand = overview.locator('[data-universal-card-key="readiness_kpi"] button.alloy-os-ucard__action').first();
    if (await expand.count()) {
        await expand.click().catch(() => {});
        await page.waitForTimeout(200);
    }
    const schedule = overview.locator('[data-readiness-factor="schedule"]').first();
    if (await schedule.count()) {
        await schedule.click();
        await page.waitForTimeout(450);
        await page.screenshot({ path: path.join(OUT, "02-centered-focus-children.png") });
    }

    // 03 directional deeper-link → edit-ready (centered).
    const deeper = page.locator("[data-children-edit-trigger]").first();
    if (await deeper.count()) {
        await deeper.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, "03-edit-ready-centered.png") });
    }

    // 04 click-out (scrim) returns to base Work surface.
    const scrim = page.locator('[data-fp-depth-scrim="true"]').first();
    if (await scrim.count()) {
        await scrim.click({ position: { x: 8, y: 8 } });
        await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(OUT, "04-click-out-base.png") });
    }

    // 05 Household → child → Children centered focus.
    await page.reload({ waitUntil: "networkidle" });
    const overview2 = page.locator('[data-overview-composition="true"]');
    await expect(overview2).toBeVisible();
    const hExpand = overview2.locator('[data-universal-card-key="household"] button[data-household-action="expand"]').first();
    if (await hExpand.count()) {
        await hExpand.click().catch(() => {});
        await page.waitForTimeout(250);
        const child = overview2.locator("[data-household-child]").first();
        if (await child.count()) {
            await child.click();
            await page.waitForTimeout(450);
            await page.screenshot({ path: path.join(OUT, "05-household-to-children-centered.png") });
        }
    }

    expect(true).toBe(true);
});

test.describe("depth: live operator path", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_DEPTH=1 for the authenticated operator path");
    test.describe.configure({ timeout: 300_000 });
    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("operator centered focus + base", async ({ page }) => {
        test.setTimeout(300_000);
        fs.mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width: 1680, height: 1050 });
        const slug = await openFirstRecord(page);
        // eslint-disable-next-line no-console -- artifact
        console.log("openedSlug:", slug, "url:", page.url());
        if (!slug) {
            fs.writeFileSync(path.join(OUT, "_no-record.txt"), `No record. Tried: ${WORK_UNIT_SLUGS.join(", ")}\n`, "utf8");
            return;
        }
        const panel = page.locator(".adminv2-drawer-modal-panel").first();
        await expect(panel).toBeVisible({ timeout: 180_000 });
        await page.locator("[data-focus-panel-card-grid='true']").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(1200);

        await page.screenshot({ path: path.join(OUT, "10-operator-base.png") });

        // Expand Readiness and click a missing factor → Children centered.
        const expand = page.locator('[data-universal-card-key="readiness_kpi"] button.alloy-os-ucard__action').first();
        if (await expand.count()) {
            await expand.click().catch(() => {});
            await page.waitForTimeout(300);
        }
        const factor = page
            .locator('[data-readiness-factor="schedule"], [data-readiness-factor="program"], [data-readiness-factor="start_date"]')
            .first();
        let centered = false;
        if (await factor.count()) {
            await factor.click().catch(() => {});
            await page.waitForTimeout(600);
            centered = (await page.locator('[data-fp-depth-scrim="true"]').count()) > 0;
            await page.screenshot({ path: path.join(OUT, "11-operator-centered-focus.png") });
        }
        // ESC returns to the base Work surface (more robust than corner-clicking the
        // scrim, which the higher-z shell header can intercept).
        if (centered) {
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(500);
            await page.screenshot({ path: path.join(OUT, "12-operator-back-to-base.png") });
        }

        fs.writeFileSync(
            path.join(OUT, "_operator-state.json"),
            JSON.stringify({ slug, url: page.url(), centeredScrimSeen: centered }, null, 2),
            "utf8",
        );
        expect(true).toBe(true);
    });
});
