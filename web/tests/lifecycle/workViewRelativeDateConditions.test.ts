/**
 * DYNAMIC (RELATIVE) DATE CONDITIONS — the feature that already existed and had no tests.
 *
 * A Work View condition can already say "within the last 14 days" without anyone editing it again:
 * the value carries a relative token (`prev:14:days`, `next:1:months`) under `date_is`, the builder
 * writes it through a Previous/Next + amount + unit control, and the evaluator turns it into a span.
 *
 * Nothing pinned any of that. There were zero assertions on `next:`/`prev:` tokens anywhere, across a
 * builder-side parser, an independently written evaluator-side parser, and a summary formatter that
 * was looking for a `relative:` prefix nothing has ever written. A feature with no tests and three
 * hand-written readers of one format is a feature waiting to quietly stop working.
 */

import { describe, expect, it } from "vitest";
import {
    formatRelativeDateTokenLabel,
    parseRelativeDateToken,
    serializeRelativeDateToken,
} from "@/lib/lifecycle/workViewFilterValueControls";
import { evaluateWorkViewFiltersForRow } from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import { formatWorkViewConditionsSummary } from "@/lib/lifecycle/workViewEditorSummaries";

const daysAgo = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString();
};

const updatedWithinLast = (days: number) => [
    { field_key: "updated_at", operator: "date_is" as const, value: serializeRelativeDateToken("prev", days, "days") },
];

describe("the token round-trips through the builder's own helpers", () => {
    it("serializes and parses back to the same thing", () => {
        expect(serializeRelativeDateToken("prev", 14, "days")).toBe("prev:14:days");
        expect(parseRelativeDateToken("prev:14:days")).toEqual({ direction: "prev", amount: 14, unit: "days" });
    });

    it("rejects what is not a token, rather than half-reading it", () => {
        expect(parseRelativeDateToken("2026-07-30")).toBeNull();
        expect(parseRelativeDateToken("today")).toBeNull();
        expect(parseRelativeDateToken("relative:previous:14:days")).toBeNull();
    });
});

describe("the evaluator reads what the builder writes", () => {
    it("admits a row updated inside the window", () => {
        const r = evaluateWorkViewFiltersForRow({ updated_at: daysAgo(3) }, updatedWithinLast(14));
        expect(r.pass).toBe(true);
    });

    it("excludes a row that fell out of the window", () => {
        const r = evaluateWorkViewFiltersForRow({ updated_at: daysAgo(40) }, updatedWithinLast(14));
        expect(r.pass).toBe(false);
    });

    it("the window MOVES — the same saved condition means something different tomorrow", () => {
        // This is the whole point of a dynamic date: 20 days ago is out of a 14-day window and in a
        // 30-day one, with no edit to the view.
        const row = { updated_at: daysAgo(20) };
        expect(evaluateWorkViewFiltersForRow(row, updatedWithinLast(14)).pass).toBe(false);
        expect(evaluateWorkViewFiltersForRow(row, updatedWithinLast(30)).pass).toBe(true);
    });

    it("today is inside 'the last N days'", () => {
        expect(evaluateWorkViewFiltersForRow({ updated_at: daysAgo(0) }, updatedWithinLast(14)).pass).toBe(true);
    });

    it("a FUTURE-facing token does not admit a past row", () => {
        const next = [{ field_key: "updated_at", operator: "date_is" as const, value: "next:7:days" }];
        expect(evaluateWorkViewFiltersForRow({ updated_at: daysAgo(3) }, next).pass).toBe(false);
    });
});

describe("the operator can read back what they configured", () => {
    it("a relative token summarises in words, not as a raw token", () => {
        const summary = formatWorkViewConditionsSummary(updatedWithinLast(14));
        expect(summary).toContain(formatRelativeDateTokenLabel("prev:14:days")!);
        // The old formatter looked for a `relative:` prefix nothing writes, so this rendered as
        // "Prev:14:days" — a working condition that read as broken configuration.
        expect(summary).not.toContain("Prev:14:days");
    });

    it("a fixed date is still summarised as itself", () => {
        expect(
            formatWorkViewConditionsSummary([
                { field_key: "updated_at", operator: "date_is", value: "2026-07-30" },
            ]),
        ).toContain("2026-07-30");
    });
});
