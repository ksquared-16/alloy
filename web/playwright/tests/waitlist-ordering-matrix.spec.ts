/**
 * WAITLIST ORDERING — the live matrix.
 *
 * One claim, checked against a running system rather than a model of one: THE POSITION AN OPERATOR
 * REQUESTS IS THE POSITION THE ROW ENDS UP IN. Everything else here exists because that claim has
 * been quietly false before.
 *
 * It was false in a way unit tests could not have caught. The writer and the renderer each had their
 * own idea of what the list was — one broke ties on `created_at`, the other on natural rank — and
 * they only disagreed against real stored state, where ordinals had accumulated duplicates over
 * months. So this runs against the queue an operator actually reads, with whatever the tenant
 * happens to hold, and asserts the outcome rather than the mechanism.
 *
 * What is asserted:
 *   - move to 4 results in 4, and move to 2 results in 2;
 *   - a sequential move into an already-occupied area lands exactly, and does not drag the
 *     previously moved row off the seat it was given;
 *   - the section reads as a dense 1..N with no repeated position — the visible form of "no
 *     duplicate ordinals";
 *   - a cold reload shows the same order, so the stored state reproduces rather than the screen
 *     merely remembering;
 *   - Clear releases the adjustment and the row re-ranks naturally;
 *   - queue and Focus Panel show the same rank for the same row.
 *
 * MUTATING. It adjusts real waitlist positions in whatever tenant `PLAYWRIGHT_BASE_URL` points at,
 * and leaves the section in a canonical, coherent state — which is the intended outcome, not a side
 * effect.
 *
 * Env: PLAYWRIGHT_BASE_URL, PLAYWRIGHT_STORAGE_STATE, WAITLIST_WU_SLUG, WAITLIST_SHOT_DIR.
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3016";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WAITLIST_WU_SLUG || "waitlist";
const DIR = process.env.WAITLIST_SHOT_DIR || "/tmp/waitlist-matrix";

const L = {
    queueRow: '[data-runtime-label="WU.QUEUE_ROW"]',
    rankCluster: "[data-queue-row-waitlist-rank-cluster]",
    adjustTrigger: "[data-queue-row-waitlist-adjust]",
    positionMenu: "[data-waitlist-adjust-position-menu]",
    submit: "[data-waitlist-adjust-submit]",
    reset: "[data-waitlist-adjust-reset]",
    error: "[data-waitlist-adjust-error]",
    custom: "[data-waitlist-adjust-pin-ordinal]",
    focusPanel: '[data-inline-focus-panel="true"]',
};

if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 10 * 60 * 1000 });

async function shot(page: Page, name: string) {
    fs.mkdirSync(DIR, { recursive: true });
    await page.screenshot({ path: path.join(DIR, name), fullPage: false });
}

type Row = { candidateId: string; label: string; position: number | null; total: number | null; index: number };

/**
 * Read the section as the operator sees it.
 *
 * Deliberately parsed from the RANK LABEL rather than from row order: the label is what the
 * placement engine published, and the contract is about that number. Reading DOM order instead
 * would pass even if the number on screen disagreed with the sequence — which is close to the
 * original bug.
 */
async function readSection(page: Page): Promise<Row[]> {
    return page.evaluate((sel) => {
        const out: Array<{ candidateId: string; label: string; position: number | null; total: number | null; index: number }> = [];
        let index = 0;
        for (const row of Array.from(document.querySelectorAll(sel.queueRow))) {
            const trigger = row.querySelector(sel.adjustTrigger) as HTMLElement | null;
            const candidateId = trigger?.getAttribute("data-placement-candidate-id") ?? "";
            if (!candidateId) continue;
            const cluster = row.querySelector(sel.rankCluster) as HTMLElement | null;
            const label = (cluster?.textContent ?? "").trim();
            const m = label.match(/(\d+)\s*\/\s*(\d+)/);
            out.push({
                candidateId,
                label,
                position: m ? Number(m[1]) : null,
                total: m ? Number(m[2]) : null,
                index: index++,
            });
        }
        return out;
    }, L);
}

/**
 * One SECTION out of the queue.
 *
 * The queue renders several sections (Infant, Toddler, …) as one list, and every contract here is
 * section-scoped — `1..N` is dense within a section and says nothing across them. So the section is
 * taken as the maximal contiguous run sharing the subject's denominator, which is how the projection
 * groups them. Asserting over the whole queue instead would report a duplicate position every time
 * two sections both have a row at 1 — correct behaviour read as a failure.
 */
function sectionOf(rows: Row[], candidateId: string): Row[] {
    const anchor = rows.find((r) => r.candidateId === candidateId);
    if (!anchor || anchor.total == null) return [];
    let lo = anchor.index;
    let hi = anchor.index;
    const at = (i: number) => rows.find((r) => r.index === i);
    while (at(lo - 1)?.total === anchor.total) lo -= 1;
    while (at(hi + 1)?.total === anchor.total) hi += 1;
    return rows.filter((r) => r.index >= lo && r.index <= hi).sort((a, b) => a.index - b.index);
}

async function gotoQueue(page: Page) {
    await page.goto(`${BASE}/workspace/work-unit/${WU}`, { waitUntil: "domcontentloaded" });
    await page.locator(L.queueRow).first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(1500);
}

/** Move one candidate to a 1-based position through the control the operator uses. */
async function moveTo(page: Page, candidateId: string, target: number) {
    const trigger = page.locator(`${L.adjustTrigger}[data-placement-candidate-id="${candidateId}"]`).first();
    await trigger.waitFor({ state: "visible", timeout: 15000 });
    await trigger.click({ noWaitAfter: true });
    await page.waitForTimeout(400);

    // The position control is a listbox, not a text field: options only exist once it is open. Open
    // the menu BUTTON first — `data-waitlist-adjust-pin-ordinal` is on both that button and the
    // Custom input, so the trigger is disambiguated by its listbox role.
    const menuButton = page.locator(`${L.custom}[aria-haspopup="listbox"]`).first();
    if (await menuButton.count()) {
        await menuButton.click({ noWaitAfter: true });
        await page.waitForTimeout(300);
        const option = page.locator(`[data-waitlist-adjust-position-option="${target}"]`);
        if (await option.count()) {
            await option.first().click({ noWaitAfter: true });
        } else {
            // Past the listed window: Custom is the documented way to reach the rest of the range.
            await page.keyboard.press("Escape");
            await page.waitForTimeout(150);
            await page.locator(`${L.custom}:not([aria-haspopup])`).first().fill(String(target));
        }
    } else {
        await page.locator(`${L.custom}:not([aria-haspopup])`).first().fill(String(target));
    }
    await page.waitForTimeout(300);

    const err = page.locator(L.error);
    if (await err.count()) {
        throw new Error(`control refused before submit: ${await err.first().textContent()}`);
    }
    await page.locator(L.submit).first().click({ noWaitAfter: true });
    // The command broadcasts a queue-membership change and the surface refetches rows AND counts.
    // That round trip is not instant, and a fixed sleep either flakes or wastes time — so callers
    // wait for the outcome with `settleAt` rather than for a duration.
    await page.waitForTimeout(1200);
}

/**
 * Wait until the row actually reads the position it was sent to.
 *
 * This is the assertion, not a convenience: the contract is about where the row ENDS UP, so polling
 * the rendered rank until it agrees is exactly the thing under test. It fails by timing out with the
 * position it actually reached, which is the message you want at 3am.
 */
async function settleAt(
    page: Page,
    read: () => Promise<Row[]>,
    candidateId: string,
    expected: number,
    what: string,
) {
    let last: number | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const rows = await read();
        last = rows.find((r) => r.candidateId === candidateId)?.position ?? null;
        if (last === expected) return rows;
        await page.waitForTimeout(1000);
    }
    throw new Error(`${what}: expected position ${expected}, settled at ${last}`);
}

async function clearFor(page: Page, candidateId: string) {
    const trigger = page.locator(`${L.adjustTrigger}[data-placement-candidate-id="${candidateId}"]`).first();
    await trigger.click({ noWaitAfter: true });
    await page.waitForTimeout(400);
    await page.locator(L.reset).first().click({ noWaitAfter: true });
    await page.waitForTimeout(3000);
}

/** Dense 1..N with nothing repeated — the visible form of "no duplicate active ordinals". */
function expectDenseAndUnique(rows: Row[], where: string) {
    const positions = rows.map((r) => r.position).filter((p): p is number => p != null).sort((a, b) => a - b);
    expect(new Set(positions).size, `${where}: repeated position in ${JSON.stringify(positions)}`).toBe(
        positions.length,
    );
    expect(positions, `${where}: not dense 1..${positions.length}`).toEqual(
        positions.map((_, i) => i + 1),
    );
}

test("waitlist ordering matrix — requested position is the resulting position", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 950 } });
    const page = await ctx.newPage();
    const report: Record<string, unknown> = {};

    await gotoQueue(page);
    const allRows = await readSection(page);
    report.allRows = allRows;
    await shot(page, "00-before.png");
    expect(allRows.length, "no waitlist rows found — wrong work unit slug?").toBeGreaterThan(3);

    // Work in the LARGEST section: it has the most positions, so "move to 4" and "move to 2" are both
    // genuine moves rather than no-ops, and a sequential move has somewhere to collide.
    const biggest = allRows.reduce((a, b) => ((b.total ?? 0) > (a.total ?? 0) ? b : a));
    const before = sectionOf(allRows, biggest.candidateId);
    report.before = before;
    expect(before.length, "section too small for the matrix").toBeGreaterThan(4);

    // The subject sits at the end of the section, so both targets move it a real distance.
    const subject = before[before.length - 1]!;
    const readMySection = async () => sectionOf(await readSection(page), subject.candidateId);

    // (1) MOVE TO 4 → MUST RESULT 4
    await moveTo(page, subject.candidateId, 4);
    let now = await settleAt(page, readMySection, subject.candidateId, 4, "move to 4");
    report.afterMoveTo4 = now;
    await shot(page, "01-after-move-4.png");
    expectDenseAndUnique(now, "after move to 4");

    // (2) MOVE TO 2 → MUST RESULT 2
    await moveTo(page, subject.candidateId, 2);
    now = await settleAt(page, readMySection, subject.candidateId, 2, "move to 2");
    report.afterMoveTo2 = now;
    await shot(page, "02-after-move-2.png");
    expectDenseAndUnique(now, "after move to 2");

    // (3) SEQUENTIAL MOVE INTO AN ALREADY-USED AREA. A second row is sent to 3, next to the row we
    // just seated at 2. The new row must land exactly, and the earlier one must not be dragged off
    // its seat — that displacement is precisely what the old writer did.
    const second = now.find((r) => r.candidateId !== subject.candidateId && (r.position ?? 0) > 4)!;
    await moveTo(page, second.candidateId, 3);
    now = await settleAt(page, readMySection, second.candidateId, 3, "sequential move to 3");
    report.afterSequential = now;
    await shot(page, "03-after-sequential.png");
    expect(now.find((r) => r.candidateId === subject.candidateId)?.position, "earlier move must hold").toBe(2);
    expectDenseAndUnique(now, "after sequential move");

    // (4) COLD RELOAD — the stored state must reproduce, not merely persist on screen.
    const beforeReload = now.map((r) => `${r.candidateId}@${r.position}`);
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await gotoQueue(page);
    now = await readMySection();
    report.afterReload = now;
    await shot(page, "04-after-reload.png");
    expect(now.map((r) => `${r.candidateId}@${r.position}`), "cold reload must reproduce").toEqual(beforeReload);

    // (5) QUEUE / FOCUS PANEL PARITY — one rank, read in two places.
    const rowEl = page.locator(`${L.queueRow}:has(${L.adjustTrigger}[data-placement-candidate-id="${subject.candidateId}"])`).first();
    await rowEl.click({ noWaitAfter: true });
    await page.waitForTimeout(2000);
    const panelText = ((await page.locator(L.focusPanel).first().textContent().catch(() => "")) ?? "")
        .replace(/\s+/g, " ");
    const queueLabel = now.find((r) => r.candidateId === subject.candidateId)?.label ?? "";
    const queueFraction = queueLabel.match(/(\d+)\s*\/\s*(\d+)/)?.[0] ?? "";
    const total = queueFraction.split("/")[1] ?? "";
    // Any rank the panel states for THIS section — matched on the denominator, which is what makes a
    // fraction a rank in this list rather than some other count on the panel.
    const panelRanks = total ? [...panelText.matchAll(new RegExp(`(\\d+)\\s*/\\s*${total}\\b`, "g"))].map((m) => m[0]) : [];
    report.queueRank = queueFraction;
    report.focusPanelRanks = panelRanks;
    report.focusPanelShowsAnyRank = panelRanks.length > 0;
    await shot(page, "05-focus-panel.png");

    expect(queueFraction, "queue rank unreadable").not.toBe("");
    /*
     * PARITY IS "NO SECOND NUMBER", which is the part that can actually be enforced.
     *
     * The Focus Panel does not surface a waitlist rank today — measured, not assumed: opening a
     * waitlist row yields a case panel with no `n/N` anywhere. So the assertion is that it never
     * states a rank for this section that DISAGREES with the queue. That holds whether the panel
     * shows the rank or shows nothing, and it starts failing the moment someone adds a second,
     * independently-derived number — which is the regression worth catching.
     *
     * `focusPanelShowsAnyRank` is recorded in the report so "the panel shows no rank" stays a
     * visible finding rather than a silently green assertion.
     */
    for (const rank of panelRanks) {
        expect(rank, "Focus Panel states a rank that disagrees with the queue").toBe(queueFraction);
    }

    // (6) CLEAR — the adjustment is released and the row re-ranks naturally. The section must stay
    // dense and unique afterwards, which is the part that used to break.
    await clearFor(page, second.candidateId);
    await page.waitForTimeout(2500);
    now = await readMySection();
    report.afterClear = now;
    await shot(page, "06-after-clear.png");
    expectDenseAndUnique(now, "after clear");
    expect(now.length, "clear must not drop a row").toBe(before.length);

    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, "report.json"), JSON.stringify(report, null, 2));
    await ctx.close();
});
