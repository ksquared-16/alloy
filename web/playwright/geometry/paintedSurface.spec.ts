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

/**
 * THE INTERNAL COMPOSITION OF ONE CARD — where the surplus band height actually went.
 *
 * Every number is taken from the same settled layout as `read()` above, so a failure can be read
 * against the band in the same breath.
 */
type Rhythm = {
    band: number;
    card: number;
    body: number;
    /** `.alloy-os-ucard__body`'s content box bottom — the inside of its bottom padding. */
    bodyInnerBottom: number;
    primaryBottom: number;
    footerTop: number;
    footerBottom: number;
    cardBottom: number;
    /** Distance from the footer's bottom edge to the card's — the anchoring claim. */
    footerToCardBottom: number;
    /** Surplus that opened BETWEEN the primary region and the footer. */
    gapAbove: number;
    footerPosition: string;
};

async function readRhythm(page: Page, cardKey: string): Promise<Rhythm> {
    return page.evaluate((key) => {
        const area = document.querySelector(`[data-fp-grid-area="${key}"]`)!;
        const card = document.querySelector(`[data-universal-card-key="${key}"]`)!;
        const body = card.querySelector(":scope > .alloy-os-ucard__body")!;
        const primary = card.querySelector("[data-rhythm-primary]")!;
        const footer = card.querySelector("[data-rhythm-footer]")!;
        const r = (el: Element) => el.getBoundingClientRect();
        const cs = getComputedStyle(body);
        const bodyInnerBottom = r(body).bottom - (parseFloat(cs.paddingBottom) || 0);
        const n = (v: number) => +v.toFixed(2);
        return {
            band: n(r(area).height),
            card: n(r(card).height),
            body: n(r(body).height),
            bodyInnerBottom: n(bodyInnerBottom),
            primaryBottom: n(r(primary).bottom),
            footerTop: n(r(footer).top),
            footerBottom: n(r(footer).bottom),
            cardBottom: n(r(card).bottom),
            footerToCardBottom: n(r(card).bottom - r(footer).bottom),
            gapAbove: n(r(footer).top - r(primary).bottom),
            footerPosition: getComputedStyle(footer).position,
        } as Rhythm;
    }, cardKey);
}

/**
 * THE INTRINSIC READ, PERFORMED THE WAY THE PRODUCT PERFORMS IT.
 *
 * `FocusPanelCardGrid` takes the wrapper's assigned height away for one synchronous read, which
 * leaves `.alloy-os-fp-card-intrinsic`'s `min-height: 100%` with no definite parent to resolve
 * against, so it collapses to the card's own content height. This reproduces that exactly —
 * including the restore — so the spec measures X with the same instrument the solver uses.
 */
async function readIntrinsicNaturalHeight(page: Page, cardKey: string): Promise<number> {
    return page.evaluate((key) => {
        const area = document.querySelector(`[data-fp-grid-area="${key}"]`) as HTMLElement;
        const intrinsic = area.querySelector(".alloy-os-fp-card-intrinsic") as HTMLElement;
        const assigned = area.style.height;
        area.style.height = "";
        // Forced synchronous reflow — the read must see the neutralised wrapper, not the old boxes.
        void intrinsic.getBoundingClientRect().height;
        const natural = +intrinsic.getBoundingClientRect().height.toFixed(2);
        area.style.height = assigned;
        void intrinsic.getBoundingClientRect().height;
        return natural;
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

/**
 * ── INTERNAL VERTICAL RHYTHM — what the card DOES with the band it now consumes ──
 *
 * The suites above end at "the painted card is the band's height". That was the whole repair, and
 * it left the second half of the problem untouched: a card whose content is far shorter than its
 * band filled the rectangle and then stacked everything at the top, leaving the remainder as one
 * blank block. Measured on deployed `dced5ba79` at 1440:
 *
 *     health_safety   band 640px   painted article 141.8px
 *
 * — the card was not even reaching its band there, because the propagation rule named
 * `.alloy-os-process` and Health & Safety wraps twice. Both halves are certified here: the band
 * reaches a card that wraps at ANY depth, and the surplus then lands between semantic regions.
 *
 * The contract, in the card-format doctrine's words: OUTER COMPOSITION OWNS ASSIGNED HEIGHT, CARD
 * CONTENT OWNS NATURAL MINIMUM HEIGHT, SURPLUS IS DISTRIBUTED BETWEEN SEMANTIC REGIONS, and
 * ASSIGNED HEIGHT MUST NOT CONTAMINATE INTRINSIC MEASUREMENT.
 */
test.describe("surplus band height becomes space between semantic regions", () => {
    /** Body padding-bottom (8px) plus the card's 1px border — the "normal card padding" bound. */
    const PADDING_BOUND = 12;

    for (const key of ["rhythm_body_footer", "rhythm_shell_footer"]) {
        test(`THE GATE: ${key} — a sparse card leaves its footer on the bottom edge`, async ({ page }) => {
            // Band far taller than the content: 640px band, 40px of primary content.
            await setSolvedHeight(page, 640, 40);
            const r = await readRhythm(page, key);

            // The card consumes the band — including through two nested wrappers, for the
            // body-footer cell, which is the shape a per-card rule could not reach.
            expect(Math.abs(r.card - 640), `card is ${r.card}px inside a 640px band`).toBeLessThanOrEqual(TOLERANCE);

            // THE CLAIM: the footer sits on the card's bottom edge, within normal card padding.
            expect(
                r.footerToCardBottom,
                `footer bottom is ${r.footerToCardBottom}px above the card bottom`,
            ).toBeLessThanOrEqual(PADDING_BOUND);

            // …and the surplus is what put it there: a large gap opened ABOVE the footer. Before
            // this repair the same measurement read ~0 with the remainder below everything.
            expect(r.gapAbove, `only ${r.gapAbove}px of surplus opened above the footer`).toBeGreaterThan(400);

            // Normal flow, not a trick. An absolutely-positioned footer would satisfy the
            // coordinates above while breaking growth, so the mechanism is asserted too.
            expect(r.footerPosition).toBe("static");
        });

        test(`${key} — growth collapses the surplus and the footer stays AFTER the content`, async ({ page }) => {
            await setSolvedHeight(page, 640, 40);
            const sparse = await readRhythm(page, key);
            expect(sparse.gapAbove).toBeGreaterThan(400);

            // Same band, content grown to fill it: the flexible space must give way to content
            // rather than the two overlapping.
            await setSolvedHeight(page, 640, 520);
            const full = await readRhythm(page, key);
            expect(full.gapAbove, "surplus must collapse as content grows").toBeLessThan(sparse.gapAbove);
            expect(full.footerTop, "footer must remain after the primary region").toBeGreaterThanOrEqual(
                full.primaryBottom - TOLERANCE,
            );
            expect(full.card, "the band still owns the outer height").toBeCloseTo(640, -0.5);
        });
    }

    test("inline content is NOT stretched to fill the surplus — only the space between regions grows", async ({ page }) => {
        await setSolvedHeight(page, 240, 40);
        const tight = await readRhythm(page, "rhythm_body_footer");
        await setSolvedHeight(page, 640, 40);
        const roomy = await readRhythm(page, "rhythm_body_footer");

        // The authored 40px primary and 24px footer keep their heights across a 400px band change.
        const primaryTight = tight.primaryBottom - (tight.footerTop - tight.gapAbove - 40);
        expect(Math.abs(roomy.footerBottom - roomy.footerTop - 24)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(tight.footerBottom - tight.footerTop - 24)).toBeLessThanOrEqual(TOLERANCE);
        expect(primaryTight).toBeGreaterThan(0);
        // All 400px of the difference went between the regions, none into them.
        expect(roomy.gapAbove - tight.gapAbove).toBeGreaterThan(380);
    });
});

/**
 * ── THE FEEDBACK LOOP THIS REPAIR MUST NOT REOPEN ──
 *
 * A card that consumes its assigned height must not then REPORT that height as its natural content
 * height: the solver would assign the reported number, the card would consume it, report it again,
 * and the row would ratchet open. PR #989's overlap and the band-fill repairs both live in this
 * family, which is why the intrinsic node exists separately from the assigned wrapper at all.
 *
 * The gate is the round trip: measure X with the wrapper neutralised, assign Y > X, confirm the
 * painted card really is Y, then measure again — and get X back, not Y.
 */
test.describe("assigned height does not contaminate intrinsic measurement", () => {
    for (const key of ["rhythm_body_footer", "rhythm_shell_footer", "business_process"]) {
        test(`THE GATE: ${key} — X → assign Y → still X`, async ({ page }) => {
            await setSolvedHeight(page, 240, 40);
            const X = await readIntrinsicNaturalHeight(page, key);
            expect(X, "natural content height must be a real measurement").toBeGreaterThan(0);

            const Y = 640;
            expect(Y, "the scenario requires Y > X or it proves nothing").toBeGreaterThan(X);

            await setSolvedHeight(page, Y, 40);
            // `read()` rather than `readRhythm()`: this loop deliberately includes
            // `business_process`, which is a plain SolvedCell with no rhythm regions to read. The
            // claim here is about the card's height and the measurement, not its internal layout.
            const painted = await read(page, key);
            expect(
                Math.abs(painted.painted.height - Y),
                "the card must really be consuming Y",
            ).toBeLessThanOrEqual(TOLERANCE);

            const again = await readIntrinsicNaturalHeight(page, key);
            expect(
                again,
                `intrinsic measured ${again}px after a ${Y}px band — natural height is ${X}px`,
            ).toBeCloseTo(X, -0.5);
            expect(again, "the assigned height must not have been learned as content").toBeLessThan(Y - 100);
        });
    }

    test("a second assignment does not ratchet the natural height upward", async ({ page }) => {
        await setSolvedHeight(page, 240, 40);
        const first = await readIntrinsicNaturalHeight(page, "rhythm_body_footer");
        for (const H of [320, 480, 640, 900]) {
            await setSolvedHeight(page, H, 40);
            const measured = await readIntrinsicNaturalHeight(page, "rhythm_body_footer");
            expect(measured, `after a ${H}px band the natural height became ${measured}px`).toBeCloseTo(first, -0.5);
        }
    });
});
