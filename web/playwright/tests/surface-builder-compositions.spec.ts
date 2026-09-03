import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * SURFACE BUILDER — the row compositions an operator actually asks for, plus a
 * persistence pass and an unscripted free-form pass.
 */

const OUT = "/tmp/surface-final";
const BUILDER = "/organization/surfaces?section=focus-panels&layout=enrollment-focus-panel-summary";
const GAP = 10;

type Rect = { x: number; y: number; w: number; h: number };
type Area = Rect & { card: string; row: string | null };

const shot = async (page: Page, name: string) => {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
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
                card: el.getAttribute("data-fp-grid-area") ?? "",
                row: el.getAttribute("data-fp-grid-row"),
                ...r(el),
            })),
            dragging: document.querySelector("[data-fp-composer-dragging]")
                ?.getAttribute("data-fp-composer-cell") ?? null,
        };
    });
}

const overlapping = (areas: Area[]) => {
    let n = 0;
    for (let i = 0; i < areas.length; i += 1)
        for (let j = i + 1; j < areas.length; j += 1) {
            const a = areas[i]!, b = areas[j]!;
            if (a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2) n += 1;
        }
    return n;
};

function worstBand(grid: Rect, areas: Area[]) {
    let reach = grid.y, worst = 0;
    for (const a of [...areas].sort((p, q) => p.y - q.y)) {
        if (a.y > reach) worst = Math.max(worst, a.y - reach);
        reach = Math.max(reach, a.y + a.h);
    }
    return worst;
}

const columnsOf = (grid: Rect, a: Rect) => Math.round((a.w + GAP) / ((grid.w + GAP) / 12));

async function openBuilder(page: Page) {
    await page.goto(BUILDER, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() =>
        document.querySelector(".alloy-os-fp-canvas--grid")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(500);
}

async function resizeTo(page: Page, card: string, columns: number) {
    /*
     * A west handle can only widen to the canvas edge, so a card sitting at column 5
     * cannot be dragged out to twelve columns — the grid clamps it, correctly. An
     * operator moves the card left first; so does this.
     */
    const here = (await readCanvas(page)).areas.find((a) => a.card === card);
    const grid0 = (await readCanvas(page)).grid!;
    if (here && Math.round((here.x - grid0.x) / ((grid0.w + GAP) / 12)) + columns > 12) {
        await dragTo(page, card, (g) => ({ x: g.x + 40, y: g.y + 20 }));
    }
    const cell = page.locator(`[data-fp-composer-cell="${card}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await cell.hover();
    await page.waitForTimeout(220);
    const grid = (await readCanvas(page)).grid!;
    const box = (await cell.boundingBox())!;
    const hb = (await cell.locator(".alloy-os-fp-composer-cell__handle--w").first().boundingBox())!;
    const track = (grid.w - 11 * GAP) / 12;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + columns * track + (columns - 1) * GAP, hb.y + hb.height / 2, { steps: 16 });
    await page.waitForTimeout(110);
    await page.mouse.up();
    await page.waitForTimeout(550);
}

async function dragTo(page: Page, card: string, point: (g: Rect, b: Rect) => { x: number; y: number }) {
    const cell = page.locator(`[data-fp-composer-cell="${card}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await page.waitForTimeout(220);
    const before = await readCanvas(page);
    const bb = (await cell.boundingBox())!;
    const box: Rect = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
    const to = point(before.grid!, box);
    await page.mouse.move(box.x + box.w / 2, box.y + Math.min(60, box.h / 2));
    await page.mouse.down();
    await page.mouse.move(box.x + box.w / 2 + 14, box.y + Math.min(60, box.h / 2) + 14, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 16 });
    await page.waitForTimeout(150);
    const during = await readCanvas(page);
    await page.mouse.up();
    await page.waitForTimeout(430);
    const after = await readCanvas(page);
    const shown = during.areas.find((a) => a.card === card);
    const landed = after.areas.find((a) => a.card === card);
    return {
        after, activated: during.dragging === card,
        previewMatchesCommit: Boolean(shown && landed
            && Math.abs(shown.x - landed.x) < 24 && Math.abs(shown.y - landed.y) < 24),
        band: worstBand(after.grid!, after.areas), overlaps: overlapping(after.areas),
    };
}

/** The set of cards sharing the topmost row, left to right, with their spans. */
function topRow(grid: Rect, areas: Area[]) {
    const top = Math.min(...areas.map((a) => a.y));
    return areas.filter((a) => Math.abs(a.y - top) < 24)
        .sort((a, b) => a.x - b.x)
        .map((a) => ({ card: a.card, columns: columnsOf(grid, a) }));
}

test.describe("Surface Builder — compositions, persistence, free-form", () => {
    test.setTimeout(900_000);
    test.use({ viewport: { width: 1600, height: 2400 } });

    test("builds each row composition an operator asks for", async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await openBuilder(page);
        const record: Array<Record<string, unknown>> = [];

        // Each case: author the widths, then drag the second card up beside the first.
        const cases: Array<{ name: string; a: [string, number]; b: [string, number]; c?: [string, number] }> = [
            { name: "2/3 + 1/3", a: ["business_process", 8], b: ["financials", 4] },
            { name: "1/3 + 2/3", a: ["business_process", 4], b: ["financials", 8] },
            { name: "1/2 + 1/2", a: ["business_process", 6], b: ["financials", 6] },
            { name: "1/3 + 1/3 + 1/3", a: ["business_process", 4], b: ["financials", 4], c: ["attendance", 4] },
            { name: "full width", a: ["business_process", 12], b: ["financials", 12] },
        ];

        for (const c of cases) {
            await resizeTo(page, c.a[0], c.a[1]);
            await resizeTo(page, c.b[0], c.b[1]);
            if (c.c) await resizeTo(page, c.c[0], c.c[1]);
            // Drag the first card to the very top so the row is unambiguous.
            await dragTo(page, c.a[0], (g) => ({ x: g.x + 40, y: g.y + 20 }));
            const second = await dragTo(page, c.b[0], (g, b) =>
                ({ x: Math.min(g.x + g.w - 40, g.x + c.a[1] * (g.w / 12) + b.w / 2), y: g.y + 30 }));
            if (c.c) await dragTo(page, c.c[0], (g) => ({ x: g.x + g.w - 60, y: g.y + 30 }));

            const canvas = await readCanvas(page);
            const row = topRow(canvas.grid!, canvas.areas);
            record.push({
                composition: c.name, topRow: row,
                previewMatchesCommit: second.previewMatchesCommit,
                band: worstBand(canvas.grid!, canvas.areas),
                overlaps: overlapping(canvas.areas),
            });
            await shot(page, `composition-${c.name.replace(/[^a-z0-9]+/gi, "-")}`);

            expect(overlapping(canvas.areas), `${c.name}: no overlap`).toBe(0);
            expect(worstBand(canvas.grid!, canvas.areas), `${c.name}: no phantom row`).toBeLessThan(40);
            // The authored widths survive composing.
            const spans = new Map(canvas.areas.map((a) => [a.card, columnsOf(canvas.grid!, a)]));
            expect(spans.get(c.a[0]), `${c.name}: first card span`).toBe(c.a[1]);
            expect(spans.get(c.b[0]), `${c.name}: second card span`).toBe(c.b[1]);
        }
        writeFileSync(`${OUT}/compositions.json`, JSON.stringify({ record, pageErrors }, null, 2));
        expect(pageErrors).toEqual([]);
    });

    test("saves, reloads, and reproduces the packed layout exactly", async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await openBuilder(page);

        await resizeTo(page, "business_process", 8);
        await resizeTo(page, "financials", 4);
        await dragTo(page, "business_process", (g) => ({ x: g.x + 40, y: g.y + 20 }));
        await dragTo(page, "financials", (g) => ({ x: g.x + g.w - 60, y: g.y + 30 }));
        const arranged = await readCanvas(page);
        await shot(page, "persist-01-arranged");

        await page.getByRole("button", { name: "Save draft" }).first().click();
        await page.waitForTimeout(4000);
        await shot(page, "persist-02-saved");

        await openBuilder(page);
        const reloaded = await readCanvas(page);
        await shot(page, "persist-03-reloaded");

        const norm = (c: Awaited<ReturnType<typeof readCanvas>>) =>
            [...c.areas].sort((a, b) => a.card.localeCompare(b.card))
                .map((a) => `${a.card}:${columnsOf(c.grid!, a)}:${a.row}`);

        writeFileSync(`${OUT}/persistence.json`, JSON.stringify({
            arranged: norm(arranged), reloaded: norm(reloaded),
            arrangedBand: worstBand(arranged.grid!, arranged.areas),
            reloadedBand: worstBand(reloaded.grid!, reloaded.areas),
            pageErrors,
        }, null, 2));

        expect(norm(reloaded), "reload reproduces spans and rows").toEqual(norm(arranged));
        expect(worstBand(reloaded.grid!, reloaded.areas), "no phantom rows after reload").toBeLessThan(40);
        expect(overlapping(reloaded.areas)).toBe(0);
        expect(pageErrors).toEqual([]);
    });

    test("free-form composing stays boring", async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await openBuilder(page);

        // A deterministic but unscripted-in-shape sequence: resize, configure and move
        // interleaved the way an operator wanders, not a tidy per-card sweep.
        let seed = 20260903;
        const rand = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
        const cards = (await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-fp-composer-cell]"))
                .map((e) => e.getAttribute("data-fp-composer-cell")!))).slice(0, 6);
        const spans = [4, 6, 8, 12];
        const ops: Array<Record<string, unknown>> = [];

        for (let i = 0; i < 24; i += 1) {
            const card = cards[rand(cards.length)]!;
            const kind = rand(3);
            if (kind === 0) {
                await resizeTo(page, card, spans[rand(spans.length)]!);
                const c = await readCanvas(page);
                ops.push({ i, op: "resize", card, band: worstBand(c.grid!, c.areas), overlaps: overlapping(c.areas) });
                expect(overlapping(c.areas), `op ${i} resize ${card}: no overlap`).toBe(0);
                expect(worstBand(c.grid!, c.areas), `op ${i} resize ${card}: no phantom row`).toBeLessThan(40);
            } else if (kind === 1) {
                const cell = page.locator(`[data-fp-composer-cell="${card}"]`).first();
                await cell.scrollIntoViewIfNeeded();
                await cell.hover();
                await cell.locator(".alloy-os-fp-composer-cell__configure").first()
                    .click({ force: true }).catch(() => {});
                await page.waitForTimeout(500);
                ops.push({ i, op: "configure", card });
            } else {
                const where = rand(4);
                const moved = await dragTo(page, card, (g, b) => (
                    where === 0 ? { x: g.x + 40, y: g.y + 20 }
                    : where === 1 ? { x: g.x + g.w - 60, y: g.y + 30 }
                    : where === 2 ? { x: b.x + 220, y: b.y + 40 }
                    : { x: Math.max(20, b.x - 200), y: b.y + b.h + 120 }));
                ops.push({ i, op: "drag", card, where, activated: moved.activated,
                    previewMatchesCommit: moved.previewMatchesCommit,
                    band: moved.band, overlaps: moved.overlaps });
                expect(moved.activated, `op ${i} drag ${card}: activates`).toBe(true);
                expect(moved.previewMatchesCommit, `op ${i} drag ${card}: preview equals commit`).toBe(true);
                expect(moved.overlaps, `op ${i} drag ${card}: no overlap`).toBe(0);
                expect(moved.band, `op ${i} drag ${card}: no phantom row`).toBeLessThan(40);
            }
        }
        await shot(page, "freeform-final");
        writeFileSync(`${OUT}/freeform.json`, JSON.stringify({ ops, pageErrors }, null, 2));
        expect(pageErrors).toEqual([]);
    });
});
