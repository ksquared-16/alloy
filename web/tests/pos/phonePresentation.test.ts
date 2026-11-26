/**
 * A phone is stored as ten digits and read as a phone number.
 *
 * The normalizer is right to keep `5415551234` — one canonical string, no punctuation to disagree
 * about. That is a storage decision, and it was reaching the parent verbatim.
 */
import { describe, it, expect } from "vitest";
import { displayValue } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { formatValueForDocumentDestination } from "@/lib/forms/pdf/documentDestinationDate";
import { normalizePhoneDigits, formatPhoneDisplay } from "@/lib/intake/normalize/phone";

describe("one stored value, formatted where it is read", () => {
    it("shows the parent a phone number, not a serial", () => {
        expect(displayValue("5415551234")).toBe("(541) 555-1234");
    });

    it("prints a phone number on the document too", () => {
        expect(formatValueForDocumentDestination("5415551234")).toBe("(541) 555-1234");
    });

    it("never creates a second stored representation", () => {
        // Storage stays canonical: formatting is a read, and normalizing the formatted form returns
        // exactly what was stored.
        const stored = normalizePhoneDigits("(541) 555-1234");
        expect(stored).toBe("5415551234");
        expect(normalizePhoneDigits(formatPhoneDisplay(stored))).toBe(stored);
    });

    it("leaves anything that is not ten digits alone", () => {
        // A date is excluded deliberately: `displayValue` already turns "2021-04-02" into
        // "Apr 2, 2021", which is existing and wanted behaviour — the phone rule must not disturb it.
        for (const v of ["541555123", "54155512345", "Not applicable", "five four one"]) {
            expect(displayValue(v)).toBe(v);
        }
    });

    it("does not coerce a phone back to a number", () => {
        expect(typeof displayValue("5415551234")).toBe("string");
        expect(typeof formatValueForDocumentDestination("5415551234")).toBe("string");
    });

    it("still formats a date at its destination", () => {
        expect(formatValueForDocumentDestination("2021-04-02")).toBe("04/02/2021");
    });
});
