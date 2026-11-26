import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * HOUSEHOLD → HEALTH, IN ONE COLUMN REGION.
 *
 * ── WHAT THE "EXCESSIVE WHITESPACE" ACTUALLY WAS ──
 *
 * Measured on the lane server before this spec existed:
 *
 *     household       cols 7-12   y  645..1011
 *     attendance      cols 1-6    y  883..1308
 *     health_safety   cols 1-6    y 1318..1687
 *
 * Health sat one gutter below ATTENDANCE — `1308 + 10 = 1318` — because Health is
 * authored in columns 1-6 and shares no column with Household at all. The space
 * under Household was not a gutter between two stacked cards; it was the right
 * column ending while the left column carried on. Column-aware layout is supposed
 * to allow exactly that, so there was nothing in the resolver to fix.
 *
 * What this spec proves instead is the property the operator is actually asking
 * for: once Health occupies the same region as Household, it packs to ONE gutter
 * beneath it — and that survives moving it away and back, a save, and a reload.
 */

const OUT = "/tmp/alloy-household-health";
const BUILDER = "/organization/surfaces?section=focus-panels&layout=enrollment-focus-panel-summary";
const GAP = 10;

type Placed = {
    card: string;
    colStart: number; colSpan: number;
    top: number; height: number; bottom: number;
};

async function readStack(page: Page): Promise<Record<string, Placed>> {
    return page.evaluate(() => {
        const grid = document.querySelector(".alloy-os-fp-canvas--grid")!;
        const base = grid.getBoundingClientRect();
        const dump = (window as unknown as {
            __ALLOY_SURFACE_STATE__?: () => { cards: Array<{ card: string; grid?: { colStart: number; colSpan: number } }> };
        }).__ALLOY_SURFACE_STATE__?.();
        const cols = new Map((dump?.cards ?? []).map((c) => [c.card, c.grid]));
        const out: Record<string, Placed> = {};
        for (const el of Array.from(document.querySelectorAll("[data-fp-grid-area]"))) {
            const card = el.getAttribute("data-fp-grid-area")!;
            const b = el.getBoundingClientRect();
            const g = cols.get(card);
            out[card] = {
                card,
                colStart: g?.colStart ?? -1,
                colSpan: g?.colSpan ?? -1,
                top: Math.round(b.y - base.y),
                height: Math.round(b.height),
                bottom: Math.round(b.y - base.y + b.height),
            };
        }
        return out;
    });
}

async function grab(page: Page, card: string) {
    const grip = page.locator(`[data-fp-composer-cell="${card}"] .alloy-os-fp-composer-cell__grip`);
    await expect(grip, `${card} has a grip`).toBeVisible();
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, { steps: 4 });
    await page.waitForTimeout(150);
}

/** Drop `card` onto the zone that follows `after` — the offered destination, by name. */
async function dropAfter(page: Page, card: string, after: string) {
    await grab(page, card);
    const zone = page.locator(`[data-fp-drop-zone-after="${after}"]`);
    await expect(zone, `a "below ${after}" destination is offered`).toHaveCount(1);
    const box = (await zone.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 60), { steps: 12 });
    await page.waitForTimeout(150);
    await expect(page.locator("[data-fp-drop-zone-active='true']")).toHaveAttribute(
        "data-fp-drop-zone-after", after);
    await page.mouse.up();
    await page.waitForTimeout(600);
}

/** Health directly under Household, one gutter, same columns. The whole point. */
function expectPacked(stack: Record<string, Placed>, label: string) {
    const household = stack["household"]!;
    const health = stack["health_safety"]!;
    expect(household.colStart, `${label}: Household columns`).toBe(7);
    expect(health.colStart, `${label}: Health took Household's region`).toBe(household.colStart);
    expect(health.colSpan, `${label}: same width`).toBe(household.colSpan);
    expect(health.top - household.bottom, `${label}: exactly one gutter`).toBe(GAP);
}

test.describe("Household → Health packs to one gutter", () => {
    test.setTimeout(300_000);
    test.use({ viewport: { width: 1600, height: 2000 } });

    test("same region, one gutter — through a move away and back, a save, and a reload", async ({ page }) => {
        mkdirSync(OUT, { recursive: true });
        const evidence: Record<string, unknown> = {};

        await page.goto(BUILDER, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
        await page.waitForTimeout(3000);

        /*
         * The starting state, recorded rather than assumed. Health begins in columns
         * 1-6; that is the authored layout, not a resolver defect.
         */
        const before = await readStack(page);
        evidence.before = before;
        await page.screenshot({ path: `${OUT}/1-before.png`, fullPage: true });

        // ── Put Health in Household's region, via the offered destination ──
        await dropAfter(page, "health_safety", "household");
        const packed = await readStack(page);
        evidence.afterDrop = packed;
        expectPacked(packed, "after drop");
        await page.screenshot({ path: `${OUT}/2-packed.png`, fullPage: true });

        // ── Move it away, then back: the same answer, not a lucky first attempt ──
        await dropAfter(page, "health_safety", "attendance");
        const movedAway = await readStack(page);
        evidence.movedAway = movedAway;
        expect(movedAway["health_safety"]!.colStart, "moved to the left region").toBe(1);

        await dropAfter(page, "health_safety", "household");
        const movedBack = await readStack(page);
        evidence.movedBack = movedBack;
        expectPacked(movedBack, "moved away and back");

        // ── Save, so the composition is the authored one and not a session artefact ──
        const save = page.getByRole("button", { name: /save draft/i });
        await expect(save, "the builder offers Save draft").toBeVisible();
        await save.click();
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/3-saved.png`, fullPage: true });

        // ── Reload: what was saved is what comes back ──
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 60_000 });
        await page.waitForTimeout(3000);
        const reloaded = await readStack(page);
        evidence.afterReload = reloaded;
        expectPacked(reloaded, "after reload");
        await page.screenshot({ path: `${OUT}/4-reloaded.png`, fullPage: true });

        /*
         * And the regression the narrow fix must not cause: cards in OTHER columns
         * still do not influence this spacing. Health follows Household and nothing
         * in columns 1-6 has any say in where it sits.
         */
        const health = reloaded["health_safety"]!;
        for (const other of Object.values(reloaded)) {
            if (other.card === "health_safety" || other.card === "household") continue;
            const sharesColumn =
                other.colStart < health.colStart + health.colSpan
                && health.colStart < other.colStart + other.colSpan;
            if (!sharesColumn) {
                expect(health.top, `${other.card} is in other columns and must not push Health`)
                    .toBe(reloaded["household"]!.bottom + GAP);
            }
        }

        writeFileSync(`${OUT}/evidence.json`, JSON.stringify(evidence, null, 2));
    });
});
