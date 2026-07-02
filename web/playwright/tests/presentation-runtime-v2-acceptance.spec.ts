import { config as loadEnv } from "dotenv";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

/**
 * Presentation Runtime V2 — acceptance (docs/platform/experience/presentation-runtime-v2.md).
 *
 * Workspace → click a process tile → path route `/workspace/work-unit/<slug>` → header →
 * operational answers → horizontal Work View pills → condensed queue → first row auto-opens
 * the Focus Panel. Single ownership: every runtime label resolves to exactly one render site.
 */

const L = (label: string) => `[data-runtime-label="${label}"]`;

/** Optional visual captures: PRV2_SHOTS_DIR=/abs/dir saves full-page screenshots per surface. */
async function capture(page: Page, name: string): Promise<void> {
    const dir = process.env.PRV2_SHOTS_DIR?.trim();
    if (!dir) return;
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

async function gotoWorkspace(page: Page): Promise<void> {
    await ensureAdminPlaywrightSession(page);
    await page.goto("/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.locator(L("WS.SURFACE"))).toBeVisible({ timeout: 60_000 });
}

test.describe("Presentation Runtime V2 acceptance", () => {
    // Internal waits run to 60s each (cold dev-server compiles); the 30s default clips them.
    test.describe.configure({ timeout: 180_000 });

    test("workspace surface renders the presentation tree", async ({ page }) => {
        await gotoWorkspace(page);

        // WS.HEADER reveal is atomic: title + published calculation cards commit together.
        // The first commit that shows the header title must ALREADY contain the strip —
        // non-retrying count assertions, no fresh wait for the cards.
        await expect(page.locator(L("WS.HEADER"))).toBeVisible();
        expect(await page.locator('[data-alloy-section="WS.HEADER"]').count()).toBe(1);
        expect(await page.locator('[data-alloy-section="WS.HEADER_CALCULATIONS"]').count()).toBe(1);
        await expect(page.locator(L("WS.HEADER_CALCULATIONS"))).toBeVisible();
        await expect(page.locator(L("WS.PROCESS_GRID"))).toBeVisible();
        const tiles = page.locator(L("WS.PROCESS_TILE"));
        const firstTileEl = tiles.first();
        await expect(firstTileEl).toBeVisible({ timeout: 60_000 });

        // WS.PROCESS_TILE interaction contract: the tile is NOT itself a link/button — only
        // its Work View rows and the Open control respond to the pointer. Each tile owns one
        // WS.PROCESS_TILE_WORK_VIEWS section.
        await expect(firstTileEl).toHaveJSProperty("tagName", "ARTICLE");
        expect(await firstTileEl.getAttribute("role")).toBeNull();
        await expect(firstTileEl.locator("a", { hasText: "Open →" })).toHaveCount(1);
        await expect(
            firstTileEl.locator(`${L("WS.PROCESS_TILE_WORK_VIEWS")} a[href*="/work-unit/"]`).first(),
        ).toBeVisible();
        expect(
            await firstTileEl.locator('[data-alloy-section="WS.PROCESS_TILE_WORK_VIEWS"]').count(),
        ).toBe(1);

        // Single ownership on the live DOM (tiles/views are per-item labels, counted > 0).
        for (const single of ["WS.SURFACE", "WS.HEADER", "WS.HEADER_CALCULATIONS", "WS.PROCESS_GRID"]) {
            await expect(page.locator(L(single))).toHaveCount(1);
        }
        for (const section of ["WS.HEADER", "WS.HEADER_CALCULATIONS"]) {
            await expect(page.locator(`[data-alloy-section="${section}"]`)).toHaveCount(1);
        }
        await capture(page, "workspace-surface");
    });

    test("process tile → work unit surface → first row auto-opens Focus Panel", async ({ page }) => {
        await gotoWorkspace(page);

        const firstTile = page.locator(L("WS.PROCESS_TILE")).first();
        await expect(firstTile).toBeVisible({ timeout: 60_000 });
        // The tile body is inert — the Open control navigates to the process entry.
        await firstTile.locator("a", { hasText: "Open →" }).click();

        // Path routing, no query-string routing.
        await page.waitForURL(/\/workspace\/work-unit\/[a-z0-9-]+/, { timeout: 120_000 });
        expect(new URL(page.url()).pathname).toMatch(/^\/workspace\/work-unit\/[a-z0-9-]+/);

        await expect(page.locator(L("WU.SURFACE"))).toBeVisible({ timeout: 60_000 });
        await expect(page.locator(L("WU.HEADER"))).toBeVisible();
        await expect(page.locator(L("WU.QUEUE"))).toBeVisible({ timeout: 60_000 });

        // Horizontal Work View pills (present when the process has configured views).
        const pillStrip = page.locator(L("WU.WORK_VIEWS"));
        if (await pillStrip.count()) {
            await expect(pillStrip).toBeVisible();
        }

        for (const single of ["WU.SURFACE", "WU.HEADER", "WU.QUEUE", "FP.SURFACE", "RR.SURFACE"]) {
            await expect(page.locator(L(single))).toHaveCount(1);
        }

        // Queue must settle to rows or the explicit empty state — an error alert is a failure.
        const rows = page.locator(L("WU.QUEUE_ROW"));
        await expect(rows.first().or(page.getByText("No records in this view"))).toBeVisible({
            timeout: 60_000,
        });
        await expect(page.locator(`${L("WU.QUEUE")} [role="alert"]`)).toHaveCount(0);

        // First row auto-opens the Focus Panel once the queue settles (rows present).
        if (await rows.count()) {
            await expect(page.locator(`${L("FP.SURFACE")}[data-focus-panel-open="true"]`)).toBeVisible({
                timeout: 60_000,
            });
            // The record renders as the INLINE Focus Panel region INSIDE FP.SURFACE …
            await expect(
                page.locator(`${L("FP.SURFACE")} [data-inline-focus-panel="true"]`),
            ).toBeVisible({ timeout: 60_000 });
            // … and NEVER as the drawer/modal overlay (Drawer.tsx portal chrome absent).
            await expect(page.locator('[data-adminv2-drawer="true"]')).toHaveCount(0);
            await expect(
                page.locator(".adminv2-drawer-modal-panel, .adminv2-drawer-sidebar-panel"),
            ).toHaveCount(0);
            // Selected row carries the persistent rail for the open record.
            await expect(
                page.locator(`${L("WU.QUEUE_ROW")}[data-queue-row-active="true"]`).first(),
            ).toBeVisible({ timeout: 60_000 });
        } else {
            // Zero rows: no panel — open state false and no inline record surface.
            await expect(page.locator(L("FP.SURFACE"))).toHaveAttribute(
                "data-focus-panel-open",
                "false",
            );
            await expect(page.locator('[data-inline-focus-panel="true"]')).toHaveCount(0);
        }
        await capture(page, "work-unit-surface");
    });
});
