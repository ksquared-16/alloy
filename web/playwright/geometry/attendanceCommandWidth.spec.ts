/**
 * ATTENDANCE COMMANDS SIZE TO THEIR LABELS, NOT TO THE CARD.
 *
 * Reported from the product: "Check in" and "Mark absent" stretched the full width of the Attendance
 * card, each taking half of it, so two controls read as one split bar.
 *
 * `ActionRow` renders What's Next's `helpful-row`, whose base rule is
 * `grid-template-columns: repeat(auto-fit, minmax(0, 1fr))` with `width: 100%` on each command. With
 * two commands that is two equal half-card tracks — the screenshot exactly.
 *
 * CSS cannot be certified by reading it, and a snapshot of the markup would have been green
 * throughout: the markup never changed. So this measures the real component in a real browser at
 * several authored card widths.
 */
import { expect, test, type Page } from "@playwright/test";

import { loadFixture } from "./harness";

const FIXTURE = "attendanceCommandWidthFixture.tsx";
const STYLES = ["app/adminV2/components/alloyOsRuntime.css", "app/adminV2/components/operationalCardsShared.css"];

/** Authored widths: the narrow panel column, the screenshot's width, and a wide composition. */
const WIDTHS = [360, 480, 640, 760] as const;

type Measurement = Awaited<ReturnType<typeof measure>>;

async function measure(page: Page) {
    return page.evaluate(() => window.__att.measure());
}

async function mount(page: Page, width: number): Promise<Measurement> {
    const errors = await loadFixture(page, FIXTURE, STYLES, 1200);
    await page.waitForFunction(() => document.querySelectorAll(".alloy-os-currentwork__helpful-row").length > 0);
    await page.evaluate((w) => window.__att.setCardWidth(w as number), width);
    await page.waitForFunction((w) => {
        const host = document.querySelector("[data-attendance-card-host]") as HTMLElement | null;
        return !!host && Math.abs(host.getBoundingClientRect().width - (w as number)) <= 1;
    }, width);
    expect(errors, "the fixture must mount without a page error").toEqual([]);
    return measure(page);
}

const report = (w: number, m: Measurement) =>
    `card ${w}px (measured ${m.card.width}), row ${m.row.width}, rows=${m.rows}\n`
    + m.commands.map((c) => `    ${c.label.padEnd(14)} w=${c.width} h=${c.height} x=[${c.left}..${c.right}] clipped=${c.clipped}`).join("\n");

test.describe("Attendance command width", () => {
    for (const width of WIDTHS) {
        test(`commands size to their labels at ${width}px`, async ({ page }) => {
            const m = await mount(page, width);

            expect(m.commands.map((c) => c.label), report(width, m)).toEqual(["Check in", "Mark absent"]);

            const total = m.commands.reduce((sum, c) => sum + c.width, 0);

            /*
             * THE DEFECT, STATED AS A MEASUREMENT.
             *
             * Two equal tracks spanning the card put the pair at essentially the full card width.
             * Sized to their labels they occupy a modest part of it. Two thirds is well clear of both
             * — the old behaviour measured at ~100% of the row, the new at well under half here.
             */
            expect(total, report(width, m)).toBeLessThan(m.row.width * 0.67);

            /*
             * AND NOT MERELY NARROWER — sized to the LABEL. Equal tracks give two identical widths
             * whatever the labels say, so two different labels producing two different widths is
             * what distinguishes label-sizing from a smaller share of the same grid.
             */
            const [checkIn, markAbsent] = m.commands;
            expect(Math.abs(checkIn!.width - markAbsent!.width), report(width, m)).toBeGreaterThan(1);
            expect(markAbsent!.width, report(width, m)).toBeGreaterThan(checkIn!.width);

            // One row, starting at the row's left edge — a control rail, not a centred pair.
            expect(m.rows, report(width, m)).toBe(1);
            expect(Math.abs(checkIn!.left - m.row.left), report(width, m)).toBeLessThanOrEqual(1);

            // Nothing is truncated, and the pair still share one height — unchanged from before.
            for (const c of m.commands) expect(c.clipped, report(width, m)).toBe(false);
            expect(Math.abs(checkIn!.height - markAbsent!.height), report(width, m)).toBeLessThanOrEqual(1);

            // Still inside the card it belongs to.
            expect(m.commands.at(-1)!.right, report(width, m)).toBeLessThanOrEqual(m.card.right + 1);
        });
    }
});
