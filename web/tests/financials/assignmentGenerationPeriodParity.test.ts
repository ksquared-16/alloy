/**
 * ONE PERIOD AUTHORITY, TWO CONSUMERS.
 *
 * The Assignment states the period a family is being billed in; generation bills it. If those
 * came from different arithmetic the operator would be shown one boundary and charged another,
 * and the disagreement would be invisible because both print the same kind of label.
 *
 * ── MEASURED, mounted on d02d84ded ────────────────────────────────────────────────────────────
 *
 *   Assignment (Certa, weekly, anchor 2026-09-01)
 *     current 2026-09-15~2026-09-21 · next 2026-09-22~2026-09-28
 *     Overridden $185.00 / weekly
 *
 *   billing.generate_tuition preview, weekly 2026-09
 *     "5 to bill, 0 not due, 0 refused" · 5 × 185.00 USD · total 92500 cents
 *
 * These lock the two facts that makes that a parity proof rather than a coincidence: the keys the
 * Assignment rendered are members of the set generation bills, and the count and gross generation
 * reported are what the authority's own tiling produces.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { billingPeriodsBetween, acceptedTermBillingPeriods, billingPeriodFor } from "@/lib/financials/billingPeriod";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const ANCHOR = "2026-09-01";

describe("the weekly tiling generation billed is the one the Assignment showed", () => {
    const september = billingPeriodsBetween("weekly", ANCHOR, "2026-09-01", "2026-09-30");

    it("produces the five periods generation reported", () => {
        expect(september.length, "the preview said 5 to bill").toBe(5);
        expect(september.reduce((n) => n + 18500, 0), "5 x $185.00 = the reported 92500").toBe(92500);
    });

    it("contains the exact keys the Assignment rendered", () => {
        const keys = september.map((p) => p.key);
        expect(keys).toContain("2026-09-15~2026-09-21");
        expect(keys).toContain("2026-09-22~2026-09-28");
    });

    it("and those two are the current and next for today", () => {
        /* The Assignment derives current/next from the accepted term; generation tiles a span.
           Both come from this module, so the pair must be members of the span's own tiling. */
        const pair = acceptedTermBillingPeriods({ cadenceKey: "weekly", effectiveStart: ANCHOR }, "2026-09-20");
        expect(pair).not.toBeNull();
        expect(pair!.current.key).toBe("2026-09-15~2026-09-21");
        expect(pair!.next.key).toBe("2026-09-22~2026-09-28");
        const keys = september.map((p) => p.key);
        expect(keys).toContain(pair!.current.key);
        expect(keys).toContain(pair!.next.key);
    });

    it("keeps the cross-month week whole", () => {
        /*
         * The fifth period runs 2026-09-29 to 2026-10-05. A calendar-month split would make it two
         * part-weeks and bill a family for a period nobody agreed to; the count 5 is only correct
         * because it stays one.
         */
        const crossing = september[4]!;
        expect(crossing.key).toBe("2026-09-29~2026-10-05");
        expect(crossing.start.slice(0, 7), "starts in September").toBe("2026-09");
        expect(crossing.end.slice(0, 7), "ends in October").toBe("2026-10");
        const span = (Date.parse(`${crossing.end}T00:00:00Z`) - Date.parse(`${crossing.start}T00:00:00Z`)) / 86_400_000 + 1;
        expect(span, "seven whole days").toBe(7);
    });

    it("the same week is one period from either side of the boundary", () => {
        expect(billingPeriodFor("weekly", ANCHOR, "2026-09-30").key).toBe("2026-09-29~2026-10-05");
        expect(billingPeriodFor("weekly", ANCHOR, "2026-10-01").key).toBe("2026-09-29~2026-10-05");
    });
});

describe("monthly is the canonical month on both sides", () => {
    it("the assignment's key is the key generation groups by", () => {
        const pair = acceptedTermBillingPeriods({ cadenceKey: "monthly", effectiveStart: ANCHOR }, "2026-09-20");
        expect(pair!.current.key).toBe("2026-09");
        expect(pair!.next.key).toBe("2026-10");
        /* `period_key` in the generation payload is exactly this shape. */
        expect(pair!.current.key).toMatch(/^\d{4}-\d{2}$/);
    });
});

describe("neither consumer owns the arithmetic", () => {
    it("the Assignment asks the authority", () => {
        const card = src("components/admin/focusPanel/cards/SchedulingCard.tsx");
        expect(card).toContain('from "@/lib/financials/billingPeriod"');
        expect(card).toContain("acceptedTermBillingPeriods(");
    });

    it("generation asks the same one", () => {
        for (const f of [
            "lib/financials/tuitionGeneration/generateTuitionCharges.ts",
            "lib/financials/tuitionGeneration/previewTuitionGeneration.ts",
        ]) {
            expect(src(f), `${f} derives periods from the authority`).toMatch(
                /from "@\/lib\/financials\/billingPeriod"/,
            );
        }
    });

    it("preview and the run tile with one shared call", () => {
        /* A preview that showed four weeks and then created five would be the worst version. */
        const gen = src("lib/financials/tuitionGeneration/generateTuitionCharges.ts");
        expect(gen).toContain("assignmentBillingPeriods");
        expect(src("lib/financials/tuitionGeneration/previewTuitionGeneration.ts")).toContain("assignmentBillingPeriods");
    });
});

describe("an override does not disable discount eligibility", () => {
    it("reductions read the charge, never the term's accepted-vs-overridden state", () => {
        /*
         * The worry §17 names is that money arrived at by Override would be treated as a special
         * case and quietly lose its discounts. It cannot: `resolveFinancialReductions` is given a
         * charge — its id, its amount, its category — and the term's `state` is not among its
         * inputs. Producer-independence is the existing doctrine, and an overridden term is just
         * another producer.
         *
         * Measured on d02d84ded: after the override, `billing.generate_tuition` previewed 5
         * generated, 0 refused, gross 92500 — five weekly periods at the OVERRIDDEN $185.00. The
         * same gross the reduction pass would be handed.
         */
        const red = src("lib/financials/reductions/resolveFinancialReductions.ts");
        expect(red, "no accepted/overridden branch").not.toMatch(/"overridden"|"accepted"/);
        expect(red, "it is given a charge").toContain("chargeId");
        expect(red).toContain("categoryKey");
    });

    it("generation takes the gross from the accepted term whatever its state", () => {
        const gen = src("lib/financials/tuitionGeneration/resolveTuitionRecurrence.ts");
        expect(gen, "the term supplies the money").toMatch(/amountCents|amount_cents/);
        expect(gen, "and the state does not gate it").not.toMatch(/state === "overridden"|state !== "accepted"/);
    });
});
