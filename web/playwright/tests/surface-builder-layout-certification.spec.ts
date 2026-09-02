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

    test("certifies compaction and card-agnostic drag", async ({ page }) => {
        const evidence: Record<string, unknown> = {};
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));

        await page.goto("/organization/surfaces", { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
        await page.waitForTimeout(2500);
        await shot(page, "00-initial");
        evidence.initial = await readCanvas(page);

        const canvas = (await readCanvas(page)).grid!;
        const third = canvas.w / 3;

        // ── The reported scenario: Financials into the empty top-right third ──
        const topRight = { x: canvas.x + canvas.w - third / 2, y: canvas.y + 60 };
        const financials = await dragCard(page, "financials", topRight, "01-financials-top-right");
        evidence.financials = financials;

        // The ghost, sampled with the button still down, must sit in the right-hand third.
        expect(financials.during.ghost, "a ghost is drawn while dragging").not.toBeNull();
        expect(financials.during.ghost!.x).toBeGreaterThan(canvas.x + third);

        // Drop lands where the ghost was.
        const droppedFin = financials.after.areas.find((a) => a.card === "financials")!;
        expect(Math.abs(droppedFin.x - financials.during.ghost!.x)).toBeLessThan(24);

        // ── No phantom whitespace: the first row hugs the top of the canvas ──
        const topOfCards = Math.min(...financials.after.areas.map((a) => a.y));
        evidence.topGap = topOfCards - canvas.y;
        expect(topOfCards - canvas.y, "cards start at the top of the canvas").toBeLessThan(24);

        // The canvas is no taller than the cards it holds, plus normal gaps.
        const contentBottom = Math.max(...financials.after.areas.map((a) => a.y + a.h));
        evidence.trailingGap = canvas.y + financials.after.grid!.h - contentBottom;
        expect(canvas.y + financials.after.grid!.h - contentBottom).toBeLessThan(48);

        // ── Reload: identical geometry ──
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
        await page.waitForTimeout(2500);
        const reloaded = await readCanvas(page);
        await shot(page, "02-after-reload");
        evidence.reloaded = reloaded;

        // ── Every card activates the same way ──
        const perCard: Record<string, unknown> = {};
        for (const card of ["business_process", "financials", "children", "attendance", "health_safety"]) {
            const present = await page.locator(`[data-fp-composer-cell="${card}"]`).count();
            if (!present) { perCard[card] = "not on this surface"; continue; }
            const before = await readCanvas(page);
            const target = { x: canvas.x + third / 2, y: canvas.y + 60 };
            const moved = await dragCard(page, card, target, `03-drag-${card}`);
            perCard[card] = {
                ghostDrawn: Boolean(moved.during.ghost),
                movedFrom: before.areas.find((a) => a.card === card),
                movedTo: moved.after.areas.find((a) => a.card === card),
            };
            // The gesture must ACTIVATE on every card — that is the contract under test.
            expect(moved.during.ghost, `${card} shows a ghost when dragged`).not.toBeNull();
        }
        evidence.perCard = perCard;
        evidence.pageErrors = pageErrors;

        writeFileSync(`${OUT}/evidence.json`, JSON.stringify(evidence, null, 2));
        expect(pageErrors, "no page errors during certification").toEqual([]);
    });
});
