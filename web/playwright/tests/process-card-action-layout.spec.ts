/**
 * THE PROCESS CARD NEVER CUTS OFF ITS ACTIONS.
 *
 * Geometry is the only honest proof here, so this measures real boxes in a real browser rather than
 * asserting on the stylesheet — the CSS contract is held separately in
 * `tests/surfaces/processCardActionLayoutContract.test.ts`.
 *
 * The defect being guarded: the command row was a nowrap rail with `overflow-x: auto` and the
 * scrollbar hidden, so a command that did not fit sat outside the visible box with nothing to
 * indicate it existed. Measured on a deployed Waitlist card at `scrollWidth 409` against
 * `clientWidth 300` — the whole of "Send form" — and on a five-command card at 518 against 300.
 * Every one of six cards sampled across four work units was clipped, so this was the normal case.
 *
 * The assertions are deliberately about OUTCOMES an operator would notice: nothing hidden, nothing
 * outside the card, every configured command present and in its configured order, controls a
 * consistent height. How the row achieves that is the stylesheet's business.
 *
 * Read-only: opens records and measures. Mutates nothing.
 *
 * Env: PLAYWRIGHT_BASE_URL, PLAYWRIGHT_STORAGE_STATE, PROCESS_CARD_SHOT_DIR.
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3016";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const DIR = process.env.PROCESS_CARD_SHOT_DIR || "/tmp/process-card";
/** Work units sampled. The contract is general, so it is checked on more than one process. */
const WORK_UNITS = (process.env.PROCESS_CARD_WORK_UNITS || "waitlist,new").split(",");

const ROW = ".alloy-os-process__work-actions .alloy-os-currentwork__helpful-row";
const QUEUE_ROW = '[data-runtime-label="WU.QUEUE_ROW"]';

if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 10 * 60 * 1000 });

type ActionBox = { key: string | null; left: number; right: number; top: number; height: number; label: string };
type RowMeasure = {
    rowLeft: number;
    rowRight: number;
    scrollWidth: number;
    clientWidth: number;
    items: ActionBox[];
};

async function measureRow(page: Page): Promise<RowMeasure | null> {
    return page.evaluate((sel) => {
        const row = document.querySelector(sel);
        if (!row) return null;
        const box = row.getBoundingClientRect();
        const items = Array.from(row.children).map((child) => {
            const r = child.getBoundingClientRect();
            return {
                key: child.getAttribute("data-process-action") || child.getAttribute("data-process-action-group"),
                left: Math.round(r.left),
                right: Math.round(r.right),
                top: Math.round(r.top),
                height: Math.round(r.height),
                label: (child.textContent || "").trim(),
            };
        });
        return {
            rowLeft: Math.round(box.left),
            rowRight: Math.round(box.right),
            scrollWidth: row.scrollWidth,
            clientWidth: row.clientWidth,
            items,
        };
    }, ROW);
}

/** Open records until one renders a process-card command row. */
async function openRecordWithActions(page: Page, workUnit: string): Promise<RowMeasure | null> {
    await page.goto(`${BASE}/workspace/work-unit/${workUnit}`, { waitUntil: "domcontentloaded" });
    await page.locator(QUEUE_ROW).first().waitFor({ state: "visible", timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const rows = page.locator(QUEUE_ROW);
    const count = Math.min(await rows.count(), 5);
    for (let i = 0; i < count; i++) {
        await rows.nth(i).click({ noWaitAfter: true }).catch(() => {});
        await page.waitForTimeout(2600);
        const measured = await measureRow(page);
        if (measured && measured.items.length) return measured;
    }
    return null;
}

/** Every assertion an operator would make by looking at the card. */
function expectNothingHidden(m: RowMeasure, where: string) {
    // Nothing in a scrollable-but-invisible region.
    expect(m.scrollWidth, `${where}: row scrolls horizontally (${m.scrollWidth} > ${m.clientWidth})`)
        .toBeLessThanOrEqual(m.clientWidth + 1);
    // Nothing drawn outside the row's own box, in either direction.
    for (const item of m.items) {
        expect(item.right, `${where}: "${item.label}" overflows the right edge`).toBeLessThanOrEqual(m.rowRight + 1);
        expect(item.left, `${where}: "${item.label}" overflows the left edge`).toBeGreaterThanOrEqual(m.rowLeft - 1);
    }
}

test("process card actions fit, wrap and stay inside the card", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 950 } });
    const page = await ctx.newPage();
    const report: Record<string, unknown> = {};
    fs.mkdirSync(DIR, { recursive: true });

    let sampled = 0;
    for (const workUnit of WORK_UNITS) {
        // ── NORMAL WIDTH ──
        const wide = await openRecordWithActions(page, workUnit.trim());
        if (!wide) continue;
        sampled += 1;
        report[`${workUnit}_wide`] = wide;
        await page.screenshot({ path: path.join(DIR, `${workUnit}-wide.png`) });

        expectNothingHidden(wide, `${workUnit} @1440`);
        expect(wide.items.length, `${workUnit}: no commands rendered`).toBeGreaterThan(0);

        // Consistent control height — one row of commands, not a ransom note.
        const heights = [...new Set(wide.items.map((i) => i.height))];
        expect(heights.length, `${workUnit}: inconsistent control heights ${heights.join(",")}`).toBe(1);
        // Minimum usable target.
        expect(heights[0], `${workUnit}: control height ${heights[0]} is below a usable target`).toBeGreaterThanOrEqual(24);

        // Configured ORDER survives layout: reading order is left-to-right, top-to-bottom.
        const ordered = [...wide.items].sort((a, b) => a.top - b.top || a.left - b.left);
        expect(ordered.map((i) => i.key), `${workUnit}: configured order not preserved`).toEqual(
            wide.items.map((i) => i.key),
        );

        /*
         * ── ACROSS WIDTHS ──
         *
         * Swept rather than checked at one "narrow" width, because the interesting fact is that the
         * row barely narrows: the work band's column is `minmax(300px, 0.9fr)`, so it FLOORS at
         * 300px and only grows on a very wide viewport (measured: 327px at 1680, 300px from 1440
         * all the way down to 860).
         *
         * That is why the old nowrap rail clipped as the normal case rather than an edge case — a
         * three-command set needs ~410px and the column offers 300px at almost every width an
         * operator uses. It also means "wraps to two lines" is this card's steady state for three
         * commands, not a degraded fallback, and the acceptance is that nothing is ever hidden.
         */
        for (const width of [1680, 1280, 1100, 980, 860]) {
            await page.setViewportSize({ width, height: 950 });
            await page.waitForTimeout(1400);
            const measured = await measureRow(page);
            expect(measured, `${workUnit} @${width}: row vanished`).not.toBeNull();
            if (!measured) continue;
            report[`${workUnit}_${width}`] = measured;
            expectNothingHidden(measured, `${workUnit} @${width}`);
            // No command is dropped to make the set fit.
            expect(
                measured.items.map((i) => i.key).sort(),
                `${workUnit} @${width}: command set changed`,
            ).toEqual(wide.items.map((i) => i.key).sort());
            // Deterministic: same commands, same reading order, however many lines it takes.
            const ordered = [...measured.items].sort((a, b) => a.top - b.top || a.left - b.left);
            expect(ordered.map((i) => i.key), `${workUnit} @${width}: order not preserved`).toEqual(
                measured.items.map((i) => i.key),
            );
        }
        await page.screenshot({ path: path.join(DIR, `${workUnit}-narrow.png`) });

        await page.setViewportSize({ width: 1440, height: 950 });
        await page.waitForTimeout(1200);
    }

    fs.writeFileSync(path.join(DIR, "report.json"), JSON.stringify(report, null, 2));
    expect(sampled, "no process card with commands was found in any sampled work unit").toBeGreaterThan(0);
    await ctx.close();
});
