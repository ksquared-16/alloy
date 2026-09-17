/**
 * PAINTED-SURFACE CERTIFICATION — does the solved band height reach the card the operator SEES?
 *
 * ── WHY THIS GATE EXISTS, WRITTEN DOWN SO IT IS NOT REMOVED AS A DUPLICATE ──
 *
 * Three separate contracts stand between the band solver and the operator's eye:
 *
 *     the solver produces H   →   the cell applies H   →   the painted card CONSUMES H
 *
 * Each has now been green while a later one was broken, which is why each is certified separately:
 *
 *   · `focusPanelRowHeightSolver` certifies the first. It passed at full strength through BOTH
 *     deployed failures of the other two.
 *   · `focusPanelBandFillRuntimePath` certifies the second — that `align-items: stretch` WINS the
 *     cascade on the solved-grid cell. It was green while the rule was inert (specificity tie lost
 *     on source order), and after that repair it was green while the card was still 67px short.
 *   · THIS FILE certifies the third, and it is the only one of the three that can. The claim is
 *     about a rectangle produced by a real layout engine, and jsdom computes none — an equal-height
 *     assertion there passes against any implementation at all.
 *
 * ── THE MEASUREMENT TRAP THIS FILE IS BUILT TO AVOID ──
 *
 * Deployed acceptance for Slice 9C measured Business Process through `[data-process-card='true']`
 * and reported a clean PASS at the full band height. That selector resolves to
 * `div.alloy-os-process` — ProcessCard's TRANSPARENT wrapper — not to the painted card inside it.
 * The wrapper was genuinely at the band height; the white bordered article within it was 67.23px
 * short, and that gap is what the operator was looking at. The false pass was caught only because a
 * second pass happened to use a different selector and the two disagreed.
 *
 * So this gate never trusts a selector to mean "the card". It resolves the painted surface by its
 * PAINT CONTRACT — an opaque background AND a real border — and asserts, as a gate in its own
 * right, that the element it measured is painted and that the wrapper above it is not. Point it at
 * the transparent wrapper and it fails, which is the property that makes the rest of it worth
 * anything.
 */

import { expect, test, type Page } from "@playwright/test";

import { loadFixture } from "./harness";

/** ≤1px, the rounding tolerance the frozen doctrine names. */
const TOLERANCE = 1;

const FIXTURE = "paintedSurfaceFixture.tsx";
const STYLES = ["app/adminV2/components/alloyOsRuntime.css"];

type Paint = {
    found: boolean;
    height: number;
    backgroundColor: string;
    borderTopWidth: number;
    opaqueBackground: boolean;
    hasBorder: boolean;
    /** The gate's own definition of "the operator can see this box". */
    isPaintedSurface: boolean;
    tag: string;
    classes: string;
};

type Reading = {
    solvedWrapper: number;
    intrinsic: number;
    cell: number;
    /** `div.alloy-os-process` — present for Business Process only. */
    processWrapper: Paint;
    /** `article.alloy-os-ucard` — the surface with the white ground and the border. */
    painted: Paint;
};

async function read(page: Page, cardKey: string): Promise<Reading> {
    return page.evaluate((key) => {
        const H = (el: Element | null) => (el ? +el.getBoundingClientRect().height.toFixed(2) : -1);
        const paint = (el: Element | null): Paint => {
            if (!el) {
                return {
                    found: false, height: -1, backgroundColor: "", borderTopWidth: -1,
                    opaqueBackground: false, hasBorder: false, isPaintedSurface: false,
                    tag: "", classes: "",
                };
            }
            const cs = getComputedStyle(el);
            const bg = cs.backgroundColor;
            const opaque = bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
            const bw = parseFloat(cs.borderTopWidth) || 0;
            return {
                found: true, height: H(el), backgroundColor: bg, borderTopWidth: bw,
                opaqueBackground: opaque, hasBorder: bw > 0,
                isPaintedSurface: opaque && bw > 0,
                tag: el.tagName.toLowerCase(),
                classes: (el.className || "").toString(),
            };
        };
        const wrapper = document.querySelector(`[data-fp-grid-area="${key}"]`);
        const intrinsic = wrapper?.querySelector(".alloy-os-fp-card-intrinsic") ?? null;
        const cell = intrinsic?.querySelector(".alloy-os-focus-panel-grid__cell") ?? null;
        const processWrapper = cell?.querySelector(":scope > .alloy-os-process") ?? null;
        const painted = document.querySelector(`[data-universal-card-key="${key}"]`);
        return {
            solvedWrapper: H(wrapper), intrinsic: H(intrinsic), cell: H(cell),
            processWrapper: paint(processWrapper), painted: paint(painted),
        } as Reading;
    }, cardKey);
}

async function setSolvedHeight(page: Page, h: number, contentHeight?: number): Promise<void> {
    // `setContent` resolves on `load`; React commits the effect that publishes `__paint` after it.
    // Waiting for the contract rather than for a duration keeps this deterministic under parallel
    // workers — without it the handle is intermittently undefined on a loaded runner.
    await page.waitForFunction(() => (window as unknown as { __paint?: unknown }).__paint != null);
    await page.evaluate(
        ([height, content]) =>
            (window as unknown as { __paint: { apply: (h: number, c?: number) => void } }).__paint.apply(
                height as number,
                content as number | undefined,
            ),
        [h, contentHeight] as const,
    );
    // Two frames: one for React to commit, one for the engine to lay the result out.
    await page.evaluate(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );
}

test.beforeEach(async ({ page }) => {
    const errors = await loadFixture(page, FIXTURE, STYLES, 1400);
    expect(errors, "the fixture must mount without a page error").toEqual([]);
});

test.describe("the measurement selector is certified before anything is measured with it", () => {
    test("THE GATE: the element this suite measures as the card IS painted", async ({ page }) => {
        const bp = await read(page, "business_process");
        expect(bp.painted.found, "the painted Business Process surface must exist").toBe(true);
        // If a future refactor moves the paint, this fails HERE rather than silently certifying a
        // transparent box at the band height — which is exactly how the 9C false pass happened.
        expect(bp.painted.isPaintedSurface, `measured <${bp.painted.tag}> bg=${bp.painted.backgroundColor} border=${bp.painted.borderTopWidth}`).toBe(true);
        expect(bp.painted.opaqueBackground).toBe(true);
        expect(bp.painted.hasBorder).toBe(true);
        expect(bp.painted.tag).toBe("article");
    });

    test("THE GATE: the layout wrapper above it is NOT painted, so measuring it would be a false pass", async ({ page }) => {
        const bp = await read(page, "business_process");
        expect(bp.processWrapper.found, "Business Process must still render its wrapper").toBe(true);
        expect(bp.processWrapper.classes).toContain("alloy-os-process");
        // The whole point: this box is invisible. A gate that measured it would report the band
        // height and tell the operator nothing about what they can see.
        expect(bp.processWrapper.isPaintedSurface).toBe(false);
        expect(bp.processWrapper.opaqueBackground).toBe(false);
        expect(bp.processWrapper.hasBorder).toBe(false);
    });

    test("the wrapper and the painted card are DIFFERENT elements — the asymmetry under test", async ({ page }) => {
        const bp = await read(page, "business_process");
        const fin = await read(page, "financials");
        // Business Process wraps; Financials does not. If that ever converges, this gate's premise
        // is gone and the reader should be told so here.
        expect(bp.processWrapper.found).toBe(true);
        expect(fin.processWrapper.found).toBe(false);
    });
});

test.describe("the solved height reaches the painted surface, at whatever H the solver chose", () => {
    // Deliberately NOT 299 or 325 — the two values this defect has been measured at. A repair that
    // only works at a remembered number is not a repair.
    for (const H of [188, 313, 471, 664]) {
        test(`THE GATE: at an arbitrary solved H=${H}px, the painted card consumes the whole band`, async ({ page }) => {
            await setSolvedHeight(page, H, 96);
            const bp = await read(page, "business_process");
            const fin = await read(page, "financials");

            // The chain, asserted link by link, so a failure names which hop dropped the height.
            expect(bp.solvedWrapper, "solved wrapper carries H").toBeCloseTo(H, -0.5);
            expect(bp.intrinsic, "intrinsic node resolves against the wrapper").toBeCloseTo(H, -0.5);
            expect(bp.cell, "the grid cell takes the band's room").toBeCloseTo(H, -0.5);
            expect(bp.processWrapper.height, "the transparent wrapper receives H").toBeCloseTo(H, -0.5);

            // THE ONE THAT WAS FAILING. Everything above was already true on deployed f30e3bb0f.
            expect(
                Math.abs(bp.painted.height - H),
                `PAINTED Business Process card is ${bp.painted.height}px inside a ${H}px band`,
            ).toBeLessThanOrEqual(TOLERANCE);

            // The control: the unwrapped card was never broken and must not become so.
            expect(
                Math.abs(fin.painted.height - H),
                `PAINTED Financials card is ${fin.painted.height}px inside a ${H}px band`,
            ).toBeLessThanOrEqual(TOLERANCE);

            // Both painted surfaces are the same height — one band, not two coincidences.
            expect(Math.abs(bp.painted.height - fin.painted.height)).toBeLessThanOrEqual(TOLERANCE);
        });
    }

    test("no unexplained whitespace remains outside the painted surface within its band", async ({ page }) => {
        await setSolvedHeight(page, 471, 96);
        const bp = await read(page, "business_process");
        const residual = +(bp.cell - bp.painted.height).toFixed(2);
        // Deployed f30e3bb0f measured 67.23px here.
        expect(residual, `${residual}px of band is not covered by the painted card`).toBeLessThanOrEqual(TOLERANCE);
    });

    test("the fill is consumption of the band, never the content's own height", async ({ page }) => {
        // Content far shorter than the band: if the painted card still reaches H, it got there by
        // consuming the band. This is what stops a content-sized card reading as a pass.
        await setSolvedHeight(page, 640, 40);
        const bp = await read(page, "business_process");
        expect(bp.painted.height).toBeGreaterThan(400);
        expect(Math.abs(bp.painted.height - 640)).toBeLessThanOrEqual(TOLERANCE);
    });

    test("a band SHORTER than the content does not collapse the painted card below the band", async ({ page }) => {
        // The band contract is `height`, not `min-height`; the card fills it. A card whose content
        // exceeds the band must still occupy exactly the band, scrolling or clipping within it,
        // rather than pushing the row beneath it open.
        await setSolvedHeight(page, 200, 900);
        const bp = await read(page, "business_process");
        expect(Math.abs(bp.painted.height - 200)).toBeLessThanOrEqual(TOLERANCE);
    });
});
