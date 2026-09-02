import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = "/tmp/surface-grab";
const BUILDER = "/organization/surfaces?section=focus-panels&layout=enrollment-focus-panel-summary";
test.use({ viewport: { width: 1600, height: 2400 } });
test.setTimeout(900_000);
const rects = (p: Page) => p.evaluate(() => {
    const r = (el: Element) => { const b = el.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const g = document.querySelector(".alloy-os-fp-canvas--grid");
    return { grid: g ? r(g) : null, areas: Array.from(document.querySelectorAll("[data-fp-grid-area]"))
        .map((el) => ({ card: el.getAttribute("data-fp-grid-area"), ...r(el) })) };
});
async function open(p: Page) {
    await p.goto(BUILDER, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("[data-focus-panel-runtime-composer]", { timeout: 90_000 });
    await p.waitForTimeout(4000);
    await p.evaluate(() => document.querySelector(".alloy-os-fp-canvas--grid")?.scrollIntoView({ block: "start" }));
    await p.waitForTimeout(600);
}
/** Grab at a fraction of the card's drag chrome, then move to an absolute target. */
async function dragFrom(p: Page, card: string, grabFrac: number, target: (g: any) => { x: number; y: number }, label: string) {
    const cell = p.locator(`[data-fp-composer-cell="${card}"]`).first();
    await cell.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    const before = await rects(p);
    const bb = (await cell.boundingBox())!;
    // Stay inside the drag bar: it stops 96px short of the right edge.
    const barRight = bb.x + Math.max(60, bb.width - 96);
    const gx = Math.min(barRight - 4, bb.x + 4 + (barRight - bb.x - 8) * grabFrac);
    const from = { x: gx, y: bb.y + 20 };
    const t = target(before.grid);
    await p.mouse.move(from.x, from.y); await p.mouse.down();
    await p.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
    for (let i = 1; i <= 24; i += 1) {
        await p.mouse.move(from.x + ((t.x-from.x)*i)/24, from.y + ((t.y-from.y)*i)/24); await p.waitForTimeout(9);
    }
    await p.waitForTimeout(200);
    await p.mouse.up(); await p.waitForTimeout(500);
    const after = await rects(p);
    await p.screenshot({ path: `${OUT}/${label}.png` });
    const c = after.areas.find((a) => a.card === card)!;
    return { grabFrac, x: c.x, y: c.y, w: c.w, leftFlush: c.x - after.grid!.x, after };
}
test("grab position cannot change the destination", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const errs: string[] = []; page.on("pageerror", (e) => errs.push(String(e)));
    await open(page);
    const left: any[] = [], right: any[] = [];
    for (const frac of [0.05, 0.5, 0.95]) {
        // Send it right first, then bring it to the LEFT region from that grab point.
        await dragFrom(page, "attendance", frac, (g) => ({ x: g.x + g.w * 0.8, y: g.y + 300 }), `pre-${frac}`);
        left.push(await dragFrom(page, "attendance", frac, (g) => ({ x: g.x + g.w * 0.2, y: g.y + 300 }), `attendance-left-${frac}`));
        right.push(await dragFrom(page, "attendance", frac, (g) => ({ x: g.x + g.w * 0.8, y: g.y + 300 }), `attendance-right-${frac}`));
    }
    const health: any[] = [];
    for (const frac of [0.05, 0.5, 0.95]) {
        health.push(await dragFrom(page, "health_safety", frac, (g) => ({ x: g.x + g.w * 0.8, y: g.y + 700 }), `health-right-${frac}`));
    }
    writeFileSync(`${OUT}/result.json`, JSON.stringify({ left, right, health, errs }, null, 2));
});
