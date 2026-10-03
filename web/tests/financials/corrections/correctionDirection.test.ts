/**
 * DIRECTION IS STATED, NEVER INFERRED FROM A WORD.
 *
 * The preflight established that a positive amount truthfully INCREASES what the family owes, and
 * that the category word does not imply a sign — "credit" with a positive amount raises the
 * balance, which is certified behaviour rather than a bug. That makes signed cents a correct
 * internal representation and a terrible thing to ask an operator to decode.
 *
 * These cases bind the translation: one direction per sign, a sentence that names what happens to
 * what the family owes, and canonical signed semantics left untouched underneath.
 */
import { describe, expect, it } from "vitest";

import {
    correctionDirection,
    correctionDirectionSentence,
} from "@/lib/financials/corrections/prospectiveCorrection";

describe("correction direction", () => {
    it("reads the SIGN, not the category word", () => {
        expect(correctionDirection(-2_500)).toBe("reduces");
        expect(correctionDirection(2_500)).toBe("increases");
        /* One cent either side of zero still has a direction. */
        expect(correctionDirection(-1)).toBe("reduces");
        expect(correctionDirection(1)).toBe("increases");
    });

    it("says what happens to what the family owes, in money not cents", () => {
        expect(correctionDirectionSentence(-2_500)).toBe("Reduces what the family owes by $25.00");
        expect(correctionDirectionSentence(2_500)).toBe("Increases what the family owes by $25.00");
    });

    it("never shows a negative number to an operator — the magnitude is absolute", () => {
        /*
         * "Reduces what the family owes by -$25.00" is the bug this prevents: a minus sign in a
         * sentence that already says the direction reads as a double negative.
         */
        for (const cents of [-1, -99, -2_500, -100_000]) {
            const sentence = correctionDirectionSentence(cents);
            expect(sentence).not.toContain("-$");
            expect(sentence).not.toContain("−$");
            expect(sentence.startsWith("Reduces")).toBe(true);
        }
    });

    it("formats sub-dollar and large amounts the way an operator reads money", () => {
        expect(correctionDirectionSentence(-5)).toBe("Reduces what the family owes by $0.05");
        expect(correctionDirectionSentence(-50)).toBe("Reduces what the family owes by $0.50");
        expect(correctionDirectionSentence(107_500)).toBe("Increases what the family owes by $1075.00");
    });

    it("the two halves agree: the sentence always matches the direction", () => {
        for (const cents of [-100_000, -2_500, -1, 1, 2_500, 100_000]) {
            const expected = correctionDirection(cents) === "reduces" ? "Reduces" : "Increases";
            expect(correctionDirectionSentence(cents).startsWith(expected)).toBe(true);
        }
    });
});
