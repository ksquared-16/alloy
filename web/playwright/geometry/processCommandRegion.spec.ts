/**
 * PROCESS CARD COMMAND REGION — measured at the authored widths that broke it.
 *
 * COMMANDS MUST FIT THE CARD; THE CARD MUST NOT BE DISTORTED TO FIT THE COMMANDS.
 *
 * Three rules have stood in `operationalCardsShared.css`, each correct at the width it was
 * designed against and wrong at another:
 *
 *   1. nowrap + `overflow-x: auto` — measured `scrollWidth 409` vs `clientWidth 300` on a deployed
 *      Waitlist card. A whole command outside the visible box, silently.
 *   2. wrap with content-sized commands — every command reachable, lines of differing width.
 *   3. one row of equal columns — consistent, and at the authored Business Process width it
 *      ellipsized labels mid-word. Legible clipping is still clipping.
 *
 * Width is therefore the variable under test, and every assertion here is about a rectangle. A
 * rule that fits at 700px and truncates at 300px passes any test that only looks at one width,
 * which is how rule 3 shipped.
 */

import { expect, test, type Page } from "@playwright/test";

import { loadFixture } from "./harness";

const FIXTURE = "processCommandRegionFixture.tsx";
const STYLES = ["app/adminV2/components/alloyOsRuntime.css", "app/adminV2/components/operationalCardsShared.css"];
const TOLERANCE = 1;

/**
 * Authored region widths. 300 is the `minmax(300px, …)` floor the Process work band gives this
 * column — the narrowest supported composition, and the width both shipped defects were measured
 * at. 700 is the wide composition where a single row is expected to be enough.
 */
const WIDTHS = [300, 340, 420, 560, 700] as const;

type Measurement = Awaited<ReturnType<typeof measure>>;

async function measure(page: Page) {
    return page.evaluate(() => window.__cmd.measure());
}

async function mount(page: Page, set: string, width: number): Promise<Measurement> {
    const errors = await loadFixture(page, FIXTURE, STYLES, 1200);
    await page.waitForFunction(() => document.querySelectorAll(".alloy-os-currentwork__helpful-row").length > 0);
    await page.evaluate(([s, w]) => Promise.all([
        window.__cmd.setCommandSet(s as string),
        window.__cmd.setRegionWidth(w as number),
    ]), [set, width] as const);
    // Layout is synchronous once React has committed; wait for the width to actually apply.
    await page.waitForFunction((w) => {
        const host = document.querySelector("[data-command-region-host]") as HTMLElement | null;
        return !!host && Math.abs(host.getBoundingClientRect().width - (w as number)) <= 1;
    }, width);
    expect(errors, "the fixture must mount without a page error").toEqual([]);
    return measure(page);
}

function report(set: string, width: number, m: Measurement): string {
    const lines = m.commands
        .map((c) => `    ${c.label.padEnd(22)} x=[${c.left}..${c.right}] w=${c.width} h=${c.height} clipped=${c.clipped}`)
        .join("\n");
    return (
        `${set} @ ${width}px region client=${m.region.clientWidth} scroll=${m.region.scrollWidth} ` +
        `rows=${m.rows}\n${lines}`
    );
}

/** The whole contract, asserted the same way at every width and every configured set. */
function expectRegionContract(m: Measurement, label: string, expectedOrder: string[]): void {
    // 1 — nothing scrolls sideways.
    expect(m.region.scrollWidth, `${label}\nregion scrolls horizontally`).toBeLessThanOrEqual(
        m.region.clientWidth + TOLERANCE,
    );

    for (const command of m.commands) {
        // 2 — no command leaves the card.
        expect(command.left, `${label}\n${command.label} starts left of the region`).toBeGreaterThanOrEqual(
            m.region.left - TOLERANCE,
        );
        expect(command.right, `${label}\n${command.label} extends past the region`).toBeLessThanOrEqual(
            m.region.right + TOLERANCE,
        );
        // 3 — and no label is truncated to achieve that.
        expect(command.clipped, `${label}\n${command.label} is clipped by its own box`).toBe(false);
    }

    // 4 — configured order is preserved, reading across each row then down.
    const order = [...m.commands]
        .sort((a, b) => (Math.round(a.top) - Math.round(b.top)) || (a.left - b.left))
        .map((c) => c.label);
    expect(order, `${label}\nconfigured order changed`).toEqual(expectedOrder);

    // 5 — consistent height, which is what "consistently sized" means. NOT consistent width.
    const heights = new Set(m.commands.map((c) => Math.round(c.height)));
    expect([...heights], `${label}\ncommands differ in height`).toHaveLength(1);

    // 6 — commands on the same line must not overlap each other.
    const byRow = new Map<number, typeof m.commands>();
    for (const c of m.commands) {
        const row = Math.round(c.top);
        byRow.set(row, [...(byRow.get(row) ?? []), c]);
    }
    for (const [row, inRow] of byRow) {
        const ordered = [...inRow].sort((a, b) => a.left - b.left);
        for (let i = 1; i < ordered.length; i += 1) {
            expect(
                ordered[i].left,
                `${label}\nrow ${row}: ${ordered[i].label} overlaps ${ordered[i - 1].label}`,
            ).toBeGreaterThanOrEqual(ordered[i - 1].right - TOLERANCE);
        }
    }
}

const CONFIGURED_ORDER = ["Contact Family", "Tour ▾", "Move to Waitlist", "Add Child"];
const LONG_ORDER = ["Contact Family", "Schedule a tour ▾", "Move to Waitlist", "Change lead location", "Send form"];

for (const width of WIDTHS) {
    test(`configured commands fit the card at ${width}px`, async ({ page }) => {
        const m = await mount(page, "configured", width);
        expectRegionContract(m, report("configured", width, m), CONFIGURED_ORDER);
    });

    test(`a longer configured set still fits at ${width}px`, async ({ page }) => {
        const m = await mount(page, "long", width);
        expectRegionContract(m, report("long", width, m), LONG_ORDER);
    });
}

test("the region uses one row when the width allows it", async ({ page }) => {
    const m = await mount(page, "configured", 700);
    expect(m.rows, report("configured", 700, m)).toBe(1);
});

test("the region wraps rather than truncating when the width does not", async ({ page }) => {
    /*
     * The authored Business Process width. Equal columns fitted one row here by ellipsizing; the
     * contract now is that it takes the rows it needs and every label survives — which
     * `expectRegionContract` has already asserted. This pins the mechanism: it is WRAPPING that
     * makes that true, not a narrower type scale or a hidden command.
     */
    const m = await mount(page, "configured", 300);
    const label = report("configured", 300, m);
    expect(m.rows, `${label}\nexpected the narrow width to wrap`).toBeGreaterThan(1);
    expect(m.commands, label).toHaveLength(CONFIGURED_ORDER.length);
    expectRegionContract(m, label, CONFIGURED_ORDER);
});

test("commands are NOT stretched to equal width", async ({ page }) => {
    /*
     * The rule this replaces made every command the same width, which is what forced truncation
     * and wasted the room a short label would have returned to a long one. Consistency is height
     * and padding, never width.
     */
    const m = await mount(page, "configured", 700);
    const widths = new Set(m.commands.map((c) => Math.round(c.width)));
    expect(widths.size, `${report("configured", 700, m)}\nevery command is the same width`).toBeGreaterThan(1);
});

test("a single command does not stretch across the region", async ({ page }) => {
    const m = await mount(page, "single", 700);
    expect(m.commands[0].width, report("single", 700, m)).toBeLessThan(m.region.clientWidth / 2);
});

test("Record outcome stays a link above the command region, under the stage copy", async ({ page }) => {
    const m = await mount(page, "configured", 300);
    const label = report("configured", 300, m);
    const firstCommandTop = Math.min(...m.commands.map((c) => c.top));
    expect(m.outcomeLinkTop, `${label}\noutcome link is missing`).not.toBeNaN();
    expect(m.outcomeLinkTop, `${label}\noutcome link must sit outside the button region`).toBeLessThan(
        firstCommandTop,
    );
});
