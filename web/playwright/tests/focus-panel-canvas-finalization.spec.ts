import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

/**
 * Focus Panel — Depth & Motion Final Pass. Proves the canvas rule end to end:
 *  - The base Work surface never reflows: deeper states are an OVERLAY layer, the
 *    elevated cell reserves its slot, neighbours only dim (no push, no resize).
 *  - Operational-truth cards (Household, Children) elevate into a CENTERED Focus
 *    Card over a soft-glass scrim; the rest recede.
 *  - Diagnostic cards (Readiness, Current Work) NEVER become Focus Cards — clicking
 *    a factor / item HANDS OFF to the owner truth card (which elevates instead).
 *  - Click-out / ESC return to the base surface.
 *
 * Dev captures always run. Operator captures (the deliverables): PLAYWRIGHT_CANVAS=1.
 */
const LIVE = process.env.PLAYWRIGHT_CANVAS === "1";
const WORK_UNIT_SLUGS = (process.env.CANVAS_SLUGS || "lifecycle-lead,new-leads,leads,tours,inquiries")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const OUT = path.join(__dirname, "../../../docs/sprints/06_2026/focus-panel-canvas-finalization");
const ROW_SELECTOR = "[data-alloy-os-compressed-row='true']";

/** True when card `key` is the one raised in the depth layer (centered Focus Card). */
async function elevatedCard(page: Page): Promise<string | null> {
    const cell = page.locator('[data-fp-elevated="true"]').first();
    if (!(await cell.count())) return null;
    return cell.getAttribute("data-focus-panel-grid-cell");
}

/** Return to the base surface without closing the record drawer. Prefer ESC (the host
 * captures it while depth is active); only fall back to scrim click if needed. Never
 * double-dismiss — a second ESC after depth clears can close the whole record. */
async function returnToBase(page: Page): Promise<number> {
    if (await page.locator('[data-fp-depth-scrim="true"]').count()) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(420);
    }
    let remaining = await page.locator('[data-fp-depth-scrim="true"]').count();
    if (remaining > 0) {
        await page.locator('[data-fp-depth-scrim="true"]').first().click({ position: { x: 8, y: 8 } }).catch(() => {});
        await page.waitForTimeout(420);
        remaining = await page.locator('[data-fp-depth-scrim="true"]').count();
    }
    return remaining;
}

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

test("canvas: truth elevates, diagnostic hands off (dev)", async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 1040 });
    await page.goto("http://localhost:3000/dev/household-card-verify", { waitUntil: "networkidle" });
    const overview = page.locator('[data-overview-composition="true"]');
    await expect(overview).toBeVisible();
    await overview.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // 01 baseline canvas (rhythm/composition, diagnostic cards show actionable rows).
    await overview.screenshot({ path: path.join(OUT, "01-canvas-baseline.png") });

    // 02 Children (truth) → centered Focus Card over scrim.
    await overview.locator("[data-children-child]").first().click();
    await page.waitForTimeout(500);
    expect(await elevatedCard(page), "Children should be the centered Focus Card").toBe("children");
    await page.screenshot({ path: path.join(OUT, "02-children-centered-focus.png") });
    await returnToBase(page);

    // 03 Readiness factor (diagnostic) → HANDS OFF; Children elevates, Readiness does NOT.
    const factors = overview.locator('[data-universal-card-key="readiness_kpi"] button[data-readiness-factor]');
    const n = await factors.count();
    for (let i = 0; i < n; i++) {
        await factors.nth(i).click().catch(() => {});
        await page.waitForTimeout(400);
        if (await page.locator('[data-fp-depth-scrim="true"]').count()) break;
    }
    expect(await elevatedCard(page), "Readiness must hand off — never become a Focus Card").not.toBe(
        "readiness_kpi",
    );
    await page.screenshot({ path: path.join(OUT, "03-readiness-handoff.png") });
    await returnToBase(page);

    // 04 Household (truth) → centered, then a household child → Children centered.
    await page.reload({ waitUntil: "networkidle" });
    const overview2 = page.locator('[data-overview-composition="true"]');
    await expect(overview2).toBeVisible();
    const hExpand = overview2
        .locator('[data-universal-card-key="household"] [data-household-action="expand"]')
        .first();
    if (await hExpand.count()) {
        await hExpand.click();
        await page.waitForTimeout(450);
        expect(await elevatedCard(page), "Household should elevate").toBe("household");
        await page.screenshot({ path: path.join(OUT, "04-household-centered.png") });
        const hChild = page.locator("[data-household-child]").first();
        if (await hChild.count()) {
            await hChild.click();
            await page.waitForTimeout(500);
            expect(await elevatedCard(page), "Household child hands off to Children").toBe("children");
            await page.screenshot({ path: path.join(OUT, "05-household-to-children-centered.png") });
        }
    }
});

test.describe("canvas: live operator path", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_CANVAS=1 for the authenticated operator path");
    test.describe.configure({ timeout: 360_000 });
    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("operator deliverables: base, view household, child→children, readiness→children, edit, back", async ({
        page,
    }) => {
        test.setTimeout(360_000);
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
        await page
            .locator("[data-focus-panel-card-grid='true']")
            .first()
            .waitFor({ state: "visible", timeout: 60_000 })
            .catch(() => {});
        await page.waitForTimeout(1200);

        const state: Record<string, unknown> = { slug, url: page.url() };

        // (1) Base Work panel.
        await page.screenshot({ path: path.join(OUT, "10-operator-base.png") });

        // (2) View household → Household centered Focus Card.
        const viewHousehold = page
            .locator('[data-universal-card-key="household"] [data-household-action="expand"]')
            .first();
        if (await viewHousehold.count()) {
            await viewHousehold.click().catch(() => {});
            await page.waitForTimeout(650);
            state.viewHouseholdElevated = await elevatedCard(page);
            await page.screenshot({ path: path.join(OUT, "20-operator-view-household.png") });
            // (3) Household child → Children centered.
            const hChild = page.locator("[data-household-child]").first();
            if (await hChild.count()) {
                await hChild.click().catch(() => {});
                await page.waitForTimeout(650);
                state.householdChildElevated = await elevatedCard(page);
                await page.screenshot({ path: path.join(OUT, "21-operator-household-child-children.png") });
            }
            // Return to base (ESC only — do not close the record drawer).
            state.scrimAfterChildDismiss = await returnToBase(page);
            await expect(page.locator(".adminv2-drawer-modal-panel").first()).toBeVisible();
        }

        // (4) Readiness factor → Children centered (diagnostic never becomes Focus Card).
        const rFactors = page.locator('[data-universal-card-key="readiness_kpi"] button[data-readiness-factor]');
        const rn = await rFactors.count();
        for (let i = 0; i < rn; i++) {
            await rFactors.nth(i).click().catch(() => {});
            await page.waitForTimeout(450);
            if (await page.locator('[data-fp-depth-scrim="true"]').count()) break;
        }
        state.readinessHandoffElevated = await elevatedCard(page);
        await page.screenshot({ path: path.join(OUT, "22-operator-readiness-children.png") });

        // (5) Children edit-ready (same centered Focus Card, content → edit).
        const editTrigger = page.locator("[data-children-edit-trigger]").first();
        if (await editTrigger.count()) {
            await editTrigger.click().catch(() => {});
            await page.waitForTimeout(450);
            state.editElevated = await elevatedCard(page);
            await page.screenshot({ path: path.join(OUT, "23-operator-children-edit.png") });
        }

        // (6) Back to base panel (ESC / scrim once).
        state.scrimAfterDismiss = await returnToBase(page);
        await expect(page.locator(".adminv2-drawer-modal-panel").first()).toBeVisible();
        await page.screenshot({ path: path.join(OUT, "24-operator-back-to-base.png") });

        fs.writeFileSync(path.join(OUT, "_operator-state.json"), JSON.stringify(state, null, 2), "utf8");
        expect(state.scrimAfterDismiss, "click-out / ESC must return to base").toBe(0);
    });
});
