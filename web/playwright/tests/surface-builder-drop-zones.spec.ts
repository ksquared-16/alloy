import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * SURFACE COMPOSER — the two acceptance cases, and only those two.
 *
 * The drag no longer infers a destination from the pointer; it enumerates the legal
 * destinations, draws them, and lets the pointer select one. So this spec does not
 * ask "did the card end up somewhere reasonable?" — it asks the three questions
 * that model makes answerable:
 *
 *   1. Is the destination VISIBLE before the drop? (`[data-fp-drop-zone]` in the DOM)
 *   2. Does the pointer SELECT it? (`data-fp-drop-zone-active`)
 *   3. Does the card land on exactly that rectangle? (zone rect === committed rect)
 *
 * The third is the one that matters. Every previous round could satisfy a model
 * assertion and still fail the operator, because the thing the operator was shown
 * and the thing the code computed were two different objects. Here they are one
 * object, and the test compares the drawn rectangle to the landed one in PIXELS.
 */

const OUT = "/tmp/alloy-drop-zones";
const BUILDER = "/organization/surfaces?section=focus-panels&layout=enrollment-focus-panel-summary";
const GAP = 10;

type Rect = { x: number; y: number; w: number; h: number };

const rectOf = (b: { x: number; y: number; width: number; height: number }): Rect => ({
    x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
});

async function readZones(page: Page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-fp-drop-zone]")).map((el) => {
            const b = el.getBoundingClientRect();
            return {
                id: el.getAttribute("data-fp-drop-zone")!,
                colStart: Number(el.getAttribute("data-fp-drop-zone-col")),
                top: Number(el.getAttribute("data-fp-drop-zone-top")),
                after: el.getAttribute("data-fp-drop-zone-after") || null,
                active: el.getAttribute("data-fp-drop-zone-active") === "true",
                x: Math.round(b.x), y: Math.round(b.y),
                w: Math.round(b.width), h: Math.round(b.height),
            };
        }));
}

async function readCards(page: Page) {
    return page.evaluate(() => {
        const grid = document.querySelector(".alloy-os-fp-canvas--grid");
        const base = grid?.getBoundingClientRect() ?? new DOMRect();
        return {
            grid: { x: Math.round(base.x), y: Math.round(base.y), w: Math.round(base.width), h: Math.round(base.height) },
            cards: Object.fromEntries(
                Array.from(document.querySelectorAll("[data-fp-grid-area]")).map((el) => {
                    const b = el.getBoundingClientRect();
                    return [el.getAttribute("data-fp-grid-area")!, {
                        x: Math.round(b.x), y: Math.round(b.y),
                        w: Math.round(b.width), h: Math.round(b.height),
                        // Canvas-relative, which is the space the zones are authored in.
                        top: Math.round(b.y - base.y),
                    }];
                })),
        };
    });
}

/** Press the card's grip and travel far enough to make it a drag, not a click. */
async function grab(page: Page, card: string) {
    const grip = page.locator(`[data-fp-composer-cell="${card}"] .alloy-os-fp-composer-cell__grip`);
    await expect(grip, `${card} has a grip`).toBeVisible();
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Past the 4px travel threshold: the press becomes a drag and the zones appear.
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, { steps: 4 });
    await page.waitForTimeout(120);
}

test.describe("Surface composer — explicit drop zones", () => {
    test.setTimeout(300_000);
    test.use({ viewport: { width: 1600, height: 2000 } });

    test.beforeEach(async ({ page }) => {
        mkdirSync(OUT, { recursive: true });
        await page.goto(BUILDER, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
        await page.waitForTimeout(2500);
    });

    /*
     * ── CASE 1: ATTENDANCE ──
     *
     * "A left-side valid drop zone must visibly appear beside Children/Household."
     *
     * This is the gesture that failed six rounds in a row. The assertion is not that
     * the drop works — it is that the left destination is ON SCREEN before the
     * operator commits to anything, so the question "does left exist?" is settled by
     * looking rather than by attempting.
     */
    test("ATTENDANCE: the left-hand destination is visible, selectable, and lands where it is drawn", async ({ page }) => {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            await grab(page, "attendance");

            const zones = await readZones(page);
            expect(zones.length, `attempt ${attempt}: destinations are offered`).toBeGreaterThan(0);

            const left = zones.filter((z) => z.colStart === 1);
            expect(left.length, `attempt ${attempt}: a LEFT destination is on screen`).toBeGreaterThan(0);

            if (attempt === 1) {
                await page.screenshot({ path: `${OUT}/attendance-left-target-available.png`, fullPage: true });
            }

            // Aim at the top of the left column — the destination beside Children.
            const target = left.reduce((a, b) => (a.top <= b.top ? a : b));
            await page.mouse.move(target.x + target.w / 2, target.y + Math.min(target.h / 2, 60), { steps: 12 });
            await page.waitForTimeout(120);

            const hot = (await readZones(page)).find((z) => z.active);
            expect(hot, `attempt ${attempt}: the aimed zone highlights`).toBeTruthy();
            expect(hot!.colStart, `attempt ${attempt}: it is the LEFT zone`).toBe(1);

            if (attempt === 1) {
                await page.screenshot({ path: `${OUT}/attendance-left-target-selected.png`, fullPage: true });
            }

            // The highlighted zone is drawn at the rectangle the card takes. Record it,
            // then drop and compare pixels — this is the whole point of the model.
            const drawn = { x: hot!.x, y: hot!.y, w: hot!.w, h: hot!.h };
            await page.mouse.up();
            await page.waitForTimeout(500);

            const after = await readCards(page);
            const landed = after.cards["attendance"]!;
            expect(Math.abs(landed.x - drawn.x), `attempt ${attempt}: x`).toBeLessThanOrEqual(2);
            expect(Math.abs(landed.y - drawn.y), `attempt ${attempt}: y`).toBeLessThanOrEqual(2);
            expect(Math.abs(landed.w - drawn.w), `attempt ${attempt}: width`).toBeLessThanOrEqual(2);

            writeFileSync(`${OUT}/attendance-attempt-${attempt}.json`,
                JSON.stringify({ zones, drawn, landed }, null, 2));
        }
        await page.screenshot({ path: `${OUT}/attendance-committed.png`, fullPage: true });
    });

    /*
     * ── CASE 2: HEALTH ──
     *
     * "A valid right-side zone immediately below Household must appear… Preview sits
     * at Household.bottom + normal gutter. No artificial whitespace."
     *
     * The gutter is asserted numerically, because "no artificial whitespace" was the
     * defect that started this: shared row tracks put 268px between Household and the
     * card directly beneath it. One gutter, or this fails.
     */
    test("HEALTH: the destination below Household is offered at exactly one gutter", async ({ page }) => {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const before = await readCards(page);
            const household = before.cards["household"];
            test.skip(!household, "this surface has no Household card");

            await grab(page, "health_safety");

            const zones = await readZones(page);
            const below = zones.find((z) => z.after === "household");
            expect(below, `attempt ${attempt}: "below Household" is offered`).toBeTruthy();

            // One gutter below Household's bottom — measured in the canvas's own space.
            expect(below!.top, `attempt ${attempt}: exactly one gutter, no phantom rows`)
                .toBe(household!.top + household!.h + GAP);

            if (attempt === 1) {
                await page.screenshot({ path: `${OUT}/health-below-household-available.png`, fullPage: true });
            }

            await page.mouse.move(below!.x + below!.w / 2, below!.y + Math.min(below!.h / 2, 60), { steps: 12 });
            await page.waitForTimeout(120);

            const hot = (await readZones(page)).find((z) => z.active);
            expect(hot, `attempt ${attempt}: the aimed zone highlights`).toBeTruthy();
            expect(hot!.after, `attempt ${attempt}: it is the below-Household zone`).toBe("household");

            if (attempt === 1) {
                await page.screenshot({ path: `${OUT}/health-below-household-selected.png`, fullPage: true });
            }

            const drawn = { x: hot!.x, y: hot!.y, w: hot!.w, h: hot!.h };
            await page.mouse.up();
            await page.waitForTimeout(500);

            const after = await readCards(page);
            const landed = after.cards["health_safety"]!;
            expect(Math.abs(landed.x - drawn.x), `attempt ${attempt}: x`).toBeLessThanOrEqual(2);
            expect(Math.abs(landed.y - drawn.y), `attempt ${attempt}: y`).toBeLessThanOrEqual(2);
            // And the gutter survives the commit.
            expect(landed.top - (after.cards["household"]!.top + after.cards["household"]!.h),
                `attempt ${attempt}: one gutter after the drop`).toBe(GAP);

            writeFileSync(`${OUT}/health-attempt-${attempt}.json`,
                JSON.stringify({ zones, drawn, landed }, null, 2));
        }
        await page.screenshot({ path: `${OUT}/health-committed.png`, fullPage: true });
    });
});
