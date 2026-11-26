/**
 * One phone formatter, one phone input. Storage stays canonical E.164; these are presentation only.
 */
import { describe, expect, it } from "vitest";

import { nextPhoneValue, phoneInputDisplay } from "@/components/ui/PhoneInput";
import { formatPhoneUS } from "@/lib/adminFormatters";
import { formatPhoneAsTyped, formatPhoneDisplay, isPhoneField, phoneValueFromTyped } from "@/lib/phone/phonePresentation";

describe("formatPhoneDisplay", () => {
    it("10-digit US, 11-digit with 1, and +1 E.164 read as (555) 888-9965", () => {
        for (const v of ["5558889965", "15558889965", "+15558889965", "(555) 888-9965", "555.888.9965"]) {
            expect(formatPhoneDisplay(v)).toBe("(555) 888-9965");
        }
    });
    it("international numbers keep their + and are never cut to a US number", () => {
        expect(formatPhoneDisplay("+442071234567")).toBe("+442071234567");
        expect(formatPhoneUS("+442071234567")).toBe("+442071234567");
    });
    it("partial and invalid text is shown as typed; empty is a dash", () => {
        expect(formatPhoneDisplay("555-1234")).toBe("555-1234");
        expect(formatPhoneDisplay("call me")).toBe("call me");
        expect(formatPhoneDisplay("")).toBe("—");
        expect(formatPhoneDisplay(null)).toBe("—");
    });
});

describe("typing a phone", () => {
    it("builds the US shape progressively", () => {
        expect(formatPhoneAsTyped("5")).toBe("(5");
        expect(formatPhoneAsTyped("5558")).toBe("(555) 8");
        expect(formatPhoneAsTyped("5558889965")).toBe("(555) 888-9965");
        expect(formatPhoneAsTyped("555888996512")).toBe("(555) 888-9965");
    });
    it("emits canonical E.164 only once the number is complete", () => {
        expect(phoneValueFromTyped("(555) 888-996")).toBe("(555) 888-996");
        expect(phoneValueFromTyped("(555) 888-9965")).toBe("+15558889965");
        expect(phoneValueFromTyped("+44 20 7123 4567")).toBe("+442071234567");
        expect(phoneValueFromTyped("")).toBe("");
    });
    it("the input shows a stored E.164 value formatted, and backspacing over punctuation removes a digit", () => {
        expect(phoneInputDisplay("+15558889965")).toBe("(555) 888-9965");
        expect(phoneInputDisplay("5558889965")).toBe("(555) 888-9965");
        expect(nextPhoneValue("(555) 8", "(555) ")).toBe("(555");
        // Deleting only the "-" would leave the digits unchanged; the digit before it goes instead.
        expect(nextPhoneValue("(555) 888-9965", "(555) 8889965")).toBe("(555) 888-996");
        expect(nextPhoneValue("(555) 888-9965", "(555) 888-996")).toBe("(555) 888-996");
        expect(nextPhoneValue("", "5558889965")).toBe("+15558889965");
    });
});

describe("isPhoneField", () => {
    it("recognises phone fields by key, id, Forms pattern or label — and not by accident", () => {
        expect(isPhoneField({ fieldKey: "phone" })).toBe(true);
        expect(isPhoneField({ id: "parent_mobile" })).toBe(true);
        expect(isPhoneField({ id: "contact_tel" })).toBe(true);
        expect(isPhoneField({ pattern: "^[+0-9()\\-\\s]{7,}$" })).toBe(true);
        expect(isPhoneField({ label: "Cell phone" })).toBe(true);
        expect(isPhoneField({ id: "hotel_name", label: "Hotel" })).toBe(false);
        expect(isPhoneField({ fieldKey: "email", label: "Email" })).toBe(false);
    });
});
