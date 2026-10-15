/**
 * THE OPERATOR'S INTENT, AND THE SIGN IT BECOMES.
 *
 * ── THE DEFECT THESE LOCK ────────────────────────────────────────────────────────────────────
 *
 * The Adjustment panel asked for a "Type" — `credit` or `adjustment` — and then, only for
 * `adjustment`, a direction. The sign was:
 *
 *     const raises = adjustCategory === "adjustment" && adjustDirection === "increase";
 *     return raises ? cents : -cents;
 *
 * So `credit` + `increase` produced a REDUCTION. The direction the operator had just chosen was
 * discarded because the category outranked it, and nothing told them. Two controls for one
 * decision, disagreeing about which half won.
 *
 * Every assertion below is written so that restoring that formula fails it.
 */
import { describe, expect, it } from "vitest";

import {
    ADJUSTMENT_DIRECTIONS,
    adjustmentDirectionLabel,
    chargeCategoryForDirection,
    directionFromSignedCents,
    parseAdjustmentMagnitudeCents,
    signedCentsForIntent,
} from "@/lib/financials/corrections/correctionIntent";

describe("direction decides the sign, and nothing else does", () => {
    it("reduce is negative and increase is positive", () => {
        expect(signedCentsForIntent({ direction: "reduce", magnitudeCents: 2500 })).toBe(-2500);
        expect(signedCentsForIntent({ direction: "increase", magnitudeCents: 2500 })).toBe(2500);
    });

    /**
     * THE PLANT, EXACTLY AS IT WAS.
     *
     * The old formula is reproduced here against every (category, direction) pair the panel could
     * produce. Two of the four disagree with the operator's stated direction — and one of those
     * two is the common case, because `credit` was the default category.
     */
    it("the old category-outranks-direction formula was wrong for half its inputs", () => {
        const old = (category: "credit" | "adjustment", direction: "decrease" | "increase", cents: number) =>
            (category === "adjustment" && direction === "increase" ? cents : -cents);

        /* Where the two agreed. */
        expect(old("adjustment", "increase", 2500)).toBe(signedCentsForIntent({ direction: "increase", magnitudeCents: 2500 }));
        expect(old("credit", "decrease", 2500)).toBe(signedCentsForIntent({ direction: "reduce", magnitudeCents: 2500 }));

        /*
         * AND WHERE THEY DID NOT. An operator who chose "credit" and then said "increase" was
         * given a reduction. The canonical conversion cannot express this, because the category is
         * not one of its inputs.
         */
        expect(old("credit", "increase", 2500)).toBe(-2500);
        expect(signedCentsForIntent({ direction: "increase", magnitudeCents: 2500 })).toBe(2500);
        expect(old("credit", "increase", 2500)).not.toBe(
            signedCentsForIntent({ direction: "increase", magnitudeCents: 2500 }),
        );
    });

    it("the category is derived from the direction, never the reverse", () => {
        expect(chargeCategoryForDirection("reduce")).toBe("credit");
        expect(chargeCategoryForDirection("increase")).toBe("adjustment");
    });

    /** `discount` is authored policy's. A manual one would be indistinguishable from a configured one. */
    it("no direction reaches the discount category", () => {
        for (const direction of ADJUSTMENT_DIRECTIONS) {
            expect(chargeCategoryForDirection(direction)).not.toBe("discount");
        }
    });

    it("a magnitude must be a positive whole number of cents", () => {
        expect(() => signedCentsForIntent({ direction: "reduce", magnitudeCents: 0 })).toThrow();
        expect(() => signedCentsForIntent({ direction: "reduce", magnitudeCents: -2500 })).toThrow();
        expect(() => signedCentsForIntent({ direction: "reduce", magnitudeCents: 25.5 })).toThrow();
    });

    it("reading a signed amount back states the same direction", () => {
        for (const direction of ADJUSTMENT_DIRECTIONS) {
            const signed = signedCentsForIntent({ direction, magnitudeCents: 731 });
            expect(directionFromSignedCents(signed)).toBe(direction);
        }
    });
});

describe("the amount the operator types is absolute", () => {
    it("accepts money the way people write it", () => {
        expect(parseAdjustmentMagnitudeCents("25")).toBe(2500);
        expect(parseAdjustmentMagnitudeCents("25.00")).toBe(2500);
        expect(parseAdjustmentMagnitudeCents("$1,250.75")).toBe(125075);
        expect(parseAdjustmentMagnitudeCents(" 0.01 ")).toBe(1);
    });

    /**
     * A TYPED MINUS IS REFUSED, NOT ABSORBED.
     *
     * The old parser ran `Number.parseFloat` on the raw text, so `-25` parsed to `-25`, failed the
     * `<= 0` guard and returned null — which happened to be safe. Stripping the sign instead would
     * be worse: a `-25` typed into a field labelled "Increase what the family owes by" would be
     * silently honoured as an increase, which is the same contradiction in a new place.
     */
    it("refuses a typed sign rather than honouring or stripping it", () => {
        expect(parseAdjustmentMagnitudeCents("-25")).toBeNull();
        expect(parseAdjustmentMagnitudeCents("+25")).toBeNull();
    });

    it("nothing usable is null, never zero", () => {
        expect(parseAdjustmentMagnitudeCents("")).toBeNull();
        expect(parseAdjustmentMagnitudeCents("0")).toBeNull();
        expect(parseAdjustmentMagnitudeCents("0.00")).toBeNull();
        expect(parseAdjustmentMagnitudeCents("abc")).toBeNull();
        expect(parseAdjustmentMagnitudeCents("2.5.1")).toBeNull();
    });
});

describe("the labels an operator reads", () => {
    /**
     * NO SIGNED-CENTS REASONING, AND NO STORAGE VOCABULARY. This is the success condition's first
     * clause, asserted as text rather than left to review.
     */
    it("name what happens to what the family owes, and nothing else", () => {
        for (const direction of ADJUSTMENT_DIRECTIONS) {
            const label = adjustmentDirectionLabel(direction);
            expect(label).toMatch(/what the family owes/);
            expect(label).not.toMatch(/credit|adjustment|negative|positive|cents|[-+]/i);
        }
        expect(adjustmentDirectionLabel("reduce")).toBe("Reduce what the family owes");
        expect(adjustmentDirectionLabel("increase")).toBe("Increase what the family owes");
    });
});

describe("a malformed amount is not money", () => {
    /**
     * CAUGHT BY THIS SUITE, NOT BY REVIEW.
     *
     * The first parser filtered characters — digits and dots only — and then called
     * `Number.parseFloat`. `2.5.1` passes that filter, and `parseFloat` reads a PREFIX: it stopped
     * at the second dot and returned 2.5, so a typo became $2.50 of real money with nothing to
     * indicate the rest of the string had been thrown away. The shape is now matched in full.
     */
    it("a second decimal point is a refusal, not a prefix", () => {
        expect(parseAdjustmentMagnitudeCents("2.5.1")).toBeNull();
        expect(parseAdjustmentMagnitudeCents("25.00.00")).toBeNull();
        expect(parseAdjustmentMagnitudeCents("1.2.3.4")).toBeNull();
    });

    /** Cents are the unit. A third decimal place is an amount nobody can pay. */
    it("more precision than cents is refused rather than rounded", () => {
        expect(parseAdjustmentMagnitudeCents("25.005")).toBeNull();
        expect(parseAdjustmentMagnitudeCents("0.001")).toBeNull();
        expect(parseAdjustmentMagnitudeCents("25.1")).toBe(2510);
    });

    it("a trailing or leading dot is not an amount", () => {
        expect(parseAdjustmentMagnitudeCents("25.")).toBeNull();
        expect(parseAdjustmentMagnitudeCents(".25")).toBeNull();
        expect(parseAdjustmentMagnitudeCents(".")).toBeNull();
    });
});
