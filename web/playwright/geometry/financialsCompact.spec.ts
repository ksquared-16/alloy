/**
 * THE COMPACT FINANCIALS CARD AT ITS AUTHORED WIDTH.
 *
 * Compact is the 4-column variant, which the live Focus Panel measures at ~286px. The headline
 * change is a PRESENTATION rule, and presentation cannot be certified by reading the adapter: a
 * source check would pass while the card rendered a blank slot where the number used to be.
 *
 * So this mounts the real approved card and reads what is actually on screen.
 */
import { expect, test, type Page } from "@playwright/test";

import { loadFixture } from "./harness";

const FIXTURE = "financialsCompactFixture.tsx";
const STYLES = ["app/adminV2/components/alloyOsRuntime.css", "app/adminV2/components/operationalCardsShared.css"];

/** The authored 4-column width at the three viewports the panel is used at. */
const WIDTHS = [252, 286, 340] as const;

type Measurement = Awaited<ReturnType<typeof measure>>;

async function measure(page: Page) {
    return page.evaluate(() => window.__fin.measure());
}

async function mount(page: Page, name: string, width: number): Promise<Measurement> {
    const errors = await loadFixture(page, FIXTURE, STYLES, 1200);
    await page.waitForFunction(() => document.querySelectorAll('[data-financials-card="compact"]').length > 0);
    await page.evaluate(([n, w]) => Promise.all([window.__fin.setCase(n as string), window.__fin.setWidth(w as number)]), [name, width] as const);
    await page.waitForFunction((w) => {
        const host = document.querySelector("[data-financials-host]") as HTMLElement | null;
        return !!host && Math.abs(host.getBoundingClientRect().width - (w as number)) <= 1;
    }, width);
    expect(errors, "the fixture must mount without a page error").toEqual([]);
    return measure(page);
}

const report = (name: string, w: number, m: Measurement) =>
    `${name} @ ${w}px — card ${m.card.width}x${m.card.height}, headline=${JSON.stringify(m.headline)}, `
    + `chip=${JSON.stringify(m.statusChip)}, clippedText=${JSON.stringify(m.clippedText)}, overflowX=${m.overflowX}\n`
    + m.lines.map((l) => `    ${l.label.padEnd(18)} ${l.value}`).join("\n")
    + `\n    commands: ${m.commands.join(" | ")}`;

test.describe("Financials compact card", () => {
    for (const width of WIDTHS) {
        test(`no duplicate headline when nothing is past due @ ${width}px`, async ({ page }) => {
            for (const name of ["zero_balance", "ordinary_balance"]) {
                const m = await mount(page, name, width);
                const balance = m.lines.find((l) => l.label.startsWith("Current balance"))?.value ?? null;

                expect(balance, report(name, width, m)).not.toBeNull();
                // THE DEFECT: the headline used to be exactly this figure, unlabelled, directly above it.
                expect(m.headline, report(name, width, m)).not.toBe(balance);
                // Responsibility is still stated — the fix removes a duplicate, not a fact.
                expect(m.lines.some((l) => l.label.startsWith("Responsibility")), report(name, width, m)).toBe(true);
                for (const l of m.lines) expect(l.clipped, report(name, width, m)).toBe(false);
                expect(m.clippedText, report(name, width, m)).toEqual([]);
                expect(m.overflowX, report(name, width, m)).toBeLessThanOrEqual(1);
            }
        });

        test(`past due keeps its distinct headline @ ${width}px`, async ({ page }) => {
            const m = await mount(page, "past_due", width);
            // A condition, not a repetition — it earns the prominent slot.
            expect(m.headline, report("past_due", width, m)).toContain("past due");
            expect(m.lines.some((l) => l.label.startsWith("Current balance")), report("past_due", width, m)).toBe(true);
            expect(m.clippedText, report("past_due", width, m)).toEqual([]);
        });
    }

    test("Payment appears only where canonical payable truth exists", async ({ page }) => {
        const paid = await mount(page, "zero_balance", 286);
        expect(paid.commands, report("zero_balance", 286, paid)).not.toContain("Payment");
        // Add and the way out are always offered.
        expect(paid.commands, report("zero_balance", 286, paid)).toContain("Add");
        expect(paid.commands.join(" "), report("zero_balance", 286, paid)).toContain("Details");

        const owing = await mount(page, "ordinary_balance", 286);
        expect(owing.commands, report("ordinary_balance", 286, owing)).toContain("Payment");
    });

    test("a long figure still fits the authored width", async ({ page }) => {
        const m = await mount(page, "long_labels", 252);
        expect(m.clippedText, report("long_labels", 252, m)).toEqual([]);
        expect(m.overflowX, report("long_labels", 252, m)).toBeLessThanOrEqual(1);
    });
});
