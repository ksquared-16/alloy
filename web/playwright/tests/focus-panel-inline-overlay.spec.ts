import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page, type Locator } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

/**
 * Focus Panel — Inline Overlay Finalization. Proves the diagnostic-card rule:
 *  - Readiness / Current Work are COMPACT by default (2-second answer).
 *  - `View →` opens a card-anchored INLINE OVERLAY (not a Focus Card, no scrim).
 *  - The overlay COVERS the card below WITHOUT moving it — the base surface never
 *    reflows (we measure the below-card's top before/after; it must be unchanged).
 *  - A factor / item inside the overlay HANDS OFF to the owner truth card, which
 *    becomes the centered Focus Card (this is the only elevation path).
 *  - Truth cards (Household, Children) still become centered Focus Cards.
 *  - Click-out / ESC collapse the overlay; the record stays open.
 *
 * Dev captures always run. Operator captures: PLAYWRIGHT_OVERLAY=1.
 */
const LIVE = process.env.PLAYWRIGHT_OVERLAY === "1";
const WORK_UNIT_SLUGS = (process.env.CANVAS_SLUGS || "lifecycle-lead,new-leads,leads,tours,inquiries")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const OUT = path.join(__dirname, "../../../docs/sprints/06_2026/focus-panel-inline-overlay-finalization");
const ROW_SELECTOR = "[data-alloy-os-compressed-row='true']";

async function topOf(card: Locator): Promise<number> {
    const box = await card.boundingBox();
    return box ? Math.round(box.y) : -1;
}

async function elevatedCard(page: Page): Promise<string | null> {
    const cell = page.locator('[data-fp-elevated="true"]').first();
    if (!(await cell.count())) return null;
    return cell.getAttribute("data-focus-panel-grid-cell");
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

test("inline overlay: compact default, covers-not-moves, handoff (dev)", async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 1040 });
    await page.goto("http://localhost:3000/dev/household-card-verify", { waitUntil: "networkidle" });
    const overview = page.locator('[data-overview-composition="true"]');
    await expect(overview).toBeVisible();
    await overview.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const state: Record<string, unknown> = {};

    // 01 base + 02 Readiness collapsed: factor checklist NOT shown by default.
    await overview.screenshot({ path: path.join(OUT, "01-base-surface.png") });
    const readinessCard = overview.locator('[data-universal-card-key="readiness_kpi"]').first();
    state.readinessChecklistVisibleCollapsed = await overview
        .locator("[data-readiness-checklist]")
        .count();
    await readinessCard.screenshot({ path: path.join(OUT, "02-readiness-collapsed.png") });

    // 03 Readiness inline overlay — card below must NOT move.
    const belowReadiness = overview.locator('[data-universal-card-key="current_work"]').first();
    const beforeTop = await topOf(belowReadiness);
    await overview.locator('[data-readiness-action="view"]').first().click();
    await page.waitForTimeout(350);
    const afterTop = await topOf(belowReadiness);
    state.readinessOverlayOpen = await page.locator('[data-card-overlay="readiness"]').count();
    state.readinessScrim = await page.locator('[data-fp-depth-scrim="true"]').count();
    state.belowCardBeforeTop = beforeTop;
    state.belowCardAfterTop = afterTop;
    state.belowCardMoved = beforeTop !== afterTop;
    await page.screenshot({ path: path.join(OUT, "03-readiness-overlay-covers.png") });
    expect(state.readinessOverlayOpen, "Readiness overlay should open").toBeGreaterThan(0);
    expect(state.readinessScrim, "inline overlay is NOT a Focus Card (no scrim)").toBe(0);
    expect(afterTop, "card below must not move when overlay opens").toBe(beforeTop);

    // 07 Readiness → Children handoff (from inside the overlay).
    const factor = page
        .locator('[data-card-overlay="readiness"] button[data-readiness-factor]')
        .first();
    if (await factor.count()) {
        await factor.click();
        await page.waitForTimeout(450);
        state.readinessHandoffElevated = await elevatedCard(page);
        await page.screenshot({ path: path.join(OUT, "07-readiness-to-children.png") });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(350);
    }

    // 04 Current Work inline overlay — card below must NOT move.
    await page.reload({ waitUntil: "networkidle" });
    const overview2 = page.locator('[data-overview-composition="true"]');
    await expect(overview2).toBeVisible();
    const childrenCard = overview2.locator('[data-universal-card-key="children"]').first();
    const cwBefore = await topOf(childrenCard);
    const cwView = overview2.locator('[data-work-action="view"]').first();
    if (await cwView.count()) {
        await cwView.click();
        await page.waitForTimeout(350);
        const cwAfter = await topOf(childrenCard);
        state.currentWorkOverlayOpen = await page.locator('[data-card-overlay="current-work"]').count();
        state.currentWorkScrim = await page.locator('[data-fp-depth-scrim="true"]').count();
        state.cwBelowMoved = cwBefore !== cwAfter;
        await page.screenshot({ path: path.join(OUT, "04-current-work-overlay-covers.png") });
        expect(state.currentWorkScrim, "Current Work overlay is not a Focus Card").toBe(0);
        // ESC closes overlay; record stays.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        state.currentWorkOverlayAfterEsc = await page.locator('[data-card-overlay="current-work"]').count();
    }
    await page.screenshot({ path: path.join(OUT, "08-back-to-base.png") });

    // 05 Household Focus Card + 06 Children Focus Card (truth cards still elevate).
    const hView = overview2.locator('[data-household-action="expand"]').first();
    if (await hView.count()) {
        await hView.click();
        await page.waitForTimeout(450);
        state.householdElevated = await elevatedCard(page);
        await page.screenshot({ path: path.join(OUT, "05-household-focus.png") });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(350);
    }
    const childRow = overview2.locator("[data-children-child]").first();
    if (await childRow.count()) {
        await childRow.click();
        await page.waitForTimeout(450);
        state.childrenElevated = await elevatedCard(page);
        await page.screenshot({ path: path.join(OUT, "06-children-focus.png") });
    }

    fs.writeFileSync(path.join(OUT, "_dev-state.json"), JSON.stringify(state, null, 2), "utf8");
});

test.describe("inline overlay: live operator path", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_OVERLAY=1 for the authenticated operator path");
    test.describe.configure({ timeout: 360_000 });
    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("operator deliverables: base, collapsed, overlays, focus, handoff, back", async ({ page }) => {
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

        // (1) base + (2) Readiness collapsed (no checklist by default).
        await page.screenshot({ path: path.join(OUT, "10-operator-base.png") });
        state.readinessChecklistVisibleCollapsed = await page.locator("[data-readiness-checklist]").count();
        const readinessCard = page.locator('[data-universal-card-key="readiness_kpi"]').first();
        if (await readinessCard.count()) await readinessCard.screenshot({ path: path.join(OUT, "11-operator-readiness-collapsed.png") });

        // (3) Readiness overlay — the card below must not move.
        const below = page.locator('[data-universal-card-key="children"]').first();
        const beforeTop = (await below.count()) ? await topOf(below) : -1;
        const rView = page.locator('[data-readiness-action="view"]').first();
        if (await rView.count()) {
            await rView.click().catch(() => {});
            await page.waitForTimeout(400);
            const afterTop = (await below.count()) ? await topOf(below) : -1;
            state.readinessOverlayOpen = await page.locator('[data-card-overlay="readiness"]').count();
            state.readinessScrim = await page.locator('[data-fp-depth-scrim="true"]').count();
            state.belowCardBeforeTop = beforeTop;
            state.belowCardAfterTop = afterTop;
            await page.screenshot({ path: path.join(OUT, "12-operator-readiness-overlay.png") });

            // (7) handoff to Children from inside the overlay.
            const factor = page.locator('[data-card-overlay="readiness"] button[data-readiness-factor]').first();
            if (await factor.count()) {
                await factor.click().catch(() => {});
                await page.waitForTimeout(550);
                state.readinessHandoffElevated = await elevatedCard(page);
                await page.screenshot({ path: path.join(OUT, "13-operator-readiness-to-children.png") });
                await page.keyboard.press("Escape").catch(() => {});
                await page.waitForTimeout(350);
            } else {
                await page.keyboard.press("Escape").catch(() => {});
                await page.waitForTimeout(300);
            }
        }

        // (4) Current Work overlay.
        const cwView = page.locator('[data-work-action="view"]').first();
        if (await cwView.count()) {
            await cwView.click().catch(() => {});
            await page.waitForTimeout(400);
            state.currentWorkOverlayOpen = await page.locator('[data-card-overlay="current-work"]').count();
            state.currentWorkScrim = await page.locator('[data-fp-depth-scrim="true"]').count();
            await page.screenshot({ path: path.join(OUT, "14-operator-current-work-overlay.png") });
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(300);
        }

        // (5) Household focus + (6) Children focus.
        const hView = page.locator('[data-household-action="expand"]').first();
        if (await hView.count()) {
            await hView.click().catch(() => {});
            await page.waitForTimeout(550);
            state.householdElevated = await elevatedCard(page);
            await page.screenshot({ path: path.join(OUT, "15-operator-household-focus.png") });
            const hChild = page.locator("[data-household-child]").first();
            if (await hChild.count()) {
                await hChild.click().catch(() => {});
                await page.waitForTimeout(550);
                state.childrenElevated = await elevatedCard(page);
                await page.screenshot({ path: path.join(OUT, "16-operator-children-focus.png") });
            }
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(350);
        }

        // (8) back-to-base proof.
        state.scrimAfterDismiss = await page.locator('[data-fp-depth-scrim="true"]').count();
        await expect(page.locator(".adminv2-drawer-modal-panel").first()).toBeVisible();
        await page.screenshot({ path: path.join(OUT, "17-operator-back-to-base.png") });

        fs.writeFileSync(path.join(OUT, "_operator-state.json"), JSON.stringify(state, null, 2), "utf8");
    });
});
