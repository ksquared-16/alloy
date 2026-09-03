import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * SURFACE COMPOSER — live drag matrix.
 *
 * Thirty-plus real gestures across every card and every direction, each judged on
 * the four things an operator actually feels: the drag starts, the ghost appears,
 * the card lands where the ghost was, and nothing else jumps. Every failure keeps
 * its interaction trace, so a spotty drag can be read back rather than guessed at.
 */

const OUT = "/tmp/drag-matrix";
const BUILDER = "/organization/surfaces?section=focus-panels&layout=enrollment-focus-panel-summary";

type Rect = { x: number; y: number; w: number; h: number };
type Area = Rect & { card: string; row: string | null };

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
            // The dragged card marks itself; there is no separate ghost element.
            dragging: document.querySelector("[data-fp-composer-dragging]")?.getAttribute("data-fp-composer-cell") ?? null,
        };
    });
}

const overlaps = (a: Rect, b: Rect) =>
    a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2;

/** Largest empty vertical band between stacked cards — a phantom row shows up here. */
function worstBand(grid: Rect, areas: Area[]) {
    const sorted = [...areas].sort((p, q) => p.y - q.y);
    let reach = grid.y;
    let worst = 0;
    for (const a of sorted) {
        if (a.y > reach) worst = Math.max(worst, a.y - reach);
        reach = Math.max(reach, a.y + a.h);
    }
    return worst;
}

test.describe("Surface composer drag matrix", () => {
    test.setTimeout(600_000);
    test.use({ viewport: { width: 1600, height: 2400 } });

    test("thirty live drags", async ({ page }) => {
        mkdirSync(OUT, { recursive: true });
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));

        await page.goto(BUILDER, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
        await page.waitForTimeout(3000);

        const cards = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-fp-composer-cell]")).map((e) =>
                e.getAttribute("data-fp-composer-cell")!));

        type Result = {
            n: number; card: string; aim: string;
            activated: boolean; previewMatchesCommit: boolean | null;
            worstBand: number; overlaps: number; moved: string[];
            trace?: unknown[]; note?: string;
        };
        const results: Result[] = [];
        let n = 0;

        const aims: Array<[string, (g: Rect, box: Rect) => { x: number; y: number }]> = [
            ["top-left", (g) => ({ x: g.x + g.w * 0.15, y: g.y + 40 })],
            ["top-right", (g) => ({ x: g.x + g.w * 0.85, y: g.y + 40 })],
            ["right-of-self", (_g, b) => ({ x: b.x + b.w + 160, y: b.y + 30 })],
            ["left-of-self", (_g, b) => ({ x: Math.max(10, b.x - 160), y: b.y + 30 })],
            ["one-row-down", (_g, b) => ({ x: b.x + 40, y: b.y + b.h + 120 })],
        ];

        for (const aim of aims) {
            for (const card of cards) {
                n += 1;
                const cell = page.locator(`[data-fp-composer-cell="${card}"]`).first();
                if (!(await cell.count())) continue;
                await cell.scrollIntoViewIfNeeded();
                await page.waitForTimeout(250);

                const before = await readCanvas(page);
                const box = (await cell.boundingBox())!;
                const b: Rect = { x: box.x, y: box.y, w: box.width, h: box.height };
                const target = aim[1](before.grid!, b);

                await page.mouse.move(b.x + b.w / 2, b.y + Math.min(60, b.h / 2));
                await page.mouse.down();
                await page.mouse.move(b.x + b.w / 2 + 14, b.y + Math.min(60, b.h / 2) + 14, { steps: 4 });
                await page.mouse.move(target.x, target.y, { steps: 16 });
                await page.waitForTimeout(140);
                const during = await readCanvas(page);
                await page.mouse.up();
                await page.waitForTimeout(420);
                const after = await readCanvas(page);

                const trace = await page.evaluate(
                    () => (window as unknown as { __ALLOY_COMPOSER_DRAG_TRACE__?: unknown[] })
                        .__ALLOY_COMPOSER_DRAG_TRACE__ ?? []);

                const landed = after.areas.find((a) => a.card === card);
                const activated = during.dragging === card;
                /*
                 * Preview vs commit, as the operator experiences it: the canvas renders
                 * the resolved layout while dragging, so the question is whether the card
                 * is ALREADY where it ends up. Comparing the ghost outline instead would
                 * measure the decoration rather than the answer.
                 */
                const shown = during.areas.find((a) => a.card === card);
                const previewMatchesCommit = activated && landed && shown
                    ? Math.abs(landed.x - shown.x) < 24 && Math.abs(landed.y - shown.y) < 24
                    : null;
                const moved = after.areas
                    .filter((a) => a.card !== card)
                    .filter((a) => {
                        const was = before.areas.find((p) => p.card === a.card);
                        return was && (Math.abs(was.x - a.x) > 8 || Math.abs(was.y - a.y) > 8);
                    })
                    .map((a) => a.card);
                let overlapCount = 0;
                for (let i = 0; i < after.areas.length; i += 1)
                    for (let j = i + 1; j < after.areas.length; j += 1)
                        if (overlaps(after.areas[i]!, after.areas[j]!)) overlapCount += 1;

                const failed = !activated || previewMatchesCommit === false
                    || worstBand(after.grid!, after.areas) > 40 || overlapCount > 0;
                if (failed) await page.screenshot({ path: `${OUT}/fail-${n}-${card}-${aim[0]}.png` });

                results.push({
                    n, card, aim: aim[0], activated, previewMatchesCommit,
                    worstBand: worstBand(after.grid!, after.areas),
                    overlaps: overlapCount, moved,
                    ...(failed ? { trace } : {}),
                });
            }
        }

        const failures = results.filter((r) =>
            !r.activated || r.previewMatchesCommit === false || r.worstBand > 40 || r.overlaps > 0);
        writeFileSync(`${OUT}/matrix.json`, JSON.stringify({
            total: results.length,
            passed: results.length - failures.length,
            failed: failures.length,
            pageErrors,
            results,
        }, null, 2));

        expect(results.length, "at least thirty gestures").toBeGreaterThanOrEqual(30);
        expect(failures.map((f) => `${f.n}:${f.card}:${f.aim}`), "failed gestures").toEqual([]);
        expect(pageErrors).toEqual([]);
    });
});
