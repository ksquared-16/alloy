import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * SURFACE BUILDER — layout certification with a real pointer.
 *
 * Operator QA rejected two prior completions that were argued from unit tests, so
 * everything here is measured from the live DOM after real mouse events: the drag
 * is `mouse.down` / `mouse.move` / `mouse.up` on the rendered canvas, the ghost is
 * read while the button is still down, and the geometry assertions come from
 * `getBoundingClientRect` rather than from the layout model.
 */

const OUT = "/tmp/surface-cert";
const shot = async (page: Page, name: string) => {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};

type Cell = { card: string; x: number; y: number; w: number; h: number; row: string | null };

async function readCanvas(page: Page) {
    return page.evaluate(() => {
        const r = (el: Element) => {
            const b = el.getBoundingClientRect();
            return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
        };
        const grid = document.querySelector(".alloy-os-fp-canvas--grid");
        const areas = Array.from(document.querySelectorAll("[data-fp-grid-area]")).map((el) => ({
            card: el.getAttribute("data-fp-grid-area") ?? "",
            row: el.getAttribute("data-fp-grid-row"),
            ...r(el),
        }));
        const ghostEl = document.querySelector(".alloy-os-fp-composer__ghost");
        return {
            grid: grid ? r(grid) : null,
            gridRows: grid ? getComputedStyle(grid).gridTemplateRows : null,
            areas,
            ghost: ghostEl ? r(ghostEl) : null,
        };
    });
}

/** Drag a card by its centre to a point, sampling the ghost mid-gesture. */
async function dragCard(page: Page, card: string, to: { x: number; y: number }, label: string) {
    const cell = page.locator(`[data-fp-composer-cell="${card}"]`).first();
    const box = await cell.boundingBox();
    if (!box) throw new Error(`no box for ${card}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Two moves: the first crosses the activation threshold, the second aims.
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 18 });
    await page.waitForTimeout(120);
    const during = await readCanvas(page);
    await shot(page, `${label}-hovering`);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await readCanvas(page);
    await shot(page, `${label}-dropped`);
    return { during, after };
}

test.describe("Surface Builder layout", () => {
    test.setTimeout(180_000);
    /*
     * A viewport tall enough to hold the canvas. `page.mouse` works in VIEWPORT
     * coordinates, so a card sitting at y=2316 in a 720px-tall window is not
     * merely off-screen — `elementFromPoint` returns null there and the gesture
     * lands on nothing at all. This is the harness matching the operator, who is
     * looking at the whole surface when they drag.
     */
    test.use({ viewport: { width: 1600, height: 2400 } });

    test("certifies compaction and card-agnostic drag", async ({ page }) => {
        const evidence: Record<string, unknown> = {};
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));

        // The builder itself, not the Surfaces landing page.
        await page.goto(
            "/organization/surfaces?section=focus-panels&layout=enrollment-focus-panel-summary",
            { waitUntil: "domcontentloaded" },
        );
        await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
        await page.waitForTimeout(2500);
        await page.evaluate(() => document.querySelector(".alloy-os-fp-canvas--grid")?.scrollIntoView({ block: "start" }));
        await page.waitForTimeout(600);
        await shot(page, "00-initial");
        evidence.initial = await readCanvas(page);

        // ── Author the widths the operator authors: Process 2/3, Financials 1/3 ──
        /**
         * Author a width with the card's own west resize handle — a real pointer drag,
         * the same one an operator makes.
         */
        const setWidth = async (card: string, columns: number) => {
            const cell = page.locator(`[data-fp-composer-cell="${card}"]`).first();
            await cell.scrollIntoViewIfNeeded();
            await cell.hover();
            await page.waitForTimeout(300);
            const grid = (await readCanvas(page)).grid!;
            const box = (await cell.boundingBox())!;
            const handle = cell.locator(".alloy-os-fp-composer-cell__handle--w").first();
            const hb = (await handle.boundingBox())!;
            const track = (grid.w - 11 * 10) / 12;
            const wanted = columns * track + (columns - 1) * 10;
            await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
            await page.mouse.down();
            await page.mouse.move(box.x + wanted, hb.y + hb.height / 2, { steps: 20 });
            await page.waitForTimeout(150);
            await page.mouse.up();
            await page.waitForTimeout(700);
        };
        await setWidth("business_process", 8);
        await setWidth("financials", 4);
        await shot(page, "01a-widths-authored");
        evidence.afterWidths = await readCanvas(page);

        // ── The reported scenario: Financials into the empty top-right third ──
        // Coordinates are read FRESH: selecting a card scrolls the page, and a stale
        // rect aims the gesture at the wrong row.
        const processCell = page.locator('[data-fp-composer-cell="business_process"]').first();
        await processCell.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        const canvas = (await readCanvas(page)).grid!;
        const third = canvas.w / 3;
        const processBox = (await processCell.boundingBox())!;
        // Beside Process, in the empty right-hand third of its own row.
        const topRight = { x: canvas.x + canvas.w - third / 2, y: processBox.y + 40 };
        const financials = await dragCard(page, "financials", topRight, "01-financials-top-right");
        evidence.financials = financials;

        // ── Process 2/3 top-left, Financials 1/3 top-right, on ONE row ──
        const finAfter = financials.after.areas.find((a) => a.card === "financials")!;
        const procAfter = financials.after.areas.find((a) => a.card === "business_process")!;
        evidence.topRow = { process: procAfter, financials: finAfter };
        expect(Math.abs(finAfter.y - procAfter.y), "Financials shares Process's row").toBeLessThan(24);
        expect(finAfter.x, "Financials sits to the right of Process").toBeGreaterThan(procAfter.x + procAfter.w - 24);
        expect(procAfter.w, "Process is the wider two-thirds").toBeGreaterThan(finAfter.w);

        // The ghost, sampled with the button still down, must sit in the right-hand third.
        expect(financials.during.ghost, "a ghost is drawn while dragging").not.toBeNull();
        expect(financials.during.ghost!.x).toBeGreaterThan(canvas.x + third);

        // Drop lands where the ghost was.
        const droppedFin = financials.after.areas.find((a) => a.card === "financials")!;
        expect(Math.abs(droppedFin.x - financials.during.ghost!.x)).toBeLessThan(24);

        // ── No phantom whitespace: the first row hugs the top of the canvas ──
        // Same-snapshot geometry: the page scrolls during a gesture, so a rect read
        // before the drag cannot be compared with one read after it.
        const afterGrid = financials.after.grid!;
        const topGap = Math.min(...financials.after.areas.map((a) => a.y)) - afterGrid.y;
        evidence.topGap = topGap;
        expect(topGap, "cards start at the top of the canvas").toBeLessThan(24);

        // The canvas is no taller than the cards it holds, plus normal gaps.
        const contentBottom = Math.max(...financials.after.areas.map((a) => a.y + a.h));
        const trailingGap = afterGrid.y + afterGrid.h - contentBottom;
        evidence.trailingGap = trailingGap;
        expect(trailingGap, "no dead space under the last card").toBeLessThan(48);

        // No empty row band anywhere: every vertical gap between stacked cards is a
        // normal gutter, never an abandoned 76px track.
        const rows = [...financials.after.areas].sort((a, b) => a.y - b.y);
        const bands: number[] = [];
        let reach = afterGrid.y;
        for (const a of rows) {
            if (a.y > reach) bands.push(a.y - reach);
            reach = Math.max(reach, a.y + a.h);
        }
        evidence.verticalBands = bands;
        expect(Math.max(0, ...bands), "no abandoned row tracks").toBeLessThan(40);

        // ── Reload: identical geometry ──
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
        await page.waitForTimeout(2500);
        const reloaded = await readCanvas(page);
        await shot(page, "02-after-reload");
        evidence.reloaded = reloaded;

        // ── Every card activates the same way ──
        const perCard: Record<string, unknown> = {};
        const failures: string[] = [];
        for (const card of ["business_process", "financials", "children", "attendance", "health_safety", "household"]) {
            const cell = page.locator(`[data-fp-composer-cell="${card}"]`).first();
            if (!(await cell.count())) { perCard[card] = "not on this surface"; continue; }
            // Bring the card into the viewport: `page.mouse` is viewport-relative, and a
            // gesture aimed below the fold lands on nothing at all.
            await cell.scrollIntoViewIfNeeded();
            await page.waitForTimeout(400);
            const box = (await cell.boundingBox())!;
            // A short, ordinary drag — this asserts ACTIVATION, which is the contract that
            // differed per card, not where the card ends up.
            const target = { x: box.x + box.width / 2 + 140, y: box.y + box.height / 2 - 90 };
            const moved = await dragCard(page, card, target, `03-drag-${card}`);
            perCard[card] = {
                ghostDrawn: Boolean(moved.during.ghost),
                ghost: moved.during.ghost,
                landedAt: moved.after.areas.find((a) => a.card === card),
            };
            if (!moved.during.ghost) failures.push(card);
        }
        evidence.activationFailures = failures;
        evidence.perCard = perCard;
        evidence.pageErrors = pageErrors;

        writeFileSync(`${OUT}/evidence.json`, JSON.stringify(evidence, null, 2));
        // Every card activates the same way, or the gesture is still card-specific.
        expect(failures, "cards that would not start a drag").toEqual([]);
        expect(pageErrors, "no page errors during certification").toEqual([]);
    });
});
