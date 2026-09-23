/**
 * ONE PHONE NUMBER, ONE READING.
 *
 * Human QA, on one card, one line apart:
 *
 *     Corinne Vasquez   (541) 555-7788      ← known, stored with punctuation
 *     Farrah Nolan      3213525132          ← typed a moment earlier
 *
 * Neither value was wrong. Nothing was formatting either of them, and the family could see that the
 * two contacts had come from different places — which is exactly the seam a participant surface is
 * supposed to hide.
 *
 * The other half of this module is the one that had teeth: `formatPhoneUS` formatted the LAST ten
 * digits of anything, so a London number printed as an Oregon one with nothing to signal it.
 */

import { describe, expect, it } from "vitest";

import {
    fieldMeansPhone,
    formatPhoneAsTyped,
    formatPhoneNumber,
    isFormattablePhoneNumber,
    phoneStorageValue,
} from "@/lib/format/phoneNumber";
import { formatPhoneUS } from "@/lib/adminFormatters";
import { formatPhoneDisplay } from "@/lib/intake/normalize/phone";
import { displayValue } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { formatValueForDocumentDestination } from "@/lib/forms/pdf/documentDestinationDate";

describe("display", () => {
    it("reads ten stored digits as a phone number", () => {
        expect(formatPhoneNumber("5415557788")).toBe("(541) 555-7788");
    });

    it("reads every shape the platform stores a NANP number in", () => {
        for (const stored of ["5415557788", "15415557788", "+15415557788", "(541) 555-7788", "541-555-7788", "541.555.7788"]) {
            expect(formatPhoneNumber(stored), `${stored} did not read as a phone number`).toBe("(541) 555-7788");
        }
    });

    it("leaves an international number exactly as it was given", () => {
        // The bug this replaces rendered it "(207) 183-8750" — a London number shown as Oregon.
        expect(formatPhoneNumber("+442071838750")).toBe("+442071838750");
        expect(formatPhoneNumber("+33 1 42 68 53 00")).toBe("+33 1 42 68 53 00");
        expect(isFormattablePhoneNumber("+442071838750")).toBe(false);
    });

    it("leaves anything that is not a phone number alone", () => {
        expect(formatPhoneNumber("Corinne Vasquez")).toBe("Corinne Vasquez");
        expect(formatPhoneNumber("2021-04-02")).toBe("2021-04-02");
        expect(formatPhoneNumber("")).toBe("");
        expect(formatPhoneNumber(null)).toBe("");
    });
});

describe("every surface formats through the one primitive", () => {
    it("the participant conversation does", () => {
        expect(displayValue("5415557788")).toBe("(541) 555-7788");
        expect(displayValue("+15415557788")).toBe("(541) 555-7788");
    });

    it("the generated document destination does", () => {
        expect(formatValueForDocumentDestination("5415557788")).toBe("(541) 555-7788");
        expect(formatValueForDocumentDestination("+15415557788")).toBe("(541) 555-7788");
        // A stored date still formats as a date; the phone rule must not swallow it.
        expect(formatValueForDocumentDestination("2021-04-02")).toBe("04/02/2021");
    });

    it("the intake formatter does", () => {
        expect(formatPhoneDisplay("5415557788")).toBe("(541) 555-7788");
        expect(formatPhoneDisplay("+15415557788")).toBe("(541) 555-7788");
    });

    it("the operator formatter does, and keeps its own empty reading", () => {
        expect(formatPhoneUS("5415557788")).toBe("(541) 555-7788");
        expect(formatPhoneUS("+15415557788")).toBe("(541) 555-7788");
        expect(formatPhoneUS("")).toBe("—");
        expect(formatPhoneUS(null)).toBe("—");
        expect(formatPhoneUS("+442071838750")).toBe("+442071838750");
    });

    it("a known phone and a typed phone read identically", () => {
        const known = "+15415557788"; // as a canonical writer stored it
        const typed = phoneStorageValue("5415557788"); // as the family typed it
        expect(displayValue(known)).toBe(displayValue(typed));
        expect(formatValueForDocumentDestination(known)).toBe(formatValueForDocumentDestination(typed));
    });
});

describe("input", () => {
    it("formats US digits as they are typed", () => {
        expect(formatPhoneAsTyped("5")).toBe("5");
        expect(formatPhoneAsTyped("541")).toBe("541");
        expect(formatPhoneAsTyped("5415")).toBe("(541) 5");
        expect(formatPhoneAsTyped("541555")).toBe("(541) 555");
        expect(formatPhoneAsTyped("5415557788")).toBe("(541) 555-7788");
    });

    it("never traps a backspace on a separator", () => {
        // What the box holds after each backspace, re-derived from the digits every time.
        expect(formatPhoneAsTyped("(541) 555-778")).toBe("(541) 555-778");
        expect(formatPhoneAsTyped("(541) 5")).toBe("(541) 5");
        expect(formatPhoneAsTyped("(541)")).toBe("541");
        expect(formatPhoneAsTyped("54")).toBe("54");
        expect(formatPhoneAsTyped("")).toBe("");
    });

    it("accepts a pasted number in any shape", () => {
        for (const pasted of ["+1 (541) 555-7788", "541.555.7788", "1-541-555-7788", "541 555 7788"]) {
            expect(formatPhoneAsTyped(pasted), pasted).toBe("(541) 555-7788");
        }
    });

    it("does not corrupt an international value being typed or pasted", () => {
        expect(formatPhoneAsTyped("+442071838750")).toBe("+442071838750");
        expect(formatPhoneAsTyped("+44 20 7183 8750")).toBe("+44 20 7183 8750");
        // More digits than a NANP number holds is left alone rather than truncated to ten.
        expect(formatPhoneAsTyped("0207183875012")).toBe("0207183875012");
    });

    it("stores the canonical digits, never the brackets", () => {
        expect(phoneStorageValue("(541) 555-7788")).toBe("5415557788");
        expect(phoneStorageValue("+1 541 555 7788")).toBe("5415557788");
        // A partial number is kept as typed: the mask is not a validator.
        expect(phoneStorageValue("(541) 5")).toBe("(541) 5");
        // An international number keeps its country code — E.164 is not ten digits.
        expect(phoneStorageValue("+442071838750")).toBe("+442071838750");
    });

    it("round-trips: what is stored formats back to what was shown", () => {
        const shown = formatPhoneAsTyped("5415557788");
        expect(formatPhoneNumber(phoneStorageValue(shown))).toBe(shown);
    });
});

describe("which questions mean phone", () => {
    it("takes the canonical binding first", () => {
        expect(fieldMeansPhone({ fieldKey: "phone", label: "Best number for pickup" })).toBe(true);
        expect(fieldMeansPhone({ fieldKey: "mobile_phone", label: "Reach them on" })).toBe(true);
    });

    it("falls back to the label only when nothing is bound", () => {
        expect(fieldMeansPhone({ label: "Phone" })).toBe(true);
        expect(fieldMeansPhone({ label: "Cell number" })).toBe(true);
        expect(fieldMeansPhone({ label: "Relationship to the child" })).toBe(false);
        expect(fieldMeansPhone({ fieldKey: "full_name", label: "Full name" })).toBe(false);
    });
});
