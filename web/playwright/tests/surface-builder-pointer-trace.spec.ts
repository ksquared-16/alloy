import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/** Live pointer → cell, traced end to end, for the two operator failures. */

const OUT = "/tmp/surface-pointer";
const BUILDER = "/organization/surfaces?section=focus-panels&layout=enrollment-focus-panel-summary";
const GAP = 10;

type Rect = { x: number; y: number; w: number; h: number };

const shot = async (page: Page, n: string) => {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
};

async function readCanvas(page: Page) {
    return page.evaluate(() => {
        const r = (el: Element) => {
            const b = el.getBoundingClientRect();
            return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
        };
        const grid = document.querySelector(".alloy-os-fp-canvas--grid");
        return {
            grid: grid ? r(grid) : null,
            areas: Array.from(document.querySelectorAll("[data-fp-grid-area]")).map((el) => ({
                card: el.getAttribute("data-fp-grid-area") ?? "", row: el.getAttribute("data-fp-grid-row"), ...r(el),
            })),
            dragging: document.querySelector("[data-fp-composer-dragging]")?.getAttribute("data-fp-composer-cell") ?? null,
        };
    });
}

const trace = (page: Page) => page.evaluate(() =>
    (window as unknown as { __ALLOY_COMPOSER_DRAG_TRACE__?: unknown[] }).__ALLOY_COMPOSER_DRAG_TRACE__ ?? []);

async function openBuilder(page: Page) {
    await page.goto(BUILDER, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelector(".alloy-os-fp-canvas--grid")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(500);
}

/** Grab by the canonical 44px chrome handle and sweep to a point, sampling as we go. */
async function sweep(page: Page, card: string, to: (g: Rect, b: Rect) => { x: number; y: number }, steps = 40) {
    const cell = page.locator(`[data-fp-composer-cell="${card}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const before = await readCanvas(page);
    const bb = (await cell.boundingBox())!;
    const box: Rect = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
    const from = { x: box.x + Math.min(120, box.w / 2), y: box.y + 20 };
    const target = to(before.grid!, box);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 14, from.y + 14, { steps: 4 });
    // Continuous travel — the operator does not teleport the pointer.
    for (let i = 1; i <= steps; i += 1) {
        await page.mouse.move(
            from.x + ((target.x - from.x) * i) / steps,
            from.y + ((target.y - from.y) * i) / steps,
        );
        await page.waitForTimeout(12);
    }
    await page.waitForTimeout(160);
    const during = await readCanvas(page);
    const t = await trace(page);
    await page.mouse.up();
    await page.waitForTimeout(450);
    const after = await readCanvas(page);
    return { before, during, after, trace: t, activated: during.dragging === card };
}

test.describe("live pointer", () => {
    test.setTimeout(600_000);
    test.use({ viewport: { width: 1600, height: 2400 } });

    test("Attendance follows the pointer all the way to column 1", async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await openBuilder(page);

        // Put Attendance toward the middle/right first.
        await sweep(page, "attendance", (g) => ({ x: g.x + g.w * 0.72, y: g.y + 260 }), 24);
        await shot(page, "attendance-00-mid-right");

        // Now sweep continuously to the far left, past the canvas edge.
        const run = await sweep(page, "attendance", (g, b) => ({ x: g.x - 40, y: b.y + 20 }), 48);
        await shot(page, "attendance-01-left-edge");

        const maps = (run.trace as Array<Record<string, unknown>>).filter((e) => e.phase === "map");
        const moves = (run.trace as Array<Record<string, unknown>>).filter((e) => e.phase === "move");
        const rawCols = maps.map((m) => (m.raw as { col: number }).col);
        const askedCols = moves.map((m) => (m.asked as { colStart: number }).colStart);
        const ghostCols = moves.map((m) => (m.ghost as { colStart: number }).colStart);
        const drift = maps.map((m) => (m.rectLeft as number) - (m.frozenLeft as number));

        const att = run.after.areas.find((a) => a.card === "attendance")!;
        writeFileSync(`${OUT}/attendance-trace.json`, JSON.stringify({
            rawColMin: Math.min(...rawCols), askedColMin: Math.min(...askedCols),
            ghostColMin: Math.min(...ghostCols),
            horizontalDriftSeen: [...new Set(drift)],
            landedX: att.x, gridX: run.after.grid!.x, delta: att.x - run.after.grid!.x,
            samples: maps.slice(-14), pageErrors,
        }, null, 2));

        expect(run.activated, "the handle starts the drag").toBe(true);
        expect(Math.min(...rawCols), "raw mapping reaches column 1").toBe(1);
        expect(Math.min(...ghostCols), "the preview reaches column 1").toBe(1);
        expect(att.x - run.after.grid!.x, "dropped flush with the left grid edge").toBeLessThan(GAP + 2);
        expect(pageErrors).toEqual([]);
    });

    test("Health takes the vacancy beside Attendance, not Household's cell", async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await openBuilder(page);

        // Household to the top-right, Attendance to the left below it.
        await sweep(page, "household", (g) => ({ x: g.x + g.w - 60, y: g.y + 30 }), 24);
        await sweep(page, "attendance", (g) => ({ x: g.x + 40, y: g.y + 260 }), 24);
        await shot(page, "health-00-arranged");

        const arranged = await readCanvas(page);
        const attendance = arranged.areas.find((a) => a.card === "attendance")!;
        // The visually vacant cells: to the RIGHT of Attendance, on Attendance's own row.
        const run = await sweep(page, "health_safety",
            () => ({ x: attendance.x + attendance.w + 120, y: attendance.y + 24 }), 40);
        await shot(page, "health-01-in-vacancy");

        const moves = (run.trace as Array<Record<string, unknown>>).filter((e) => e.phase === "move");
        const last = moves[moves.length - 1] as Record<string, unknown> | undefined;
        const health = run.after.areas.find((a) => a.card === "health_safety")!;
        const householdBefore = arranged.areas.find((a) => a.card === "household")!;
        const householdAfter = run.after.areas.find((a) => a.card === "household")!;

        writeFileSync(`${OUT}/health-trace.json`, JSON.stringify({
            attendance: { x: attendance.x, y: attendance.y, w: attendance.w, row: attendance.row },
            arrangedLayout: arranged.areas.map((a) => `${a.card} ${a.row} x${a.x}`),
            afterLayout: run.after.areas.map((a) => `${a.card} ${a.row} x${a.x}`),
            allMoves: moves.map((m) => ({ asked: m.asked, ghost: m.ghost, how: m.how })).slice(-6),
            requested: last?.asked, ghost: last?.ghost, how: last?.how,
            health: { x: health.x, y: health.y, w: health.w, row: health.row },
            householdBefore: { x: householdBefore.x, y: householdBefore.y },
            householdAfter: { x: householdAfter.x, y: householdAfter.y },
            pageErrors,
        }, null, 2));

        expect(run.activated).toBe(true);
        // Beside Attendance, on its row — not on Household.
        expect(Math.abs(health.y - attendance.y), "Health shares Attendance's row").toBeLessThan(30);
        expect(health.x, "Health sits to the right of Attendance").toBeGreaterThan(attendance.x);
        expect(pageErrors).toEqual([]);
    });
});
