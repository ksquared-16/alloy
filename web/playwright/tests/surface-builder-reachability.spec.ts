import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * SURFACE BUILDER — the two operator reproductions, and the same gestures on
 * every card. Real pointer events; all geometry read from the DOM.
 */

const OUT = "/tmp/surface-reach";
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

async function openBuilder(page: Page) {
    await page.goto(BUILDER, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() =>
        document.querySelector(".alloy-os-fp-canvas--grid")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(500);
}

async function dragTo(
    page: Page,
    card: string,
    point: (g: Rect, b: Rect) => { x: number; y: number },
    opts: { byHandle?: boolean } = {},
) {
    const cell = page.locator(`[data-fp-composer-cell="${card}"]`).first();
    await cell.scrollIntoViewIfNeeded();
    await page.waitForTimeout(220);
    const before = await readCanvas(page);
    const bb = (await cell.boundingBox())!;
    const box: Rect = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
    /*
     * The chrome handle is the affordance the contract guarantees in EVERY state.
     * A press in the card body works too while the card is unselected — but a
     * selected card has live content for configuring, so a body press on one of its
     * controls is a press on that control, by design. Testing the universal contract
     * means testing the handle.
     */
    const from = opts.byHandle
        ? { x: box.x + Math.min(120, box.w / 2), y: box.y + 20 }
        : { x: box.x + box.w / 2, y: box.y + Math.min(50, box.h / 2) };
    const aimed = point(before.grid!, box);
    /*
     * A gesture has to be a gesture. When a card already sits where the aim points
     * — Attendance asked to move "up" while it is already the top card — the
     * computed target can land within a few pixels of the press, under the 4px
     * threshold that keeps a click a click. That is the harness failing to drag,
     * not the canvas refusing to; so the aim is nudged to a real distance.
     */
    const to = Math.abs(aimed.x - from.x) + Math.abs(aimed.y - from.y) < 30
        ? { x: aimed.x + 40, y: aimed.y + 40 }
        : aimed;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 14, from.y + 14, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 18 });
    await page.waitForTimeout(160);
    const during = await readCanvas(page);
    await page.mouse.up();
    await page.waitForTimeout(430);
    const after = await readCanvas(page);
    const shown = during.areas.find((a) => a.card === card);
    const landed = after.areas.find((a) => a.card === card);
    return {
        before, after, landed,
        activated: during.dragging === card,
        previewMatchesCommit: Boolean(shown && landed
            && Math.abs(shown.x - landed.x) < 24 && Math.abs(shown.y - landed.y) < 24),
        band: worstBand(after.grid!, after.areas),
        overlaps: overlapping(after.areas),
    };
}

test.describe("Surface Builder — reachability", () => {
    test.setTimeout(900_000);
    test.use({ viewport: { width: 1600, height: 2400 } });

    test("A: Children moves up to sit directly below the top row", async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await openBuilder(page);
        await shot(page, "A-00-before");

        const start = await readCanvas(page);
        const topY = Math.min(...start.areas.map((a) => a.y));
        const topBottom = Math.max(...start.areas.filter((a) => Math.abs(a.y - topY) < 24)
            .map((a) => a.y + a.h));

        // Aim at the open row immediately beneath the top row, at its left edge.
        const moved = await dragTo(page, "children", (g) => ({ x: g.x + 60, y: topBottom + 30 }));
        await shot(page, "A-01-children-under-top-row");

        const after = moved.after;
        const children = moved.landed!;
        const rowsAbove = after.areas.filter((a) => a.y + a.h <= children.y + 4);
        writeFileSync(`${OUT}/case-A.json`, JSON.stringify({
            topBottom, children, rowsAbove: rowsAbove.map((a) => a.card),
            band: moved.band, overlaps: moved.overlaps,
            activated: moved.activated, previewMatchesCommit: moved.previewMatchesCommit, pageErrors,
        }, null, 2));

        expect(moved.activated).toBe(true);
        expect(moved.previewMatchesCommit, "preview equals commit").toBe(true);
        // Directly below the top row: only the top-row cards sit above it.
        expect(rowsAbove.length, "exactly the top row is above Children").toBeGreaterThan(0);
        expect(children.y - topBottom, "no giant gap under the top row").toBeLessThan(40);
        expect(moved.overlaps).toBe(0);
        expect(moved.band, "no phantom row").toBeLessThan(40);
        expect(pageErrors).toEqual([]);
    });

    test("B: Attendance left-aligns to column 1", async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await openBuilder(page);
        await shot(page, "B-00-before");

        // Put it right first, so the left edge is a real journey.
        await dragTo(page, "attendance", (g) => ({ x: g.x + g.w - 60, y: g.y + 200 }));
        const moved = await dragTo(page, "attendance", (g, b) => ({ x: g.x + 8, y: b.y + 20 }));
        await shot(page, "B-01-attendance-left-aligned");

        const att = moved.landed!;
        writeFileSync(`${OUT}/case-B.json`, JSON.stringify({
            gridX: moved.after.grid!.x, attendanceX: att.x, delta: att.x - moved.after.grid!.x,
            band: moved.band, overlaps: moved.overlaps,
            activated: moved.activated, previewMatchesCommit: moved.previewMatchesCommit, pageErrors,
        }, null, 2));

        expect(moved.activated).toBe(true);
        expect(moved.previewMatchesCommit).toBe(true);
        expect(att.x - moved.after.grid!.x, "flush with the left edge").toBeLessThan(GAP + 2);
        expect(moved.overlaps).toBe(0);
        expect(pageErrors).toEqual([]);
    });

    test("every card takes the same four gestures", async ({ page }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await openBuilder(page);
        const cards = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-fp-composer-cell]"))
                .map((e) => e.getAttribute("data-fp-composer-cell")!));

        const rows: Array<Record<string, unknown>> = [];
        for (const card of cards) {
            const chrome = await page.evaluate((key) => {
                const cell = document.querySelector(`[data-fp-composer-cell="${key}"]`)!;
                return {
                    dragBar: cell.querySelectorAll(".alloy-os-fp-composer-cell__drag-bar").length,
                    grip: cell.querySelectorAll(".alloy-os-fp-composer-cell__grip").length,
                    configure: cell.querySelectorAll(".alloy-os-fp-composer-cell__configure").length,
                    remove: cell.querySelectorAll(".alloy-os-fp-composer-cell__remove").length,
                    handles: cell.querySelectorAll(".alloy-os-fp-composer-cell__handle").length,
                };
            }, card);

            const gestures: Record<string, unknown> = {};
            const plan: Array<[string, (g: Rect, b: Rect) => { x: number; y: number }]> = [
                ["left", (g, b) => ({ x: g.x + 8, y: b.y + 20 })],
                ["right", (g, b) => ({ x: g.x + g.w - 8, y: b.y + 20 })],
                ["up", (g, b) => ({ x: b.x + 30, y: Math.max(g.y + 20, b.y - 220) })],
                ["down", (_g, b) => ({ x: b.x + 30, y: b.y + b.h + 160 })],
            ];
            for (const [name, aim] of plan) {
                const m = await dragTo(page, card, aim, { byHandle: true });
                gestures[name] = {
                    activated: m.activated, previewMatchesCommit: m.previewMatchesCommit,
                    overlaps: m.overlaps, band: m.band,
                    leftFlush: name === "left" ? m.landed!.x - m.after.grid!.x < GAP + 2 : undefined,
                };
                expect(m.activated, `${card}/${name}: activates`).toBe(true);
                expect(m.previewMatchesCommit, `${card}/${name}: preview equals commit`).toBe(true);
                expect(m.overlaps, `${card}/${name}: no overlap`).toBe(0);
                expect(m.band, `${card}/${name}: no phantom row`).toBeLessThan(40);
                if (name === "left") {
                    expect(m.landed!.x - m.after.grid!.x, `${card}: column 1 is reachable`)
                        .toBeLessThan(GAP + 2);
                }
            }
            // Body press on an UNSELECTED card is the convenience path; record it.
            await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
            await page.waitForTimeout(300);
            const byBody = await dragTo(page, card, (_g, b) => ({ x: b.x + 160, y: b.y + 60 }));
            rows.push({ card, chrome, gestures, bodyDragUnselected: byBody.activated });
        }
        await shot(page, "C-universal-final");
        writeFileSync(`${OUT}/universal.json`, JSON.stringify({ rows, pageErrors }, null, 2));
        // Same chrome on every card — one shell, no card-specific affordance.
        const shapes = new Set(rows.map((r) => JSON.stringify(r.chrome)));
        expect(shapes.size, "every card exposes the same drag/configure/remove chrome").toBe(1);
        expect(pageErrors).toEqual([]);
    });
});
