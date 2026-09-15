/**
 * BROWSER GEOMETRY CERTIFICATION — the Focus Panel's frozen layout contract, measured.
 *
 * ── WHY A REAL BROWSER IS REQUIRED ──
 *
 * Two implementations shipped that were green under unit and render certification and wrong in
 * the product:
 *
 *   1. equalising on literal `rowStart` — every same-rowStart test passed while the live
 *      Financials/Process pair stood 325px beside 299px, because column-aware placement
 *      staggers the coordinate for cards the operator composed side by side;
 *   2. assigning the measured wrapper its own solved height — structurally sound, and on the
 *      live surface a card boxed at 122px while rendering several hundred, with the row beneath
 *      drawn straight across it.
 *
 * Neither is visible without layout. jsdom computes none, so an equal-height assertion there
 * passes against any implementation at all. This file measures rectangles.
 *
 * ── WHAT IT IS NOT ──
 *
 * It does not replace the unit, solver, contract or parity suites — those own different layers
 * and each catches things this cannot. It owns only the claims the browser uniquely settles.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// `__dirname`, not `import.meta.url`: this package is CommonJS and Playwright's TypeScript
// transform emits `require`, which an ESM-detected module cannot host.
const here = __dirname;
const webRoot = resolve(here, "../..");

/** ≤1px, the rounding tolerance the frozen doctrine names. */
const TOLERANCE = 1;
/** Frames a settle may take. Convergence, not micro-performance — CI timing must not flake. */
const SETTLE_FRAME_BUDGET = 120;

type CardGeometry = {
    top: number;
    bottom: number;
    height: number;
    left: number;
    width: number;
    cardTop: number;
    cardBottom: number;
    cardHeight: number;
    overflow: number;
};

/**
 * Bundle the fixture — and with it the real grid, hook and planner — once per worker.
 *
 * esbuild resolves `@/…` to the web root exactly as Next and vitest do, so the module graph
 * under test is the shipped one. If this ever silently stopped pulling in the real planner the
 * discriminating scenarios below would fail, which is the point of having them.
 */
let bundled: string | null = null;
async function fixtureBundle(): Promise<string> {
    if (bundled) return bundled;
    // Dynamic: this package is ESM and Playwright transpiles a static import of esbuild to
    // `require`, which does not exist here.
    const esbuild = await import("esbuild");
    const built = await esbuild.build({
        entryPoints: [resolve(here, "focusPanelGeometryFixture.tsx")],
        bundle: true,
        write: false,
        format: "iife",
        jsx: "automatic",
        absWorkingDir: webRoot,
        alias: { "@": webRoot },
        nodePaths: [resolve(webRoot, "node_modules")],
        define: { "process.env.NODE_ENV": '"development"' },
        loader: { ".css": "empty" },
        logLevel: "silent",
    });
    bundled = built.outputFiles![0].text;
    return bundled;
}

/** The REAL runtime stylesheet. The band fill and the intrinsic node live in it, not here. */
const runtimeCss = () => readFileSync(resolve(webRoot, "app/adminV2/components/alloyOsRuntime.css"), "utf8");

async function pageHtml(): Promise<string> {
    const bundle = await fixtureBundle();
    return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;font:14px system-ui,sans-serif}
#root{width:100%}
${runtimeCss()}
</style></head><body>
<script>
// Instrumented before the bundle runs, so every observation the engine reacts to is counted.
window.__obs = { resize: 0, mutation: 0 };
(function () {
  var RO = window.ResizeObserver;
  window.ResizeObserver = function (cb) { return new RO(function () { window.__obs.resize++; return cb.apply(this, arguments); }); };
  var MO = window.MutationObserver;
  window.MutationObserver = function (cb) { return new MO(function () { window.__obs.mutation++; return cb.apply(this, arguments); }); };
})();
</script>
<div id="root"></div>
<script>${bundle.replace(/<\/script>/g, "<\\/script>")}</script>
</body></html>`;
}

/** Load the fixture and wait for a measured settle — never a sleep. */
async function mount(page: Page, width: number): Promise<void> {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.setViewportSize({ width, height: 1200 });
    await page.setContent(await pageHtml(), { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll("[data-fp-grid-area]").length > 0);
    const settled = await settle(page);
    expect(errors, "the fixture must mount without a page error").toEqual([]);
    expect(settled.settled, `layout did not settle within ${SETTLE_FRAME_BUDGET} frames`).toBe(true);
}

async function settle(page: Page): Promise<{ settled: boolean; frames: number }> {
    return page.evaluate((budget) => window.__fp.settle(budget), SETTLE_FRAME_BUDGET);
}

const geometry = (page: Page) => page.evaluate(() => window.__fp.geometry()) as Promise<Record<string, CardGeometry>>;
const observerCounts = (page: Page) => page.evaluate(() => window.__fp.counts());

async function scenario(page: Page, name: string): Promise<Record<string, CardGeometry>> {
    await page.evaluate((next) => window.__fp.setScenario(next), name);
    const settled = await settle(page);
    expect(settled.settled, `${name} did not settle within ${SETTLE_FRAME_BUDGET} frames`).toBe(true);
    return geometry(page);
}

async function setHeight(page: Page, card: string, px: number): Promise<Record<string, CardGeometry>> {
    await page.evaluate(([c, h]) => window.__fp.setHeight(c as string, h as number), [card, px] as const);
    const settled = await settle(page);
    expect(settled.settled, `${card} -> ${px}px did not settle`).toBe(true);
    return geometry(page);
}

/** Failure output the reader can act on without re-running anything. */
function report(label: string, width: number, g: Record<string, CardGeometry>): string {
    const rows = Object.entries(g)
        .map(([card, m]) =>
            `    ${card.padEnd(18)} top=${m.cardTop} bottom=${m.cardBottom} height=${m.cardHeight} ` +
            `band=[${m.top}..${m.bottom}] width=${m.width} overflow=${m.overflow}`,
        )
        .join("\n");
    return `${label} @ ${width}px\n${rows}`;
}

function expectSameBand(
    g: Record<string, CardGeometry>,
    a: string,
    b: string,
    context: string,
): void {
    const [x, y] = [g[a], g[b]];
    expect(x, `${context}: ${a} is not rendered`).toBeTruthy();
    expect(y, `${context}: ${b} is not rendered`).toBeTruthy();
    expect(Math.abs(x.cardTop - y.cardTop), `${context}: top delta\n${context}`).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(x.cardBottom - y.cardBottom), `${context}: bottom delta`).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(x.cardHeight - y.cardHeight), `${context}: height delta`).toBeLessThanOrEqual(TOLERANCE);
}

function expectNoOverflow(g: Record<string, CardGeometry>, context: string): void {
    for (const [card, m] of Object.entries(g)) {
        expect(m.overflow, `${context}: ${card} spills ${m.overflow}px out of its band`).toBeLessThanOrEqual(TOLERANCE);
    }
}

const WIDTHS = [1180, 1440, 1680] as const;

for (const width of WIDTHS) {
    test.describe(`focus panel geometry @ ${width}px`, () => {
        test.beforeEach(async ({ page }) => {
            await mount(page, width);
        });

        test("A — cards in one visual band match, though their rowStart differs", async ({ page }) => {
            const g = await scenario(page, "differentRowStartSameBand");
            const label = report("differentRowStartSameBand", width, g);
            /*
             * business_process rowStart 1, financials rowStart 2 — the live Firefly stagger.
             * Content is 237 and 325, so an engine reading the coordinate as a row identity
             * leaves them 88px apart and this fails.
             */
            expectSameBand(g, "business_process", "financials", label);
            expectNoOverflow(g, label);
            // Both take the band, which is the taller card's content.
            expect(g.business_process.cardHeight, label).toBeGreaterThanOrEqual(325 - TOLERANCE);
        });

        test("A2 — the same band authored without the stagger behaves identically", async ({ page }) => {
            const g = await scenario(page, "sameRowStartSameBand");
            expectSameBand(g, "left", "right", report("sameRowStartSameBand", width, g));
            expectNoOverflow(g, report("sameRowStartSameBand", width, g));
        });

        test("B — a spanning card runs the full stack beside it", async ({ page }) => {
            const g = await scenario(page, "stackedAndSpanning");
            const label = report("stackedAndSpanning", width, g);
            expect(Math.abs(g.tall.cardTop - g.upper.cardTop), `${label}\ntop delta`).toBeLessThanOrEqual(TOLERANCE);
            expect(Math.abs(g.tall.cardBottom - g.lower.cardBottom), `${label}\nbottom delta`).toBeLessThanOrEqual(TOLERANCE);
            expectNoOverflow(g, label);
        });

        test("negative control — cards in DIFFERENT bands are not equalised", async ({ page }) => {
            /*
             * The discriminator. An implementation that equalised everything passes every
             * scenario above and fails here, and so does one that lets a band cover rows no
             * card occupies — the 268px whitespace defect the column-aware model exists to kill.
             */
            const g = await scenario(page, "differentBandsStayIndependent");
            const label = report("differentBandsStayIndependent", width, g);
            expect(Math.abs(g.upper.cardHeight - 120), `${label}\nupper must keep its own height`).toBeLessThanOrEqual(TOLERANCE);
            expect(Math.abs(g.lower.cardHeight - 400), `${label}\nlower must keep its own height`).toBeLessThanOrEqual(TOLERANCE);
            expect(g.lower.top, `${label}\nlower must sit directly beneath upper`).toBeGreaterThan(g.upper.bottom - TOLERANCE);
        });
    });
}

test.describe("intrinsic content drives the band, in both directions", () => {
    test.beforeEach(async ({ page }) => {
        await mount(page, 1440);
    });

    test("C — the shorter card stretches to the band without its content overflowing", async ({ page }) => {
        const g = await scenario(page, "differentRowStartSameBand");
        const label = report("intrinsic/assigned", 1440, g);
        // The 237px card is DRAWN at the band height...
        expectSameBand(g, "business_process", "financials", label);
        // ...while nothing spills out of the box it was given.
        expectNoOverflow(g, label);
    });

    test("D1 — growth recomputes the band and stretches the sibling", async ({ page }) => {
        await scenario(page, "differentRowStartSameBand");
        const grown = await setHeight(page, "business_process", 520);
        const label = report("grow business_process -> 520", 1440, grown);
        expect(grown.business_process.cardHeight, label).toBeGreaterThanOrEqual(520 - TOLERANCE);
        expectSameBand(grown, "business_process", "financials", label);
        expectNoOverflow(grown, label);
    });

    test("D2 — shrink recomputes the band DOWNWARD", async ({ page }) => {
        /*
         * The half a ResizeObserver cannot see. Once the band is 520px the intrinsic node's
         * `min-height: 100%` holds it there, so shrinking the content changes no box and fires
         * no resize; only the MutationObserver reports it. A band that could only grow keeps
         * whitespace nothing needs — the seventeen-children-to-two defect.
         */
        await scenario(page, "differentRowStartSameBand");
        const grown = await setHeight(page, "business_process", 520);
        expect(grown.business_process.cardHeight).toBeGreaterThanOrEqual(520 - TOLERANCE);

        const shrunk = await setHeight(page, "business_process", 140);
        const label = report("shrink business_process -> 140", 1440, shrunk);
        // financials (325) is now the tallest, so the band is ITS height, not the stale 520.
        expect(shrunk.financials.cardHeight, label).toBeLessThan(520 - TOLERANCE);
        expectSameBand(shrunk, "business_process", "financials", label);
        expectNoOverflow(shrunk, label);

        const floor = await setHeight(page, "financials", 150);
        const flabel = report("shrink financials -> 150", 1440, floor);
        // Both short now: the band must follow all the way down.
        expect(floor.financials.cardHeight, flabel).toBeLessThan(200);
        expectSameBand(floor, "business_process", "financials", flabel);
    });

    test("loop guard — the layout converges and then stops working", async ({ page }) => {
        await scenario(page, "differentRowStartSameBand");
        await setHeight(page, "business_process", 420);
        const before = await geometry(page);
        const countsBefore = await observerCounts(page);

        // Nothing changes the content, so nothing may change the geometry or wake the engine.
        const idle = await settle(page);
        const after = await geometry(page);
        const countsAfter = await observerCounts(page);
        const label = report("after settle", 1440, after);

        expect(idle.settled, label).toBe(true);
        expect(after, `${label}\ngeometry moved while the content held still`).toEqual(before);
        expect(
            countsAfter.resize - countsBefore.resize,
            `${label}\nResizeObserver fired ${countsAfter.resize - countsBefore.resize} times with no content change`,
        ).toBeLessThanOrEqual(2);
        expect(
            countsAfter.mutation - countsBefore.mutation,
            `${label}\nMutationObserver fired ${countsAfter.mutation - countsBefore.mutation} times with no content change`,
        ).toBeLessThanOrEqual(2);
    });
});
