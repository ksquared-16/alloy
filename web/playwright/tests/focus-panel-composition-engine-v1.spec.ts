import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page, type Locator } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

/**
 * Composition Engine V1 — proves the Summary surface is COMPOSED from card
 * semantics, not laid out as equal grid cells:
 *  - Wide surface → interlocking LANES: a dominant anchor lane (Household,
 *    Children) beside a balancing support lane (Readiness, Current Work). The
 *    lanes are DIFFERENT widths (not 50/50).
 *  - Narrow surface → a composed STACK (full-width anchors, paired support).
 *  - Depth (Focus Cards) + inline overlays still work (one shared machinery).
 *
 * Dev captures always run. Operator captures: PLAYWRIGHT_COMPOSE=1.
 */
const LIVE = process.env.PLAYWRIGHT_COMPOSE === "1";
const WORK_UNIT_SLUGS = (process.env.CANVAS_SLUGS || "lifecycle-lead,new-leads,leads,tours,inquiries")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const OUT = path.join(__dirname, "../../../docs/sprints/06_2026/focus-panel-composition-engine-v1");
const ROW_SELECTOR = "[data-alloy-os-compressed-row='true']";

async function widthOf(el: Locator): Promise<number> {
    const box = await el.boundingBox();
    return box ? Math.round(box.width) : -1;
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

test("composition engine: lanes (wide) + stack (narrow) on the dev harness", async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.goto("http://localhost:3000/dev/household-card-verify", { waitUntil: "networkidle" });
    const overview = page.locator('[data-overview-composition="true"]');
    await expect(overview).toBeVisible();
    await overview.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);

    const state: Record<string, unknown> = {};

    // — Wide: interlocking lanes —
    const grid = overview.locator("[data-focus-panel-card-grid='true']").first();
    state.strategyWide = await grid.getAttribute("data-fp-strategy");
    const primaryLane = overview.locator('[data-fp-lane="primary"]').first();
    const supportLane = overview.locator('[data-fp-lane="support"]').first();
    state.primaryLaneExists = await primaryLane.count();
    state.supportLaneExists = await supportLane.count();
    const primaryWidth = await widthOf(primaryLane);
    const supportWidth = await widthOf(supportLane);
    state.primaryLaneWidth = primaryWidth;
    state.supportLaneWidth = supportWidth;
    state.lanesAsymmetric = primaryWidth > supportWidth;

    // Anchor lane carries Household + Children; support lane carries the rest.
    state.primaryLaneCards = await primaryLane
        .locator("[data-focus-panel-grid-cell]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-focus-panel-grid-cell")));
    state.supportLaneCards = await supportLane
        .locator("[data-focus-panel-grid-cell]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-focus-panel-grid-cell")));

    await overview.screenshot({ path: path.join(OUT, "01-composition-lanes.png") });

    expect(state.strategyWide, "wide surface composes lanes").toBe("lanes");
    expect(primaryWidth, "anchor lane is dominant (wider) than support lane").toBeGreaterThan(supportWidth);
    expect(state.primaryLaneCards).toEqual(["household", "children"]);
    expect(state.supportLaneCards).toEqual(["readiness_kpi", "current_work"]);

    // — Mid width: composed STACK with a PAIRED support row (full-width anchors,
    //   Readiness + Current Work side-by-side beneath) — a different rhythm than a
    //   plain column of equal widgets. —
    await overview.evaluate((el) => {
        const frame = el.querySelector<HTMLElement>(".alloy-os-runtime");
        if (frame) frame.style.width = "540px";
    });
    await page.waitForTimeout(400);
    state.strategyNarrow = await grid.getAttribute("data-fp-strategy");
    const readinessWidth = await widthOf(overview.locator('[data-focus-panel-grid-cell="readiness_kpi"]').first());
    const householdWidth = await widthOf(overview.locator('[data-focus-panel-grid-cell="household"]').first());
    state.stackHouseholdWidth = householdWidth;
    state.stackReadinessWidth = readinessWidth;
    state.supportPairedNarrowerThanAnchor = readinessWidth < householdWidth;
    await overview.screenshot({ path: path.join(OUT, "02-composition-stack.png") });
    expect(state.strategyNarrow, "narrow surface composes a stack").toBe("stack");
    expect(readinessWidth, "paired support is narrower than the full-width anchor").toBeLessThan(householdWidth);

    fs.writeFileSync(path.join(OUT, "_dev-state.json"), JSON.stringify(state, null, 2), "utf8");
});

test.describe("composition engine: live operator path", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_COMPOSE=1 for the authenticated operator path");
    test.describe.configure({ timeout: 360_000 });
    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("operator: summary composes from card semantics", async ({ page }) => {
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
        const grid = page.locator("[data-focus-panel-card-grid='true']").first();
        await grid.waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(1200);

        const state: Record<string, unknown> = { slug, url: page.url() };
        state.strategy = await grid.getAttribute("data-fp-strategy");
        state.gridWidth = await widthOf(grid);
        const primaryLane = page.locator('[data-fp-lane="primary"]').first();
        const supportLane = page.locator('[data-fp-lane="support"]').first();
        if (await primaryLane.count()) {
            state.primaryLaneWidth = await widthOf(primaryLane);
            state.supportLaneWidth = await widthOf(supportLane);
            state.primaryLaneCards = await primaryLane
                .locator("[data-focus-panel-grid-cell]")
                .evaluateAll((els) => els.map((e) => e.getAttribute("data-focus-panel-grid-cell")));
            state.supportLaneCards = await supportLane
                .locator("[data-focus-panel-grid-cell]")
                .evaluateAll((els) => els.map((e) => e.getAttribute("data-focus-panel-grid-cell")));
        }
        await page.screenshot({ path: path.join(OUT, "10-operator-composition.png") });

        // Depth still works: View household → centered Focus Card over the canvas.
        const hView = page.locator('[data-household-action="expand"]').first();
        if (await hView.count()) {
            await hView.click().catch(() => {});
            await page.waitForTimeout(550);
            state.householdElevated = await page
                .locator('[data-fp-elevated="true"]')
                .first()
                .getAttribute("data-focus-panel-grid-cell")
                .catch(() => null);
            await page.screenshot({ path: path.join(OUT, "11-operator-household-focus.png") });
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(350);
        }
        await page.screenshot({ path: path.join(OUT, "12-operator-back-to-base.png") });

        fs.writeFileSync(path.join(OUT, "_operator-state.json"), JSON.stringify(state, null, 2), "utf8");
    });
});
